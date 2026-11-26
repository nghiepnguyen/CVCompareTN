-- P1-D1 Phase A: analysis_log retention (20261126000000). Retention ships
-- DISABLED: purge refuses (55000) until app_settings
-- 'analysis_log_retention_enabled' is JSON true. Blocks that exercise the purge
-- enable it inside their own rolled-back transaction. Synthetic rows only.
--
-- Seeded ages: 5 minutes (document row inside the 1-hour AI cap), 31 days
-- (fitShadow), 89 days, 90 days - 1 second, exactly 90 days (= cutoff, since
-- now() is fixed within a transaction), 90 days + 1 second, 91 days, 120 days
-- (unlinked), 400 days. At 90 days the purge deletes 4 rows (90d+1s, 91, 120,
-- 400); everything at or inside 90 days is kept.

CREATE FUNCTION pg_temp.p1_seed() RETURNS void LANGUAGE sql AS $$
  INSERT INTO auth.users(id) VALUES ('00000000-0000-4000-8000-0000000000e1');
  INSERT INTO public.profiles(id, email, plan, role, usage_count)
    VALUES ('00000000-0000-4000-8000-0000000000e1', 'p1-retention@example.test', 'free', 'user', 3);
  -- CV/JD-bearing table is user-managed: a 500-day-old row must survive.
  INSERT INTO public.history(user_id, analysis_id, timestamp)
    VALUES ('00000000-0000-4000-8000-0000000000e1', 'p1-old-history', now() - interval '500 days');
  INSERT INTO public.analysis_log(id, user_id, status, kind, created_at, input_tokens, output_tokens, model, latency_ms, error_message, guard_metrics) VALUES
    ('00000000-0000-4000-8000-000000000e94', '00000000-0000-4000-8000-0000000000e1', 'success', 'rewrite',  now() - interval '5 minutes', 5, 1, 'm', 50, NULL, '{"v":1,"coverLetter":{}}'),
    ('00000000-0000-4000-8000-000000000e31', '00000000-0000-4000-8000-0000000000e1', 'success', 'analyze',  now() - interval '31 days',  10, 1, 'm', 100, NULL, '{"v":1,"fitShadow":{"v":1}}'),
    ('00000000-0000-4000-8000-000000000e89', '00000000-0000-4000-8000-0000000000e1', 'success', 'analyze',  now() - interval '89 days',  10, 1, 'm', 110, NULL, '{"v":1}'),
    ('00000000-0000-4000-8000-000000000a89', '00000000-0000-4000-8000-0000000000e1', 'success', 'analyze',  now() - interval '90 days' + interval '1 second', 10, 1, 'm', 110, NULL, NULL),
    ('00000000-0000-4000-8000-000000000e90', '00000000-0000-4000-8000-0000000000e1', 'error',   'analyze',  now() - interval '90 days',  0,  0, NULL, NULL, '[upstream_timeout]', NULL),
    ('00000000-0000-4000-8000-000000000b90', '00000000-0000-4000-8000-0000000000e1', 'error',   'analyze',  now() - interval '90 days' - interval '1 second', 0, 0, NULL, NULL, '[upstream]', NULL),
    ('00000000-0000-4000-8000-000000000e91', '00000000-0000-4000-8000-0000000000e1', 'success', 'analyze',  now() - interval '91 days',  20, 2, 'm', 120, NULL, '{"v":1,"fitShadow":{"v":1}}'),
    ('00000000-0000-4000-8000-000000000e93', NULL,                                   'success', 'rewrite',  now() - interval '120 days', 30, 3, 'm', 130, NULL, '{"v":1,"coverLetter":{}}'),
    ('00000000-0000-4000-8000-000000000b00', '00000000-0000-4000-8000-0000000000e1', 'error',   'analyze',  now() - interval '400 days', 0,  0, NULL, NULL, 'Monthly analysis limit exceeded', NULL);
$$;
CREATE FUNCTION pg_temp.p1_set(k text, v jsonb) RETURNS void LANGUAGE sql AS $$
  UPDATE public.app_settings SET value = v WHERE key = k;
