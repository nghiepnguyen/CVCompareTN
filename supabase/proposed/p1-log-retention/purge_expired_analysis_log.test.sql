-- PROPOSED (P1) test — run on a disposable local stack AFTER applying 01 + 02
-- (and optionally 03). Not in supabase/tests, so CI does not run it until the
-- migration is adopted (then move it to supabase/tests/). Synthetic rows only;
-- every block rolls back.

-- Seed: one user, analysis_log rows around the boundary, unrelated user data.
CREATE FUNCTION pg_temp.p1_seed() RETURNS void LANGUAGE sql AS $$
  INSERT INTO auth.users(id) VALUES ('00000000-0000-4000-8000-0000000000e1');
  INSERT INTO public.profiles(id, email, plan, role)
    VALUES ('00000000-0000-4000-8000-0000000000e1', 'p1-retention@example.test', 'free', 'user');
  -- CV/JD-bearing table is user-managed: a 400-day-old row must survive.
  INSERT INTO public.history(user_id, analysis_id, timestamp)
    VALUES ('00000000-0000-4000-8000-0000000000e1', 'p1-old-history', now() - interval '400 days');
  INSERT INTO public.analysis_log(id, user_id, status, kind, created_at, input_tokens, output_tokens, model, guard_metrics) VALUES
    ('00000000-0000-4000-8000-000000000e31', '00000000-0000-4000-8000-0000000000e1', 'success', 'analyze',  now() - interval '31 days',  10, 1, 'm', '{"v":1,"fitShadow":{"v":1}}'),
    ('00000000-0000-4000-8000-000000000e89', '00000000-0000-4000-8000-0000000000e1', 'success', 'analyze',  now() - interval '89 days',  10, 1, 'm', '{"v":1}'),
    ('00000000-0000-4000-8000-000000000e90', '00000000-0000-4000-8000-0000000000e1', 'success', 'analyze',  now() - interval '90 days',  10, 1, 'm', '{"v":1}'),
    ('00000000-0000-4000-8000-000000000e91', '00000000-0000-4000-8000-0000000000e1', 'success', 'analyze',  now() - interval '91 days',  20, 2, 'm', '{"v":1,"fitShadow":{"v":1}}'),
    ('00000000-0000-4000-8000-000000000e92', '00000000-0000-4000-8000-0000000000e1', 'error',   'parse_cv', now() - interval '120 days', 0,  0, NULL, NULL),
    ('00000000-0000-4000-8000-000000000e93', NULL,                                   'success', 'rewrite',  now() - interval '200 days', 30, 3, 'm', '{"v":1,"coverLetter":{}}'),
    ('00000000-0000-4000-8000-000000000e94', '00000000-0000-4000-8000-0000000000e1', 'success', 'rewrite',  now() - interval '5 minutes', 5, 1, 'm', '{"v":1,"coverLetter":{}}');
$$;
CREATE FUNCTION pg_temp.p1_set(v jsonb) RETURNS void LANGUAGE sql AS $$
  UPDATE public.app_settings SET value = v WHERE key = 'analysis_log_retention_days';
$$;

-- 1. Core behaviour at the seeded default (90), unrelated tables, permissions, cron.
BEGIN;
SELECT pg_temp.p1_seed();
DO $$
DECLARE
  u uuid := '00000000-0000-4000-8000-0000000000e1';
  rollup boolean := to_regclass('public.analysis_log_daily') IS NOT NULL;
  t_ledger bigint; t_hist bigint; t_prof bigint; t_audit bigint; t_pay bigint; t_set bigint; n integer;
  d0 bigint; d1 bigint;
