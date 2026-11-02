-- P2A parallel replay: two sessions save with the same idempotency key at once.
-- Commits fixtures (dblink sessions cannot see uncommitted rows); cleans up at the end.
-- Run: supabase/tests/local/run.sh "$PWD" /repo/tests/applications_concurrency.test.sql
\set ON_ERROR_STOP 1
CREATE EXTENSION IF NOT EXISTS dblink;
SELECT set_config('test.uid', gen_random_uuid()::text, false);
INSERT INTO auth.users(id) VALUES (current_setting('test.uid')::uuid);
INSERT INTO public.profiles(id,role,has_permission,plan) VALUES (current_setting('test.uid')::uuid,'user',true,'free');

DO $$
DECLARE
 uid text := current_setting('test.uid');
 conn text := 'host=/tmp/pg user=postgres dbname=postgres';
 setup text := format($s$SELECT set_config('request.jwt.claims', %L, false), set_config('request.jwt.claim.sub', %L, false), set_config('request.jwt.claim.role', 'authenticated', false)$s$,
   json_build_object('sub',uid,'role','authenticated')::text, uid);
 call text := $c$SELECT public.save_application('00000000-0000-4000-8000-000000000001'::uuid, 'analysis-x', 'vi', 'Role', NULL,
   '{"personal_information":{"full_name":"%s"}}'::jsonb, 'cv.pdf', '%s', '{"matchScore":1,"requirements":[]}'::jsonb, %s, %s)::text$c$;
 r1 jsonb; r2 jsonb; n integer;
BEGIN
 PERFORM dblink_connect('c1', conn); PERFORM dblink_connect('c2', conn);
 PERFORM 1 FROM unnest(ARRAY['c1','c2']) c, dblink(c, setup) AS t(a text, b text, r text);
 PERFORM dblink_exec(c, 'SET ROLE authenticated') FROM unnest(ARRAY['c1','c2']) c;
 -- c1 inserts and holds its transaction open; c2 must block on the unique key.
 PERFORM dblink_exec('c1', 'BEGIN');
 SELECT v::jsonb INTO r1 FROM dblink('c1', format(call, 'A', 'JD A', 'NULL', 'NULL')) AS t(v text);
 PERFORM dblink_send_query('c2', format(call, 'B', 'JD B', quote_literal('Letter B'), quote_literal('en')));
 PERFORM pg_sleep(0.3);
 ASSERT dblink_is_busy('c2') = 1, 'second save did not wait for the first';
 PERFORM dblink_exec('c1', 'COMMIT');
 SELECT v::jsonb INTO r2 FROM dblink_get_result('c2') AS t(v text);
 PERFORM dblink_disconnect('c1'); PERFORM dblink_disconnect('c2');

 ASSERT (r1->>'created')::boolean, 'first parallel save not created';
 ASSERT r2->>'id' = r1->>'id' AND NOT (r2->>'created')::boolean, format('parallel replay not idempotent: %s / %s', r1, r2);
 SELECT count(*) INTO n FROM public.applications WHERE user_id = uid::uuid;
 ASSERT n=1, format('parallel replay created %s applications', n);
 SELECT count(*) INTO n FROM public.application_documents WHERE user_id = uid::uuid;
 ASSERT n=2, format('parallel replay created %s documents', n);
 ASSERT (SELECT content->>'text' FROM public.application_documents WHERE user_id = uid::uuid AND document_type='jd')='JD A', 'parallel replay overwrote snapshot';
END $$;

DELETE FROM auth.users WHERE id = current_setting('test.uid')::uuid;
SELECT 1 FROM public.applications WHERE user_id = current_setting('test.uid')::uuid HAVING count(*) > 0;