$$;
CREATE FUNCTION pg_temp.p1_enable() RETURNS void LANGUAGE sql AS $$
  UPDATE public.app_settings SET value = 'true'::jsonb WHERE key = 'analysis_log_retention_enabled';
$$;
-- Fingerprint of every column of the seeded rows.
CREATE FUNCTION pg_temp.p1_all() RETURNS text LANGUAGE sql AS $$
  SELECT md5(coalesce(string_agg(concat_ws('|', id, user_id, kind, status, created_at, input_tokens, output_tokens, model, latency_ms, error_message, guard_metrics::text), ',' ORDER BY id), ''))
    FROM public.analysis_log WHERE id::text LIKE '00000000-0000-4000-8000-000000000%';
$$;
CREATE FUNCTION pg_temp.p1_ids() RETURNS text LANGUAGE sql AS $$
  SELECT string_agg(right(id::text, 4), ',' ORDER BY id) FROM public.analysis_log WHERE id::text LIKE '00000000-0000-4000-8000-000000000%';
$$;

-- 1. Core behaviour at the seeded default (90), dry run, unrelated tables,
--    permissions, cron, dependency guard.
BEGIN;
SELECT pg_temp.p1_seed();
DO $$
DECLARE
  u uuid := '00000000-0000-4000-8000-0000000000e1';
  rollup boolean := to_regclass('public.analysis_log_daily') IS NOT NULL;
  t_ledger bigint; t_hist bigint; t_prof bigint; t_audit bigint; t_pay bigint; t_set bigint; t_usage bigint;
  n integer; f0 text; d0 bigint; d1 bigint; ti0 bigint; to0 bigint; pv record;
