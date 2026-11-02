-- P2B parallel replay: two sessions send the same tracker intent (same key) at once.
-- Commits fixtures (dblink sessions cannot see uncommitted rows); cleans up at the end.
-- Run: supabase/tests/local/run.sh "$PWD" /repo/tests/application_tracker_concurrency.test.sql
\set ON_ERROR_STOP 1
CREATE EXTENSION IF NOT EXISTS dblink;
SELECT set_config('test.uid', gen_random_uuid()::text, false);
SELECT set_config('test.app', gen_random_uuid()::text, false);
INSERT INTO auth.users(id) VALUES (current_setting('test.uid')::uuid);
INSERT INTO public.profiles(id,role,has_permission,plan) VALUES (current_setting('test.uid')::uuid,'user',true,'free');
INSERT INTO public.applications(id,user_id,idempotency_key,language) VALUES (current_setting('test.app')::uuid, current_setting('test.uid')::uuid, gen_random_uuid(), 'vi');

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
 k text := '00000000-0000-4000-8000-0000000000a1';
 r record; n integer; v text;
BEGIN
 -- Same transition intent twice; the second carries a changed payload (no_response).
 SELECT * INTO r FROM pg_temp.race(
   format($c$SELECT public.transition_application_status(%L, 'drafted', 'applied', NULL, NULL, %L)::text$c$, app, k),
   format($c$SELECT public.transition_application_status(%L, 'drafted', 'withdrawn', NULL, 'B', %L)::text$c$, app, k));
 ASSERT NOT (r.r1->>'replayed')::boolean, 'first transition replayed';
 ASSERT (r.r2->>'replayed')::boolean AND r.r2->>'event_id' = r.r1->>'event_id', format('parallel transition not idempotent: %s / %s', r.r1, r.r2);
 SELECT count(*) INTO n FROM public.application_events WHERE application_id = app::uuid;
 ASSERT n = 1, format('parallel transition wrote %s events', n);
 ASSERT (SELECT status FROM public.applications WHERE id = app::uuid) = 'applied', 'parallel replay changed status';

 -- Same note intent twice.
 k := '00000000-0000-4000-8000-0000000000a2';
 SELECT * INTO r FROM pg_temp.race(
   format($c$SELECT public.add_application_note(%L, 'note A', %L)::text$c$, app, k),
   format($c$SELECT public.add_application_note(%L, 'note B', %L)::text$c$, app, k));
 ASSERT (r.r2->>'replayed')::boolean AND r.r2->>'event_id' = r.r1->>'event_id', 'parallel note not idempotent';
 ASSERT (SELECT count(*) FROM public.application_events WHERE application_id = app::uuid AND event_type='note') = 1, 'parallel note duplicated';
 ASSERT (SELECT note FROM public.application_events WHERE application_id = app::uuid AND event_type='note') = 'note A', 'parallel note overwritten';

 -- Same details intent twice (both based on the same row version).
 k := '00000000-0000-4000-8000-0000000000a3';
 SELECT updated_at::text INTO v FROM public.applications WHERE id = app::uuid;
 SELECT * INTO r FROM pg_temp.race(
   format($c$SELECT public.update_application_details(%L, %L, 'Acme', NULL, NULL, %L)::text$c$, app, v, k),
   format($c$SELECT public.update_application_details(%L, %L, 'Other', NULL, NULL, %L)::text$c$, app, v, k));
 ASSERT (r.r2->>'replayed')::boolean AND r.r2->>'event_id' = r.r1->>'event_id', 'parallel details not idempotent';
 ASSERT (SELECT company_name FROM public.applications WHERE id = app::uuid) = 'Acme', 'parallel details overwritten';

 -- Different intents racing on one application: the stale one gets stale_status, not a silent overwrite.
 BEGIN
  SELECT * INTO r FROM pg_temp.race(
    format($c$SELECT public.transition_application_status(%L, 'applied', 'interview', NULL, NULL, gen_random_uuid())::text$c$, app),
    format($c$SELECT public.transition_application_status(%L, 'applied', 'rejected', NULL, NULL, gen_random_uuid())::text$c$, app));
  RAISE EXCEPTION 'stale parallel transition succeeded';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE '%stale_status%' THEN RAISE; END IF;
  PERFORM dblink_disconnect(c) FROM unnest(dblink_get_connections()) c;
 END;
 ASSERT (SELECT status FROM public.applications WHERE id = app::uuid) = 'interview', 'stale parallel transition overwrote';
 ASSERT (SELECT count(*) FROM public.application_events WHERE application_id = app::uuid AND event_type='status_changed') = 2, 'stale parallel transition wrote an event';
END $$;

-- Two different details edits based on the same row version: one wins, the loser is stale.
DO $$
DECLARE
 app text := current_setting('test.app');
 v text; r record;
BEGIN
 SELECT updated_at::text INTO v FROM public.applications WHERE id = app::uuid;
 BEGIN
  SELECT * INTO r FROM pg_temp.race(
    format($c$SELECT public.update_application_details(%L, %L, 'Winner', NULL, NULL, gen_random_uuid())::text$c$, app, v),
    format($c$SELECT public.update_application_details(%L, %L, 'Loser', NULL, NULL, gen_random_uuid())::text$c$, app, v));
  RAISE EXCEPTION 'stale parallel details edit succeeded';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE '%stale_application%' THEN RAISE; END IF;
  PERFORM dblink_disconnect(c) FROM unnest(dblink_get_connections()) c;
 END;
 ASSERT (SELECT company_name FROM public.applications WHERE id = app::uuid) = 'Winner', 'loser overwrote winner';
 ASSERT (SELECT count(*) FROM public.application_events WHERE application_id = app::uuid AND event_type='details_updated'
   AND metadata->'company_name'->>'to' = 'Loser') = 0, 'loser wrote an event';
END $$;

DELETE FROM auth.users WHERE id = current_setting('test.uid')::uuid;
SELECT 1 FROM public.application_events WHERE user_id = current_setting('test.uid')::uuid HAVING count(*) > 0;
