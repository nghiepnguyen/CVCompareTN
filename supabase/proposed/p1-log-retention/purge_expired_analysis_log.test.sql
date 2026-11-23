-- PROPOSED (P1) test — run on a disposable local stack AFTER applying 01 + 02
-- (and optionally 03). Not in supabase/tests, so CI does not run it until the
-- migration is adopted (then move it to supabase/tests/). Synthetic rows; rolls back.
BEGIN;
DO $$
DECLARE
  u uuid := '00000000-0000-4000-8000-0000000000e1';
  rollup boolean := to_regclass('public.analysis_log_daily') IS NOT NULL;
  t_ledger bigint; t_hist bigint; t_prof bigint; t_audit bigint; t_pay bigint; n integer;
  d0 bigint; d1 bigint;
BEGIN
  INSERT INTO auth.users(id) VALUES (u);
  INSERT INTO public.profiles(id, email, plan, role) VALUES (u, 'p1-retention@example.test', 'free', 'user');
  -- Unrelated user data that must survive (old history row: CV/JD-bearing table is user-managed).
  INSERT INTO public.history(user_id, analysis_id, timestamp) VALUES (u, 'p1-old-history', now() - interval '400 days');
  INSERT INTO public.analysis_log(id, user_id, status, kind, created_at, input_tokens, output_tokens, model, guard_metrics) VALUES
    ('00000000-0000-4000-8000-000000000e89', u,    'success', 'analyze',  now() - interval '89 days',  10, 1, 'm', '{"v":1}'),
    ('00000000-0000-4000-8000-000000000e90', u,    'success', 'analyze',  now() - interval '90 days',  10, 1, 'm', '{"v":1}'),
    ('00000000-0000-4000-8000-000000000e91', u,    'success', 'analyze',  now() - interval '91 days',  20, 2, 'm', '{"v":1}'),
    ('00000000-0000-4000-8000-000000000e92', u,    'error',   'parse_cv', now() - interval '120 days', 0,  0, NULL, NULL),
    ('00000000-0000-4000-8000-000000000e93', NULL, 'success', 'rewrite',  now() - interval '200 days', 30, 3, 'm', '{"v":1,"coverLetter":{}}'),
    ('00000000-0000-4000-8000-000000000e94', u,    'success', 'rewrite',  now() - interval '5 minutes', 5, 1, 'm', '{"v":1,"coverLetter":{}}');
  SELECT count(*) INTO t_ledger FROM public.analytics_quota_reservations;
  SELECT count(*) INTO t_hist   FROM public.history;
  SELECT count(*) INTO t_prof   FROM public.profiles;
  SELECT count(*) INTO t_audit  FROM public.admin_audit_log;
  SELECT count(*) INTO t_pay    FROM public.payments;
  IF rollup THEN
    -- Pre-existing cell for the 91-day row's day: exercises the ON CONFLICT merge.
    INSERT INTO public.analysis_log_daily(day, kind, status, rows, input_tokens, output_tokens)
    VALUES (((now() - interval '91 days') AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 'analyze', 'success', 5, 100, 10)
    ON CONFLICT (day, kind, status) DO UPDATE SET rows = 5, input_tokens = 100, output_tokens = 10;
    SELECT coalesce(sum(rows), 0) INTO d0 FROM public.analysis_log_daily;
  END IF;

  -- Permissions: DEFINER, fixed search_path, service_role only.
  ASSERT (SELECT prosecdef AND proconfig = ARRAY['search_path=""'] FROM pg_proc WHERE oid = 'public.purge_expired_analysis_log()'::regprocedure), 'not DEFINER/fixed search_path';
  ASSERT NOT has_function_privilege('anon', 'public.purge_expired_analysis_log()', 'EXECUTE'), 'anon can purge';
  ASSERT NOT has_function_privilege('authenticated', 'public.purge_expired_analysis_log()', 'EXECUTE'), 'authenticated can purge';
  ASSERT has_function_privilege('service_role', 'public.purge_expired_analysis_log()', 'EXECUTE'), 'service_role cannot purge';

  n := public.purge_expired_analysis_log();
  ASSERT n = 3, 'expected 3 deleted (91d, 120d, 200d), got '||n;
  -- Boundaries: strictly older than 90 days.
  ASSERT EXISTS (SELECT 1 FROM public.analysis_log WHERE id = '00000000-0000-4000-8000-000000000e89'), '89-day row deleted';
  ASSERT EXISTS (SELECT 1 FROM public.analysis_log WHERE id = '00000000-0000-4000-8000-000000000e90'), 'exactly-90-day row deleted';
  ASSERT NOT EXISTS (SELECT 1 FROM public.analysis_log WHERE id IN ('00000000-0000-4000-8000-000000000e91','00000000-0000-4000-8000-000000000e92','00000000-0000-4000-8000-000000000e93')), 'expired row kept';
  -- Recent rows (hourly / document caps) intact, content unchanged.
  ASSERT (SELECT guard_metrics = '{"v":1,"coverLetter":{}}'::jsonb AND user_id = u FROM public.analysis_log WHERE id = '00000000-0000-4000-8000-000000000e94'), 'recent row changed';
  -- Unrelated tables untouched.
  ASSERT (SELECT count(*) FROM public.analytics_quota_reservations) = t_ledger, 'quota ledger changed';
  ASSERT (SELECT count(*) FROM public.history) = t_hist, 'history changed';
  ASSERT EXISTS (SELECT 1 FROM public.history WHERE analysis_id = 'p1-old-history'), 'old history row deleted';
  ASSERT (SELECT count(*) FROM public.profiles) = t_prof, 'profiles changed';
  ASSERT (SELECT count(*) FROM public.admin_audit_log) = t_audit, 'admin_audit_log changed';
  ASSERT (SELECT count(*) FROM public.payments) = t_pay, 'payments changed';
  IF rollup THEN
    SELECT coalesce(sum(rows), 0) INTO d1 FROM public.analysis_log_daily;
    ASSERT d1 - d0 = 3, 'rollup counted '||(d1 - d0)||' rows, expected 3';
    ASSERT (SELECT rows = 6 AND input_tokens = 120 AND output_tokens = 12 FROM public.analysis_log_daily
             WHERE day = ((now() - interval '91 days') AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AND kind = 'analyze' AND status = 'success'),
      'rollup merge into an existing cell is not additive';
    ASSERT (SELECT sum(input_tokens) FROM public.analysis_log_daily
             WHERE day IN (((now() - interval '91 days') AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
                           ((now() - interval '120 days') AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
                           ((now() - interval '200 days') AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)) >= 50, 'rollup token sum';
    ASSERT NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'analysis_log_daily' AND column_name IN ('user_id','id','created_at')), 'rollup carries identifiers';
    ASSERT (SELECT relacl::text FROM pg_class WHERE oid = 'public.analysis_log_daily'::regclass) = '{postgres=arwdDxtm/postgres,authenticated=r/postgres}', 'rollup ACL not least-privilege';
  END IF;
  -- Idempotent.
  n := public.purge_expired_analysis_log();
  ASSERT n = 0, 'second run deleted '||n;
  -- One cron job; existing jobs intact.
  ASSERT (SELECT count(*) FROM cron.job WHERE jobname = 'purge-analysis-log') = 1, 'purge-analysis-log job count';
  ASSERT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-analysis-log' AND schedule = '30 20 * * *' AND command = 'SELECT public.purge_expired_analysis_log()' AND active AND username = 'postgres'), 'cron job definition';
  ASSERT (SELECT count(*) FROM cron.job WHERE jobname IN ('purge-free-history','purge-api-rate-limits','storage-cleanup','purge-fit-shadow')) = 4, 'existing cron jobs missing';
  -- analysis_log ACL from P0-H unchanged.
  ASSERT (SELECT relacl::text FROM pg_class WHERE oid = 'public.analysis_log'::regclass) = '{postgres=arwdDxtm/postgres,authenticated=r/postgres,service_role=ar/postgres}', 'analysis_log ACL changed';
END $$;

-- Called as service_role (the role pg_cron would not use, but the API could): works via DEFINER.
SET LOCAL ROLE service_role;
DO $$ DECLARE n integer; BEGIN n := public.purge_expired_analysis_log(); ASSERT n = 0, 'service_role run deleted '||n; END $$;
RESET ROLE;
ROLLBACK;