BEGIN
  ASSERT (SELECT value = '90'::jsonb FROM public.app_settings WHERE key = 'analysis_log_retention_days'), 'row setting not seeded to 90';
  ASSERT (SELECT value = 'false'::jsonb FROM public.app_settings WHERE key = 'analysis_log_retention_enabled'), 'retention not seeded disabled';
  ASSERT NOT EXISTS (SELECT 1 FROM public.app_settings WHERE key = 'analysis_log_detail_retention_days'), 'option B detail setting seeded';
  ASSERT to_regprocedure('public.analysis_log_retention_cutoffs()') IS NULL
     AND to_regprocedure('public.scrub_expired_analysis_log_detail()') IS NULL, 'option B functions still present';
  SELECT count(*) INTO t_ledger FROM public.analytics_quota_reservations;
  SELECT count(*) INTO t_hist   FROM public.history;
  SELECT count(*) INTO t_prof   FROM public.profiles;
  SELECT count(*) INTO t_audit  FROM public.admin_audit_log;
  SELECT count(*) INTO t_pay    FROM public.payments;
  SELECT count(*) INTO t_set    FROM public.app_settings;
  SELECT coalesce(sum(usage_count), 0) INTO t_usage FROM public.profiles;
  IF rollup THEN
    -- Pre-existing cell for the 400-day row's day: exercises the ON CONFLICT merge.
    INSERT INTO public.analysis_log_daily(day, kind, status, rows, input_tokens, output_tokens)
    VALUES (((now() - interval '400 days') AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 'analyze', 'error', 5, 100, 10)
    ON CONFLICT (day, kind, status) DO UPDATE SET rows = 5, input_tokens = 100, output_tokens = 10;
    SELECT coalesce(sum(rows), 0), coalesce(sum(input_tokens), 0), coalesce(sum(output_tokens), 0) INTO d0, ti0, to0 FROM public.analysis_log_daily;
  END IF;

  -- Permissions: owned by postgres; DEFINER, fixed search_path, no API role may
  -- execute (cron and the owner run them as postgres); helper private INVOKER.
  ASSERT (SELECT count(*) = 3 AND bool_and(pg_get_userbyid(proowner) = 'postgres') FROM pg_proc
           WHERE oid IN ('public.purge_expired_analysis_log()'::regprocedure, 'public.preview_expired_analysis_log()'::regprocedure,
                         'public.analysis_log_retention_cutoff()'::regprocedure)), 'P1 functions not owned by postgres';
  ASSERT (SELECT bool_and(prosecdef AND proconfig IS NOT DISTINCT FROM ARRAY['search_path=""']) FROM pg_proc
           WHERE oid IN ('public.purge_expired_analysis_log()'::regprocedure, 'public.preview_expired_analysis_log()'::regprocedure)), 'not DEFINER/fixed search_path';
  ASSERT (SELECT provolatile = 's' FROM pg_proc WHERE oid = 'public.preview_expired_analysis_log()'::regprocedure), 'preview must be STABLE (read-only)';
  ASSERT (SELECT NOT prosecdef AND proconfig IS NOT DISTINCT FROM ARRAY['search_path=""'] FROM pg_proc WHERE oid = 'public.analysis_log_retention_cutoff()'::regprocedure), 'helper must be INVOKER with fixed search_path';
  ASSERT NOT has_function_privilege('anon', 'public.purge_expired_analysis_log()', 'EXECUTE')
     AND NOT has_function_privilege('authenticated', 'public.purge_expired_analysis_log()', 'EXECUTE')
     AND NOT has_function_privilege('service_role', 'public.purge_expired_analysis_log()', 'EXECUTE')
     AND NOT has_function_privilege('public', 'public.purge_expired_analysis_log()', 'EXECUTE'), 'purge EXECUTE granted to an API role';
  ASSERT NOT has_function_privilege('anon', 'public.preview_expired_analysis_log()', 'EXECUTE')
     AND NOT has_function_privilege('authenticated', 'public.preview_expired_analysis_log()', 'EXECUTE')
     AND NOT has_function_privilege('service_role', 'public.preview_expired_analysis_log()', 'EXECUTE')
     AND NOT has_function_privilege('public', 'public.preview_expired_analysis_log()', 'EXECUTE'), 'preview EXECUTE granted to an API role';
  ASSERT NOT has_function_privilege('anon', 'public.analysis_log_retention_cutoff()', 'EXECUTE')
     AND NOT has_function_privilege('authenticated', 'public.analysis_log_retention_cutoff()', 'EXECUTE')
     AND NOT has_function_privilege('service_role', 'public.analysis_log_retention_cutoff()', 'EXECUTE'), 'cutoff helper exposed';
  -- The only admin write path for app_settings cannot touch the retention key.
  UPDATE public.profiles SET role = 'admin' WHERE id = u;  -- rolled back with the block
  BEGIN
    PERFORM public.admin_update_app_setting(u, 'analysis_log_retention_days', '3650'::jsonb);
    RAISE EXCEPTION 'admin_update_app_setting accepted retention key';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.admin_update_app_setting(u, 'analysis_log_retention_enabled', 'true'::jsonb);
    RAISE EXCEPTION 'admin_update_app_setting accepted retention enabled key';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  UPDATE public.profiles SET role = 'user' WHERE id = u;
  ASSERT NOT has_table_privilege('authenticated', 'public.app_settings', 'UPDATE')
     AND NOT has_table_privilege('anon', 'public.app_settings', 'UPDATE'), 'API roles can write app_settings';

  -- Disabled (as shipped): purge refuses and deletes nothing.
  f0 := pg_temp.p1_all();
  BEGIN
    n := public.purge_expired_analysis_log();
    RAISE EXCEPTION 'purge ran while disabled, deleted %', n;
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
  END;
  ASSERT pg_temp.p1_all() = f0, 'disabled purge changed rows';
  -- Dry run works while disabled and reports exactly what an enabled purge would delete.
  SELECT * INTO pv FROM public.preview_expired_analysis_log();
  ASSERT pv.enabled IS FALSE, 'preview reports enabled while disabled';
  ASSERT pv.eligible_rows = 4 AND pv.next_call_rows = 4, 'disabled preview counts '||pv.eligible_rows||'/'||pv.next_call_rows;
  ASSERT pg_temp.p1_all() = f0, 'disabled preview changed rows';
  PERFORM pg_temp.p1_enable();
  SELECT * INTO pv FROM public.preview_expired_analysis_log();
  ASSERT pv.enabled IS TRUE, 'preview does not report enabled';
  ASSERT pv.cutoff = now() - interval '90 days', 'preview cutoff '||pv.cutoff;
  ASSERT pv.eligible_rows = 4 AND pv.next_call_rows = 4, 'preview counts '||pv.eligible_rows||'/'||pv.next_call_rows;
  ASSERT pv.oldest_eligible = now() - interval '400 days' AND pv.newest_eligible = now() - interval '90 days' - interval '1 second', 'preview bounds';
  ASSERT pg_temp.p1_all() = f0, 'preview changed rows';

  -- Purge: boundary at exactly 90 days (kept) vs 90 days + 1 second (deleted).
  n := public.purge_expired_analysis_log();
  ASSERT n = 4, 'expected 4 deleted, got '||n;
  ASSERT pg_temp.p1_ids() = '0a89,0e31,0e89,0e90,0e94', 'wrong rows remain: '||pg_temp.p1_ids();
  ASSERT NOT EXISTS (SELECT 1 FROM public.analysis_log WHERE created_at < now() - interval '90 days'), 'row older than 90 days left';
  -- Recent rows (1-hour AI cap and document cap markers) intact, untouched.
  ASSERT (SELECT guard_metrics = '{"v":1,"coverLetter":{}}'::jsonb AND user_id = u FROM public.analysis_log WHERE id = '00000000-0000-4000-8000-000000000e94'), 'recent document row changed';
  ASSERT (SELECT guard_metrics = '{"v":1,"fitShadow":{"v":1}}'::jsonb FROM public.analysis_log WHERE id = '00000000-0000-4000-8000-000000000e31'), 'purge touched a 31-day row';
  ASSERT (SELECT error_message = '[upstream_timeout]' FROM public.analysis_log WHERE id = '00000000-0000-4000-8000-000000000e90'), 'exactly-90-day row changed';
  -- Repeat: safe, deletes nothing; preview agrees.
  n := public.purge_expired_analysis_log();
  ASSERT n = 0, 'second purge deleted '||n;
  SELECT * INTO pv FROM public.preview_expired_analysis_log();
  ASSERT pv.eligible_rows = 0 AND pv.next_call_rows = 0 AND pv.oldest_eligible IS NULL, 'preview after purge not empty';

  -- Unrelated tables untouched (billing, quota, history, audit, settings).
  ASSERT (SELECT count(*) FROM public.analytics_quota_reservations) = t_ledger, 'quota ledger changed';
  ASSERT (SELECT coalesce(sum(usage_count), 0) FROM public.profiles) = t_usage, 'profiles.usage_count changed';
  ASSERT (SELECT count(*) FROM public.history) = t_hist, 'history changed';
  ASSERT EXISTS (SELECT 1 FROM public.history WHERE analysis_id = 'p1-old-history'), 'old history row deleted';
  ASSERT (SELECT count(*) FROM public.profiles) = t_prof, 'profiles changed';
  ASSERT (SELECT count(*) FROM public.admin_audit_log) = t_audit, 'admin_audit_log changed';
  ASSERT (SELECT count(*) FROM public.payments) = t_pay, 'payments changed';
  ASSERT (SELECT count(*) FROM public.app_settings) = t_set, 'app_settings changed';
  IF rollup THEN
    SELECT coalesce(sum(rows), 0) INTO d1 FROM public.analysis_log_daily;
    ASSERT d1 - d0 = 4, 'rollup counted '||(d1 - d0)||' rows, expected 4';
    -- Deleted rows carry 0+20+30+0 input and 0+2+3+0 output tokens.
    ASSERT (SELECT sum(input_tokens) FROM public.analysis_log_daily) - ti0 = 50
       AND (SELECT sum(output_tokens) FROM public.analysis_log_daily) - to0 = 5, 'rollup token totals wrong';
    ASSERT (SELECT rows = 6 AND input_tokens = 100 AND output_tokens = 10 FROM public.analysis_log_daily
             WHERE day = ((now() - interval '400 days') AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AND kind = 'analyze' AND status = 'error'),
      'rollup merge into an existing cell is not additive';
    ASSERT NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'analysis_log_daily' AND column_name IN ('user_id','id','created_at')), 'rollup carries identifiers';
    ASSERT (SELECT relacl::text FROM pg_class WHERE oid = 'public.analysis_log_daily'::regclass) = '{postgres=arwdDxtm/postgres,authenticated=r/postgres}', 'rollup ACL not least-privilege';
  END IF;

  -- Cron: Phase A schedules nothing. No job may call the purge; option B
  -- scrub job never exists. 4 existing jobs intact.
  ASSERT NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname IN ('purge-analysis-log', 'scrub-analysis-log-detail')
                        OR command ILIKE '%purge_expired_analysis_log%' OR command ILIKE '%analysis_log%delete%' OR command ILIKE '%delete%analysis_log%'),
    'a cron job deletes analysis_log';
  ASSERT (SELECT count(*) FROM cron.job WHERE jobname IN ('purge-free-history','purge-api-rate-limits','storage-cleanup','purge-fit-shadow')) = 4, 'existing cron jobs missing';
  -- P0-H analysis_log ACL unchanged.
  ASSERT (SELECT relacl::text FROM pg_class WHERE oid = 'public.analysis_log'::regclass) = '{postgres=arwdDxtm/postgres,authenticated=r/postgres,service_role=ar/postgres}', 'analysis_log ACL changed';
  -- Dependency guard: the only SQL functions reading analysis_log are the admin
  -- reports, the fitShadow purge and the P1 purge/preview (no quota / billing /
  -- deletion RPC depends on it).
  ASSERT (SELECT array_agg(proname::text ORDER BY proname) FROM pg_proc
           WHERE pronamespace = 'public'::regnamespace AND prosrc ILIKE '%analysis_log%' AND proname <> 'analysis_log_retention_cutoff')
         = ARRAY['admin_report_ops','admin_report_stats','preview_expired_analysis_log','purge_expired_analysis_log','purge_expired_fit_shadow'],
    'unexpected analysis_log dependency: '||(SELECT array_agg(proname::text ORDER BY proname) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND prosrc ILIKE '%analysis_log%')::text;
  ASSERT NOT EXISTS (SELECT 1 FROM pg_constraint WHERE confrelid = 'public.analysis_log'::regclass), 'inbound FK on analysis_log';
  ASSERT NOT EXISTS (SELECT 1 FROM pg_depend d JOIN pg_rewrite r ON r.oid = d.objid WHERE d.refobjid = 'public.analysis_log'::regclass), 'view depends on analysis_log';
  ASSERT NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.analysis_log'::regclass AND NOT tgisinternal), 'trigger on analysis_log';
