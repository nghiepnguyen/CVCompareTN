-- P0-H: least privilege on public.analysis_log (migration 20261123100000).
-- Disposable database only; synthetic rows; everything rolls back.
-- Roles are switched at top level (as PostgREST does). Each denied statement
-- runs in its own EXCEPTION sub-block that only records the outcome; the
-- ASSERT runs outside it. (Raising inside a sub-block while SET ROLE to an API
-- role segfaulted the local Supabase PG 17 backend.)
BEGIN;

-- Fixtures (as postgres, the table owner).
DO $$
BEGIN
  INSERT INTO auth.users(id) VALUES
    ('00000000-0000-4000-8000-0000000000a1'), ('00000000-0000-4000-8000-0000000000b1');
  INSERT INTO public.profiles(id, email, plan, role) VALUES
    ('00000000-0000-4000-8000-0000000000a1', 'p0h-admin@example.test', 'free', 'admin'),
    ('00000000-0000-4000-8000-0000000000b1', 'p0h-user@example.test',  'free', 'user');
  INSERT INTO public.analysis_log(id, user_id, status, kind, created_at, input_tokens, output_tokens, model, guard_metrics) VALUES
    ('00000000-0000-4000-8000-000000000c01', '00000000-0000-4000-8000-0000000000b1', 'success', 'analyze', now() - interval '10 minutes', 10, 5, 'm', '{"v":1}'),
    ('00000000-0000-4000-8000-000000000c02', '00000000-0000-4000-8000-0000000000b1', 'success', 'rewrite', now() - interval '5 minutes', 10, 5, 'm', '{"v":1,"coverLetter":{"generated":true}}'),
    ('00000000-0000-4000-8000-000000000c03', '00000000-0000-4000-8000-0000000000b1', 'success', 'analyze', now() - interval '40 days', 10, 5, 'm',
       '{"v":1,"fitShadow":{"v":"fit-score-v1","eligible":false,"reason":"error"}}');
END $$;

-- 1. Full privilege matrix (PG 17 real stack: MAINTAIN exists).
DO $$
DECLARE r text; p text; want boolean; got boolean;
BEGIN
  ASSERT current_setting('server_version_num')::int >= 170000, 'expected PG 17+ (MAINTAIN) on the real stack';
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    FOREACH p IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] LOOP
      want := (r = 'authenticated' AND p = 'SELECT') OR (r = 'service_role' AND p IN ('SELECT','INSERT'));
      got := has_table_privilege(r, 'public.analysis_log', p);
      ASSERT got = want, format('%s %s: expected %s, got %s', r, p, want, got);
    END LOOP;
  END LOOP;
  FOREACH p IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] LOOP
    ASSERT NOT has_table_privilege('public', 'public.analysis_log', p), 'PUBLIC has '||p;
  END LOOP;
  ASSERT (SELECT relacl::text FROM pg_class WHERE oid = 'public.analysis_log'::regclass)
       = '{postgres=arwdDxtm/postgres,authenticated=r/postgres,service_role=ar/postgres}',
    'unexpected ACL '||(SELECT relacl::text FROM pg_class WHERE oid = 'public.analysis_log'::regclass);
  -- RLS and the policy are unchanged.
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.analysis_log'::regclass), 'RLS off';
  ASSERT (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'analysis_log') = 1, 'policy count changed';
END $$;

-- 2. anon: nothing at all.
SET LOCAL ROLE anon;
DO $$
DECLARE ok boolean;
BEGIN
  BEGIN PERFORM 1 FROM public.analysis_log; ok := true; EXCEPTION WHEN insufficient_privilege THEN ok := false; END; ASSERT NOT ok, 'anon SELECT allowed';
  BEGIN INSERT INTO public.analysis_log(status, kind) VALUES ('success', 'analyze'); ok := true; EXCEPTION WHEN insufficient_privilege THEN ok := false; END; ASSERT NOT ok, 'anon INSERT allowed';
  BEGIN UPDATE public.analysis_log SET model = 'x'; ok := true; EXCEPTION WHEN insufficient_privilege THEN ok := false; END; ASSERT NOT ok, 'anon UPDATE allowed';
  BEGIN DELETE FROM public.analysis_log; ok := true; EXCEPTION WHEN insufficient_privilege THEN ok := false; END; ASSERT NOT ok, 'anon DELETE allowed';
  BEGIN EXECUTE 'TRUNCATE public.analysis_log'; ok := true; EXCEPTION WHEN insufficient_privilege THEN ok := false; END; ASSERT NOT ok, 'anon TRUNCATE allowed';
  BEGIN EXECUTE 'LOCK TABLE public.analysis_log IN ACCESS EXCLUSIVE MODE'; ok := true; EXCEPTION WHEN insufficient_privilege THEN ok := false; END; ASSERT NOT ok, 'anon LOCK (MAINTAIN) allowed';
END $$;
RESET ROLE;

