-- P2C parallel replay: two sessions send the same contact intent (same key) at once.
-- Commits fixtures (dblink sessions cannot see uncommitted rows); cleans up at the end.
-- Run: supabase/tests/local/run.sh "$PWD" /repo/tests/application_follow_up_concurrency.test.sql
\set ON_ERROR_STOP 1
CREATE EXTENSION IF NOT EXISTS dblink;
SELECT set_config('test.uid', gen_random_uuid()::text, false);
SELECT set_config('test.app', gen_random_uuid()::text, false);
INSERT INTO auth.users(id) VALUES (current_setting('test.uid')::uuid);
INSERT INTO public.profiles(id,role,has_permission,plan) VALUES (current_setting('test.uid')::uuid,'user',true,'free');
INSERT INTO public.applications(id,user_id,idempotency_key,language,status) VALUES (current_setting('test.app')::uuid, current_setting('test.uid')::uuid, gen_random_uuid(), 'vi', 'applied');

-- Runs `call_a` in c1 (held open) and `call_b` in c2 concurrently; returns both results.
CREATE FUNCTION pg_temp.race(call_a text, call_b text, OUT r1 jsonb, OUT r2 jsonb) LANGUAGE plpgsql AS $$
DECLARE
 uid text := current_setting('test.uid');
 conn text := 'host=/tmp/pg user=postgres dbname=postgres';
 setup text := format($s$SELECT set_config('request.jwt.claims', %L, false), set_config('request.jwt.claim.sub', %L, false), set_config('request.jwt.claim.role', 'authenticated', false)$s$,
   json_build_object('sub',uid,'role','authenticated')::text, uid);
BEGIN
 PERFORM dblink_connect('c1', conn); PERFORM dblink_connect('c2', conn);
 PERFORM 1 FROM unnest(ARRAY['c1','c2']) c, dblink(c, setup) AS t(a text, b text, r text);
 PERFORM dblink_exec(c, 'SET ROLE authenticated') FROM unnest(ARRAY['c1','c2']) c;
 PERFORM dblink_exec('c1', 'BEGIN');
 SELECT v::jsonb INTO r1 FROM dblink('c1', call_a) AS t(v text);
 PERFORM dblink_send_query('c2', call_b);
 PERFORM pg_sleep(0.3);
 ASSERT dblink_is_busy('c2') = 1, 'second call did not wait for the first';
 PERFORM dblink_exec('c1', 'COMMIT');
 SELECT v::jsonb INTO r2 FROM dblink_get_result('c2') AS t(v text);
 PERFORM dblink_disconnect('c1'); PERFORM dblink_disconnect('c2');
END $$;

DO $$
DECLARE
 app text := current_setting('test.app');
 k text := '00000000-0000-4000-8000-0000000000c1';
 r record;
BEGIN
 -- Same contact intent twice; the second carries a different note and type.
 SELECT * INTO r FROM pg_temp.race(
   format($c$SELECT public.log_application_contact(%L, 'follow_up_sent', NULL, 'note A', %L)::text$c$, app, k),
   format($c$SELECT public.log_application_contact(%L, 'contact_received', NULL, 'note B', %L)::text$c$, app, k));
 ASSERT NOT (r.r1->>'replayed')::boolean, 'first contact replayed';
 ASSERT (r.r2->>'replayed')::boolean AND r.r2->>'event_id' = r.r1->>'event_id', format('parallel contact not idempotent: %s / %s', r.r1, r.r2);
 ASSERT (SELECT count(*) FROM public.application_events WHERE application_id = app::uuid) = 1, 'parallel contact duplicated';
 ASSERT (SELECT event_type = 'follow_up_sent' AND note = 'note A' FROM public.application_events WHERE application_id = app::uuid), 'parallel contact overwritten';

 -- Contact intent racing a note intent with the same key (shared key space): one event.
 k := '00000000-0000-4000-8000-0000000000c2';
 SELECT * INTO r FROM pg_temp.race(
   format($c$SELECT public.add_application_note(%L, 'note first', %L)::text$c$, app, k),
   format($c$SELECT public.log_application_contact(%L, 'follow_up_sent', NULL, NULL, %L)::text$c$, app, k));
 ASSERT (r.r2->>'replayed')::boolean AND r.r2->>'event_id' = r.r1->>'event_id', 'parallel note/contact key not shared';
 ASSERT (SELECT count(*) FROM public.application_events WHERE application_id = app::uuid) = 2, 'parallel note/contact duplicated';

 -- Contact racing a transition to a final status: the contact re-reads status under the row lock.
 BEGIN
  SELECT * INTO r FROM pg_temp.race(
    format($c$SELECT public.transition_application_status(%L, 'applied', 'rejected', NULL, NULL, gen_random_uuid())::text$c$, app),
    format($c$SELECT public.log_application_contact(%L, 'follow_up_sent', NULL, NULL, gen_random_uuid())::text$c$, app));
  RAISE EXCEPTION 'contact after parallel final transition succeeded';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE '%contact_not_allowed%' THEN RAISE; END IF;
  PERFORM dblink_disconnect(c) FROM unnest(dblink_get_connections()) c;
 END;
 ASSERT (SELECT count(*) FROM public.application_events WHERE application_id = app::uuid AND event_type = 'follow_up_sent') = 1, 'contact written after final';
END $$;

DELETE FROM auth.users WHERE id = current_setting('test.uid')::uuid;
SELECT 1 FROM public.application_events WHERE user_id = current_setting('test.uid')::uuid HAVING count(*) > 0;