END $$;
-- No API role can call the functions: asserted above with has_function_privilege
-- and end-to-end over PostgREST (401/403) in cron_integration.sh. Not by calling
-- here: on supabase/postgres 17.6.1.106 (aarch64) a denied function call after
-- SET ROLE in a postgres psql session segfaults the backend.
ROLLBACK;

-- 2a. Invalid configuration fails closed: purge and preview raise, nothing changes.
BEGIN;
SELECT pg_temp.p1_seed();
SELECT pg_temp.p1_enable();
DO $$
DECLARE bad jsonb; n integer; f0 text := pg_temp.p1_all();
BEGIN
  FOREACH bad IN ARRAY ARRAY['89'::jsonb, '0'::jsonb, '-5'::jsonb, '3651'::jsonb, '90.5'::jsonb, '"90"'::jsonb, 'null'::jsonb, '{}'::jsonb, '[]'::jsonb,
                             '99999999999'::jsonb, '1e10'::jsonb, '90.0'::jsonb, 'true'::jsonb] LOOP
    PERFORM pg_temp.p1_set('analysis_log_retention_days', bad);
    BEGIN n := public.purge_expired_analysis_log(); RAISE EXCEPTION 'purge accepted retention %, deleted %', bad::text, n;
    EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
    BEGIN PERFORM public.preview_expired_analysis_log(); RAISE EXCEPTION 'preview accepted retention %', bad::text;
    EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
    ASSERT pg_temp.p1_all() = f0, 'rows changed with retention '||bad::text;
  END LOOP;
  DELETE FROM public.app_settings WHERE key = 'analysis_log_retention_days';
  BEGIN n := public.purge_expired_analysis_log(); RAISE EXCEPTION 'purge accepted missing key';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  ASSERT pg_temp.p1_all() = f0, 'rows changed with missing key';