-- 3. Signed-in non-admin: SELECT privilege but RLS shows 0 rows; every write denied.
DO $$ BEGIN
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b1', true);
END $$;
SET LOCAL ROLE authenticated;
DO $$
DECLARE n integer; ok boolean;
BEGIN
  SELECT count(*) INTO n FROM public.analysis_log;
  ASSERT n = 0, 'non-admin reads analysis_log rows: '||n;
  BEGIN INSERT INTO public.analysis_log(user_id, status, kind) VALUES ('00000000-0000-4000-8000-0000000000b1', 'success', 'analyze'); ok := true; EXCEPTION WHEN insufficient_privilege THEN ok := false; END; ASSERT NOT ok, 'authenticated INSERT allowed';
  BEGIN UPDATE public.analysis_log SET model = 'x'; ok := true; EXCEPTION WHEN insufficient_privilege THEN ok := false; END; ASSERT NOT ok, 'authenticated UPDATE allowed';
  BEGIN DELETE FROM public.analysis_log; ok := true; EXCEPTION WHEN insufficient_privilege THEN ok := false; END; ASSERT NOT ok, 'authenticated DELETE allowed';
  BEGIN EXECUTE 'TRUNCATE public.analysis_log'; ok := true; EXCEPTION WHEN insufficient_privilege THEN ok := false; END; ASSERT NOT ok, 'authenticated TRUNCATE allowed';
  BEGIN EXECUTE 'LOCK TABLE public.analysis_log IN ACCESS EXCLUSIVE MODE'; ok := true; EXCEPTION WHEN insufficient_privilege THEN ok := false; END; ASSERT NOT ok, 'authenticated LOCK (MAINTAIN) allowed';
END $$;
RESET ROLE;

-- 4. Admin through authenticated + is_admin(): direct SELECT and both INVOKER report RPCs.
DO $$ BEGIN
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
END $$;
SET LOCAL ROLE authenticated;
DO $$
DECLARE n integer; r jsonb;
BEGIN
  SELECT count(*) INTO n FROM public.analysis_log WHERE user_id = '00000000-0000-4000-8000-0000000000b1';
  ASSERT n = 3, 'admin sees '||n||' of 3 rows';
  r := public.admin_report_stats(now() - interval '1 day', now() + interval '1 hour');
  ASSERT (r->>'total_success')::int = 1, 'admin_report_stats total_success '||coalesce(r->>'total_success', 'null');
  r := public.admin_report_ops(now() - interval '1 day', now() + interval '1 hour');
  ASSERT r IS NOT NULL, 'admin_report_ops returned null';
END $$;
RESET ROLE;

-- 5. service_role: log writes and AI-cap queries work; nothing destructive.
SET LOCAL ROLE service_role;
DO $$
DECLARE n integer; ok boolean;
BEGIN
  -- Exactly the columns _server-lib/analysisLog.ts writes.
  INSERT INTO public.analysis_log(user_id, status, kind, error_message, input_tokens, output_tokens, model, latency_ms, guard_metrics)
  VALUES ('00000000-0000-4000-8000-0000000000b1', 'success', 'analyze', NULL, 12, 3, 'm', 900, '{"v":1}');
  -- Hourly cap (accountLock.ts): head count by user, kind, last hour.
  SELECT count(*) INTO n FROM public.analysis_log
   WHERE user_id = '00000000-0000-4000-8000-0000000000b1' AND kind = 'analyze' AND created_at >= now() - interval '1 hour';
  ASSERT n = 2, 'hourly analyze count '||n;
  -- Document cap: rewrite rows marked by coverLetter / applicationReview / followUp.
  SELECT count(*) INTO n FROM public.analysis_log
   WHERE user_id = '00000000-0000-4000-8000-0000000000b1' AND kind = 'rewrite' AND created_at >= now() - interval '1 hour'
     AND (guard_metrics->'coverLetter' IS NOT NULL OR guard_metrics->'applicationReview' IS NOT NULL OR guard_metrics->'followUp' IS NOT NULL);
  ASSERT n = 1, 'document cap count '||n;
  BEGIN UPDATE public.analysis_log SET model = 'x'; ok := true; EXCEPTION WHEN insufficient_privilege THEN ok := false; END; ASSERT NOT ok, 'service_role UPDATE allowed';
  BEGIN DELETE FROM public.analysis_log; ok := true; EXCEPTION WHEN insufficient_privilege THEN ok := false; END; ASSERT NOT ok, 'service_role DELETE allowed';
  BEGIN EXECUTE 'TRUNCATE public.analysis_log'; ok := true; EXCEPTION WHEN insufficient_privilege THEN ok := false; END; ASSERT NOT ok, 'service_role TRUNCATE allowed';
  -- Retention purge (DEFINER, owner postgres) still works when called as service_role.
  n := public.purge_expired_fit_shadow();
  ASSERT n = 1, 'purge stripped '||n||' rows, expected 1';
END $$;
RESET ROLE;

-- 6. Owner-side workflows unchanged.
DO $$
BEGIN
  ASSERT NOT (SELECT guard_metrics ? 'fitShadow' FROM public.analysis_log WHERE id = '00000000-0000-4000-8000-000000000c03'), 'purge did not strip';
  ASSERT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-fit-shadow' AND active AND username = 'postgres'), 'purge-fit-shadow cron job missing';
  -- FK ON DELETE SET NULL from auth.users still works (runs as the table owner).
  DELETE FROM auth.users WHERE id = '00000000-0000-4000-8000-0000000000b1';
  ASSERT (SELECT count(*) FROM public.analysis_log WHERE id IN ('00000000-0000-4000-8000-000000000c01','00000000-0000-4000-8000-000000000c02','00000000-0000-4000-8000-000000000c03') AND user_id IS NULL) = 3,
    'account delete did not unlink log rows';
END $$;
ROLLBACK;