BEGIN
  ASSERT (SELECT value = '90'::jsonb FROM public.app_settings WHERE key = 'analysis_log_retention_days'), 'setting not seeded to 90';
  SELECT count(*) INTO t_ledger FROM public.analytics_quota_reservations;
  SELECT count(*) INTO t_hist   FROM public.history;
  SELECT count(*) INTO t_prof   FROM public.profiles;
  SELECT count(*) INTO t_audit  FROM public.admin_audit_log;
  SELECT count(*) INTO t_pay    FROM public.payments;
  SELECT count(*) INTO t_set    FROM public.app_settings;
  IF rollup THEN
    -- Pre-existing cell for the 91-day row's day: exercises the ON CONFLICT merge.
    INSERT INTO public.analysis_log_daily(day, kind, status, rows, input_tokens, output_tokens)
    VALUES (((now() - interval '91 days') AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 'analyze', 'success', 5, 100, 10)
    ON CONFLICT (day, kind, status) DO UPDATE SET rows = 5, input_tokens = 100, output_tokens = 10;
    SELECT coalesce(sum(rows), 0) INTO d0 FROM public.analysis_log_daily;
  END IF;

  -- Permissions: DEFINER, fixed search_path, service_role only; helper not callable by API roles.
  ASSERT (SELECT prosecdef AND proconfig = ARRAY['search_path=""'] FROM pg_proc WHERE oid = 'public.purge_expired_analysis_log()'::regprocedure), 'not DEFINER/fixed search_path';
  ASSERT NOT has_function_privilege('anon', 'public.purge_expired_analysis_log()', 'EXECUTE'), 'anon can purge';
  ASSERT NOT has_function_privilege('authenticated', 'public.purge_expired_analysis_log()', 'EXECUTE'), 'authenticated can purge';
  ASSERT has_function_privilege('service_role', 'public.purge_expired_analysis_log()', 'EXECUTE'), 'service_role cannot purge';
  ASSERT NOT has_function_privilege('anon', 'public.analysis_log_retention_cutoff()', 'EXECUTE')
     AND NOT has_function_privilege('authenticated', 'public.analysis_log_retention_cutoff()', 'EXECUTE')
     AND NOT has_function_privilege('service_role', 'public.analysis_log_retention_cutoff()', 'EXECUTE'), 'cutoff helper exposed';
  -- The only admin write path for app_settings cannot touch the retention key.
  UPDATE public.profiles SET role = 'admin' WHERE id = u;  -- rolled back with the block
  BEGIN
    PERFORM public.admin_update_app_setting(u, 'analysis_log_retention_days', '1'::jsonb);
    RAISE EXCEPTION 'admin_update_app_setting accepted retention key';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  UPDATE public.profiles SET role = 'user' WHERE id = u;
  ASSERT NOT has_table_privilege('authenticated', 'public.app_settings', 'UPDATE')
     AND NOT has_table_privilege('anon', 'public.app_settings', 'UPDATE'), 'API roles can write app_settings';

  n := public.purge_expired_analysis_log();
  ASSERT n = 3, 'expected 3 deleted (91d, 120d, 200d), got '||n;
  ASSERT EXISTS (SELECT 1 FROM public.analysis_log WHERE id = '00000000-0000-4000-8000-000000000e89'), '89-day row deleted';
  ASSERT EXISTS (SELECT 1 FROM public.analysis_log WHERE id = '00000000-0000-4000-8000-000000000e90'), 'exactly-90-day row deleted';
  ASSERT NOT EXISTS (SELECT 1 FROM public.analysis_log WHERE id IN ('00000000-0000-4000-8000-000000000e91','00000000-0000-4000-8000-000000000e92','00000000-0000-4000-8000-000000000e93')), 'expired row kept';
  -- Recent rows (1-hour AI and document caps) intact, content unchanged.
  ASSERT (SELECT guard_metrics = '{"v":1,"coverLetter":{}}'::jsonb AND user_id = u FROM public.analysis_log WHERE id = '00000000-0000-4000-8000-000000000e94'), 'recent row changed';
  ASSERT (SELECT guard_metrics = '{"v":1,"fitShadow":{"v":1}}'::jsonb FROM public.analysis_log WHERE id = '00000000-0000-4000-8000-000000000e31'), 'log purge touched a non-expired fitShadow row';
  -- Unrelated tables untouched.
  ASSERT (SELECT count(*) FROM public.analytics_quota_reservations) = t_ledger, 'quota ledger changed';
  ASSERT (SELECT count(*) FROM public.history) = t_hist, 'history changed';
  ASSERT EXISTS (SELECT 1 FROM public.history WHERE analysis_id = 'p1-old-history'), 'old history row deleted';
  ASSERT (SELECT count(*) FROM public.profiles) = t_prof, 'profiles changed';
  ASSERT (SELECT count(*) FROM public.admin_audit_log) = t_audit, 'admin_audit_log changed';
  ASSERT (SELECT count(*) FROM public.payments) = t_pay, 'payments changed';
  ASSERT (SELECT count(*) FROM public.app_settings) = t_set, 'app_settings changed';
  IF rollup THEN
    SELECT coalesce(sum(rows), 0) INTO d1 FROM public.analysis_log_daily;
    ASSERT d1 - d0 = 3, 'rollup counted '||(d1 - d0)||' rows, expected 3';
    ASSERT (SELECT rows = 6 AND input_tokens = 120 AND output_tokens = 12 FROM public.analysis_log_daily
             WHERE day = ((now() - interval '91 days') AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AND kind = 'analyze' AND status = 'success'),
      'rollup merge into an existing cell is not additive';
    ASSERT NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'analysis_log_daily' AND column_name IN ('user_id','id','created_at')), 'rollup carries identifiers';
    ASSERT (SELECT relacl::text FROM pg_class WHERE oid = 'public.analysis_log_daily'::regclass) = '{postgres=arwdDxtm/postgres,authenticated=r/postgres}', 'rollup ACL not least-privilege';
  END IF;
  n := public.purge_expired_analysis_log();
  ASSERT n = 0, 'second run deleted '||n;
  -- Exactly one new cron job; the 4 existing jobs intact.
  ASSERT (SELECT count(*) FROM cron.job WHERE jobname = 'purge-analysis-log') = 1, 'purge-analysis-log job count';
  ASSERT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-analysis-log' AND schedule = '30 20 * * *' AND command = 'SELECT public.purge_expired_analysis_log()' AND active AND username = 'postgres'), 'cron job definition';
  ASSERT (SELECT count(*) FROM cron.job WHERE jobname IN ('purge-free-history','purge-api-rate-limits','storage-cleanup','purge-fit-shadow')) = 4, 'existing cron jobs missing';
  -- P0-H analysis_log ACL unchanged.
  ASSERT (SELECT relacl::text FROM pg_class WHERE oid = 'public.analysis_log'::regclass) = '{postgres=arwdDxtm/postgres,authenticated=r/postgres,service_role=ar/postgres}', 'analysis_log ACL changed';
  -- Dependency guard: the only SQL functions reading analysis_log are the admin
  -- reports and the two purges (no quota / billing / deletion RPC depends on it).
  ASSERT (SELECT array_agg(proname::text ORDER BY proname) FROM pg_proc
           WHERE pronamespace = 'public'::regnamespace AND prosrc ILIKE '%analysis_log%' AND proname <> 'analysis_log_retention_cutoff')
         = ARRAY['admin_report_ops','admin_report_stats','purge_expired_analysis_log','purge_expired_fit_shadow'],
    'unexpected analysis_log dependency: '||(SELECT array_agg(proname::text ORDER BY proname) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND prosrc ILIKE '%analysis_log%')::text;
  ASSERT NOT EXISTS (SELECT 1 FROM pg_constraint WHERE confrelid = 'public.analysis_log'::regclass), 'inbound FK on analysis_log';
  ASSERT NOT EXISTS (SELECT 1 FROM pg_depend d JOIN pg_rewrite r ON r.oid = d.objid WHERE d.refobjid = 'public.analysis_log'::regclass), 'view depends on analysis_log';
END $$;
-- service_role (API) can run it via DEFINER.
SET LOCAL ROLE service_role;
DO $$ DECLARE n integer; BEGIN n := public.purge_expired_analysis_log(); ASSERT n = 0, 'service_role run deleted '||n; END $$;
RESET ROLE;
ROLLBACK;

-- 2. Configuration: invalid values fail closed (delete nothing); 365 honoured.
BEGIN;
SELECT pg_temp.p1_seed();
DO $$
DECLARE bad jsonb; n integer; before bigint := (SELECT count(*) FROM public.analysis_log);
BEGIN
  FOREACH bad IN ARRAY ARRAY['89'::jsonb, '0'::jsonb, '-5'::jsonb, '3651'::jsonb, '90.5'::jsonb, '"90"'::jsonb, 'null'::jsonb, '{}'::jsonb] LOOP
    PERFORM pg_temp.p1_set(bad);
    BEGIN
      n := public.purge_expired_analysis_log();
      RAISE EXCEPTION 'accepted retention %, deleted %', bad::text, n;
    EXCEPTION WHEN invalid_parameter_value THEN NULL;
    END;
    ASSERT (SELECT count(*) FROM public.analysis_log) = before, 'rows deleted with retention '||bad::text;
  END LOOP;
  DELETE FROM public.app_settings WHERE key = 'analysis_log_retention_days';
  BEGIN
    n := public.purge_expired_analysis_log();
    RAISE EXCEPTION 'accepted missing setting, deleted %', n;
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  ASSERT (SELECT count(*) FROM public.analysis_log) = before, 'rows deleted with missing setting';
  INSERT INTO public.app_settings(key, value) VALUES ('analysis_log_retention_days', '365'::jsonb);
  n := public.purge_expired_analysis_log();
  ASSERT n = 0, 'retention 365 deleted '||n||' (oldest seeded row is 200 days)';
  PERFORM pg_temp.p1_set('150'::jsonb);
  n := public.purge_expired_analysis_log();
  ASSERT n = 1, 'retention 150 should delete only the 200-day row, got '||n;
END $$;
ROLLBACK;

-- 3a. fitShadow purge THEN log purge.
BEGIN;
SELECT pg_temp.p1_seed();
DO $$ DECLARE n integer; BEGIN
  PERFORM public.purge_expired_fit_shadow();
  n := public.purge_expired_analysis_log();
  ASSERT n = 3, 'order A deleted '||n;
  ASSERT (SELECT guard_metrics = '{"v":1}'::jsonb FROM public.analysis_log WHERE id = '00000000-0000-4000-8000-000000000e31'), 'order A: 31-day fitShadow not stripped / row lost';
  ASSERT NOT EXISTS (SELECT 1 FROM public.analysis_log WHERE guard_metrics ? 'fitShadow' AND created_at < now() - interval '30 days'), 'order A: stale fitShadow left';
END $$;
ROLLBACK;
-- 3b. log purge THEN fitShadow purge: same end state.
BEGIN;
SELECT pg_temp.p1_seed();
DO $$ DECLARE n integer; BEGIN
  n := public.purge_expired_analysis_log();
  ASSERT n = 3, 'order B deleted '||n;
  PERFORM public.purge_expired_fit_shadow();
  ASSERT (SELECT guard_metrics = '{"v":1}'::jsonb FROM public.analysis_log WHERE id = '00000000-0000-4000-8000-000000000e31'), 'order B: 31-day fitShadow not stripped / row lost';
  ASSERT (SELECT count(*) FROM public.analysis_log WHERE id::text LIKE '00000000-0000-4000-8000-000000000e%') = 4, 'order B end state';
END $$;
ROLLBACK;

-- 4a. Account deletion THEN purge: rows are unlinked (FK SET NULL), then expired ones go.
BEGIN;
SELECT pg_temp.p1_seed();
DO $$ DECLARE n integer; BEGIN
  DELETE FROM auth.users WHERE id = '00000000-0000-4000-8000-0000000000e1';
  ASSERT NOT EXISTS (SELECT 1 FROM public.analysis_log WHERE user_id = '00000000-0000-4000-8000-0000000000e1'), 'rows still linked after account deletion';
  n := public.purge_expired_analysis_log();
  ASSERT n = 3, 'deletion-then-purge deleted '||n;
  ASSERT (SELECT count(*) FROM public.analysis_log WHERE id::text LIKE '00000000-0000-4000-8000-000000000e%' AND user_id IS NULL) = 4, 'recent unlinked rows lost';
END $$;
ROLLBACK;
-- 4b. Purge THEN account deletion: deletion still succeeds.
BEGIN;
SELECT pg_temp.p1_seed();
DO $$ DECLARE n integer; BEGIN
  n := public.purge_expired_analysis_log();
  DELETE FROM auth.users WHERE id = '00000000-0000-4000-8000-0000000000e1';
  ASSERT NOT EXISTS (SELECT 1 FROM auth.users WHERE id = '00000000-0000-4000-8000-0000000000e1'), 'account deletion failed after purge';
  ASSERT NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = '00000000-0000-4000-8000-0000000000e1'), 'profile not removed';
END $$;
ROLLBACK;