END $$;
ROLLBACK;

-- 2b. Valid non-default values are honoured.
BEGIN;
SELECT pg_temp.p1_seed();
SELECT pg_temp.p1_enable();
DO $$ DECLARE n integer; BEGIN
  -- 120: the exactly-120-day row equals the cutoff and is kept; only 400 goes.
  PERFORM pg_temp.p1_set('analysis_log_retention_days', '120'::jsonb);
  n := public.purge_expired_analysis_log();
  ASSERT n = 1, 'retention 120 should delete the 400-day row only, got '||n;
  ASSERT EXISTS (SELECT 1 FROM public.analysis_log WHERE id = '00000000-0000-4000-8000-000000000e93'), 'retention 120 deleted the 120-day row';
  PERFORM pg_temp.p1_set('analysis_log_retention_days', '3650'::jsonb);
  ASSERT public.purge_expired_analysis_log() = 0, 'retention 3650 deleted something';
  PERFORM pg_temp.p1_set('analysis_log_retention_days', '90'::jsonb);
  ASSERT public.purge_expired_analysis_log() = 3, 'back to 90 should delete 90d+1s/91/120';
END $$;
ROLLBACK;

-- 2c. Bounded execution: 10000 rows per call, oldest first; repeat drains.
BEGIN;
SELECT pg_temp.p1_seed();
SELECT pg_temp.p1_enable();
INSERT INTO public.analysis_log(user_id, status, kind, created_at, input_tokens, output_tokens)
  SELECT NULL, 'success', 'analyze', now() - interval '200 days' + make_interval(secs => g), 0, 0 FROM generate_series(1, 10005) AS g;
DO $$ DECLARE n integer; pv record; BEGIN
  SELECT * INTO pv FROM public.preview_expired_analysis_log();
  ASSERT pv.eligible_rows = 10009 AND pv.next_call_rows = 10000, 'preview bound '||pv.eligible_rows||'/'||pv.next_call_rows;
  n := public.purge_expired_analysis_log();
  ASSERT n = 10000, 'first call should delete exactly 10000, got '||n;
  -- Oldest first: the 400-day row is gone; the 5 newest bulk rows and the 90d+1s/91d rows remain.
  ASSERT NOT EXISTS (SELECT 1 FROM public.analysis_log WHERE id = '00000000-0000-4000-8000-000000000b00'), 'oldest row not deleted first';
  ASSERT (SELECT count(*) FROM public.analysis_log WHERE created_at < now() - interval '90 days') = 9, 'remaining backlog wrong';
  n := public.purge_expired_analysis_log();
  ASSERT n = 9, 'second call should drain 9, got '||n;
  ASSERT public.purge_expired_analysis_log() = 0, 'third call not idempotent';
END $$;
ROLLBACK;

-- 3. fitShadow purge and row purge in either order: same end state.
BEGIN;
SELECT pg_temp.p1_seed();
SELECT pg_temp.p1_enable();
DO $$ DECLARE n integer; BEGIN
  n := public.purge_expired_fit_shadow();
  ASSERT n = 2, 'fitShadow purge (first) changed '||n;
  ASSERT public.purge_expired_analysis_log() = 4, 'purge after fitShadow';
  ASSERT (SELECT guard_metrics = '{"v":1}'::jsonb FROM public.analysis_log WHERE id = '00000000-0000-4000-8000-000000000e31'), 'order A: 31-day row not stripped to {"v":1}';
END $$;
ROLLBACK;
BEGIN;
SELECT pg_temp.p1_seed();
SELECT pg_temp.p1_enable();
DO $$ DECLARE n integer; BEGIN
  ASSERT public.purge_expired_analysis_log() = 4, 'purge (first)';
  n := public.purge_expired_fit_shadow();
  ASSERT n = 1, 'fitShadow purge after purge changed '||n;
  ASSERT (SELECT guard_metrics = '{"v":1}'::jsonb FROM public.analysis_log WHERE id = '00000000-0000-4000-8000-000000000e31'), 'order B: 31-day row not stripped to {"v":1}';
END $$;
ROLLBACK;

-- 4a. Account deletion THEN purge: rows unlinked (FK SET NULL), purge unchanged.
BEGIN;
SELECT pg_temp.p1_seed();
SELECT pg_temp.p1_enable();
DO $$ BEGIN
  DELETE FROM auth.users WHERE id = '00000000-0000-4000-8000-0000000000e1';
  ASSERT NOT EXISTS (SELECT 1 FROM public.analysis_log WHERE user_id = '00000000-0000-4000-8000-0000000000e1'), 'rows still linked after account deletion';
  ASSERT public.purge_expired_analysis_log() = 4, 'deletion-then-purge';
  ASSERT (SELECT count(*) FROM public.analysis_log WHERE id::text LIKE '00000000-0000-4000-8000-000000000%' AND user_id IS NULL) = 5, 'unlinked rows lost';
END $$;
ROLLBACK;
-- 4b. Purge THEN account deletion: deletion still succeeds.
BEGIN;
SELECT pg_temp.p1_seed();
SELECT pg_temp.p1_enable();
DO $$ BEGIN
  PERFORM public.purge_expired_analysis_log();
  DELETE FROM auth.users WHERE id = '00000000-0000-4000-8000-0000000000e1';
  ASSERT NOT EXISTS (SELECT 1 FROM auth.users WHERE id = '00000000-0000-4000-8000-0000000000e1'), 'account deletion failed after purge';
  ASSERT NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = '00000000-0000-4000-8000-0000000000e1'), 'profile not removed';
END $$;
ROLLBACK;

-- 5. Admin reports over a 500-day range (totals count kind='analyze' only):
--    the purge removes the expired analyze rows (1 success at 91 days, errors
--    at 90d+1s and 400 days); every inside-90-day figure is unchanged.
BEGIN;
SELECT pg_temp.p1_seed();
SELECT pg_temp.p1_enable();
UPDATE public.profiles SET role = 'admin' WHERE id = '00000000-0000-4000-8000-0000000000e1';
CREATE TEMP TABLE p1_r(tag text PRIMARY KEY, stats jsonb, ops jsonb, recent jsonb);
GRANT ALL ON p1_r TO authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
INSERT INTO p1_r SELECT 'before', public.admin_report_stats(now() - interval '500 days', now() + interval '1 day') - 'as_of',
                                  public.admin_report_ops(now() - interval '500 days', now() + interval '1 day'),
                                  public.admin_report_stats(now() - interval '89 days', now() + interval '1 day') - 'as_of';
RESET ROLE;
SELECT public.purge_expired_analysis_log();
SET LOCAL ROLE authenticated;
INSERT INTO p1_r SELECT 'purged', public.admin_report_stats(now() - interval '500 days', now() + interval '1 day') - 'as_of',
                                  public.admin_report_ops(now() - interval '500 days', now() + interval '1 day'),
                                  public.admin_report_stats(now() - interval '89 days', now() + interval '1 day') - 'as_of';
RESET ROLE;
DO $$
DECLARE b p1_r; p p1_r;
BEGIN
  SELECT * INTO b FROM p1_r WHERE tag = 'before';
  SELECT * INTO p FROM p1_r WHERE tag = 'purged';
  ASSERT (b.stats->>'total_success')::int = 4 AND (b.stats->>'total_error')::int = 3, 'seed totals unexpected: '||(b.stats->>'total_success')||'/'||(b.stats->>'total_error');
  ASSERT (p.stats->>'total_success')::int = 3 AND (p.stats->>'total_error')::int = 1, 'purged totals unexpected: '||(p.stats->>'total_success')||'/'||(p.stats->>'total_error');
  ASSERT p.recent = b.recent, 'purge changed an inside-90-day report';
  ASSERT b.ops->'error_categories' @> '[{"message":"Monthly analysis limit exceeded"}]', 'old error category missing before purge';
  ASSERT NOT (p.ops->'error_categories' @> '[{"message":"Monthly analysis limit exceeded"}]'), 'expired error category survived purge';
  ASSERT p.ops->'error_categories' @> '[{"message":"[upstream_timeout]"}]', 'error category at exactly 90 days lost';
END $$;
ROLLBACK;

-- 6. Disabled gate: anything but JSON true refuses (55000) before the period
--    is even read, so a bad period cannot turn a disabled purge into an error
--    that looks like a configuration problem. Preview still reports.
BEGIN;
SELECT pg_temp.p1_seed();
DO $$
DECLARE flag jsonb; n integer; f0 text := pg_temp.p1_all(); pv record;
BEGIN
  FOREACH flag IN ARRAY ARRAY['false'::jsonb, '"true"'::jsonb, '1'::jsonb, 'null'::jsonb, '{}'::jsonb, '[true]'::jsonb, '"yes"'::jsonb] LOOP
    PERFORM pg_temp.p1_set('analysis_log_retention_enabled', flag);
    BEGIN n := public.purge_expired_analysis_log(); RAISE EXCEPTION 'purge ran with enabled=%, deleted %', flag::text, n;
    EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
    SELECT * INTO pv FROM public.preview_expired_analysis_log();
    ASSERT pv.enabled IS FALSE AND pv.eligible_rows = 4, 'preview with enabled='||flag::text;
  END LOOP;
  -- Disabled + invalid period: still the disabled error, not 22023.
  PERFORM pg_temp.p1_set('analysis_log_retention_enabled', 'false'::jsonb);
  PERFORM pg_temp.p1_set('analysis_log_retention_days', '30'::jsonb);
  BEGIN n := public.purge_expired_analysis_log(); RAISE EXCEPTION 'purge ran disabled with bad period';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
  PERFORM pg_temp.p1_set('analysis_log_retention_days', '90'::jsonb);
  -- Missing flag row = disabled.
  DELETE FROM public.app_settings WHERE key = 'analysis_log_retention_enabled';
  BEGIN n := public.purge_expired_analysis_log(); RAISE EXCEPTION 'purge ran with flag row missing';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
  SELECT * INTO pv FROM public.preview_expired_analysis_log();
  ASSERT pv.enabled IS FALSE, 'preview enabled with flag row missing';
  ASSERT pg_temp.p1_all() = f0, 'rows changed while disabled';
END $$;
ROLLBACK;

-- 7. Time zone: the cutoff is an absolute instant. Under UTC (production) and
--    Asia/Ho_Chi_Minh (no DST) 90 days is exactly 2160 hours; the session time
--    zone never moves which rows are eligible.
BEGIN;
SELECT pg_temp.p1_seed();
DO $$ DECLARE c_utc timestamptz; c_vn timestamptz; pv record; BEGIN
  SET LOCAL TimeZone = 'UTC';
  c_utc := public.analysis_log_retention_cutoff();
  ASSERT c_utc = now() - interval '2160 hours', 'UTC cutoff is not exactly 2160 hours';
  SET LOCAL TimeZone = 'Asia/Ho_Chi_Minh';
  c_vn := public.analysis_log_retention_cutoff();
  ASSERT c_vn = c_utc, 'cutoff moved with session time zone';
  SELECT * INTO pv FROM public.preview_expired_analysis_log();
  ASSERT pv.eligible_rows = 4, 'eligible rows changed under Asia/Ho_Chi_Minh: '||pv.eligible_rows;
END $$;
ROLLBACK;
