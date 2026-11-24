-- PROPOSED (P1-B) test — run on a disposable local stack AFTER applying 01
-- (02 and 04 optional — the cron assertions accept each job absent or exactly
-- as defined; 03 optional). Not in supabase/tests, so CI does not run it until
-- the migration is adopted (then move it to supabase/tests/). Synthetic rows
-- only; every block rolls back.
--
-- Seeded ages (days): 31 (fitShadow), 89, 90 (error), 91 (fitShadow), 120
-- (error), 120 (already minimal), 200 (unlinked), 399, 400 (error), 401, and a
-- 5-minute-old document row. Defaults: detail 90, rows 400.
--   scrub  -> 6 rows (91, 120 error, 200, 399, 400, 401); 89/90 keep detail
--   purge  -> 1 row  (401); 399/400 kept

CREATE FUNCTION pg_temp.p1_seed() RETURNS void LANGUAGE sql AS $$
  INSERT INTO auth.users(id) VALUES ('00000000-0000-4000-8000-0000000000e1');
  INSERT INTO public.profiles(id, email, plan, role, usage_count)
    VALUES ('00000000-0000-4000-8000-0000000000e1', 'p1-retention@example.test', 'free', 'user', 3);
  -- CV/JD-bearing table is user-managed: a 500-day-old row must survive.
  INSERT INTO public.history(user_id, analysis_id, timestamp)
    VALUES ('00000000-0000-4000-8000-0000000000e1', 'p1-old-history', now() - interval '500 days');
  INSERT INTO public.analysis_log(id, user_id, status, kind, created_at, input_tokens, output_tokens, model, latency_ms, error_message, guard_metrics) VALUES
    ('00000000-0000-4000-8000-000000000e31', '00000000-0000-4000-8000-0000000000e1', 'success', 'analyze',  now() - interval '31 days',  10, 1, 'm', 100, NULL, '{"v":1,"fitShadow":{"v":1}}'),
    ('00000000-0000-4000-8000-000000000e89', '00000000-0000-4000-8000-0000000000e1', 'success', 'analyze',  now() - interval '89 days',  10, 1, 'm', 110, NULL, '{"v":1}'),
    ('00000000-0000-4000-8000-000000000e90', '00000000-0000-4000-8000-0000000000e1', 'error',   'analyze',  now() - interval '90 days',  0,  0, NULL, NULL, '[upstream_timeout]', NULL),
    ('00000000-0000-4000-8000-000000000e91', '00000000-0000-4000-8000-0000000000e1', 'success', 'analyze',  now() - interval '91 days',  20, 2, 'm', 120, NULL, '{"v":1,"fitShadow":{"v":1}}'),
    ('00000000-0000-4000-8000-000000000e92', '00000000-0000-4000-8000-0000000000e1', 'error',   'parse_cv', now() - interval '120 days', 0,  0, NULL, NULL, '[upstream]', NULL),
    ('00000000-0000-4000-8000-000000000d20', '00000000-0000-4000-8000-0000000000e1', 'success', 'analyze',  now() - interval '120 days', 7,  1, 'm', 90, NULL, NULL),
    ('00000000-0000-4000-8000-000000000e93', NULL,                                   'success', 'rewrite',  now() - interval '200 days', 30, 3, 'm', 130, NULL, '{"v":1,"coverLetter":{}}'),
    ('00000000-0000-4000-8000-000000000a99', '00000000-0000-4000-8000-0000000000e1', 'success', 'analyze',  now() - interval '399 days', 40, 4, 'm', 140, NULL, '{"v":1}'),
    ('00000000-0000-4000-8000-000000000b00', '00000000-0000-4000-8000-0000000000e1', 'error',   'analyze',  now() - interval '400 days', 0,  0, NULL, NULL, 'Monthly analysis limit exceeded', NULL),
    ('00000000-0000-4000-8000-000000000c01', '00000000-0000-4000-8000-0000000000e1', 'success', 'rewrite',  now() - interval '401 days', 50, 5, 'm', 150, NULL, '{"v":1,"coverLetter":{}}'),
    ('00000000-0000-4000-8000-000000000e94', '00000000-0000-4000-8000-0000000000e1', 'success', 'rewrite',  now() - interval '5 minutes', 5, 1, 'm', 50, NULL, '{"v":1,"coverLetter":{}}');
$$;
CREATE FUNCTION pg_temp.p1_set(k text, v jsonb) RETURNS void LANGUAGE sql AS $$
  UPDATE public.app_settings SET value = v WHERE key = k;
$$;
-- Fingerprints over the seeded rows: minimal (kept) fields, and every column.
CREATE FUNCTION pg_temp.p1_min() RETURNS text LANGUAGE sql AS $$
  SELECT md5(coalesce(string_agg(concat_ws('|', id, user_id, kind, status, created_at, input_tokens, output_tokens, model, latency_ms), ',' ORDER BY id), ''))
    FROM public.analysis_log WHERE id::text LIKE '00000000-0000-4000-8000-000000000%';
$$;
CREATE FUNCTION pg_temp.p1_all() RETURNS text LANGUAGE sql AS $$
  SELECT md5(coalesce(string_agg(concat_ws('|', id, user_id, kind, status, created_at, input_tokens, output_tokens, model, latency_ms, error_message, guard_metrics::text), ',' ORDER BY id), ''))
    FROM public.analysis_log WHERE id::text LIKE '00000000-0000-4000-8000-000000000%';
$$;
CREATE FUNCTION pg_temp.p1_has_detail(i uuid) RETURNS boolean LANGUAGE sql AS $$
  SELECT error_message IS NOT NULL OR guard_metrics IS NOT NULL FROM public.analysis_log WHERE id = i;
$$;

-- 1. Core behaviour at the seeded defaults (90 / 400), unrelated tables,
--    permissions, cron, dependency guard.
BEGIN;
SELECT pg_temp.p1_seed();
DO $$
DECLARE
  u uuid := '00000000-0000-4000-8000-0000000000e1';
  rollup boolean := to_regclass('public.analysis_log_daily') IS NOT NULL;
  t_ledger bigint; t_hist bigint; t_prof bigint; t_audit bigint; t_pay bigint; t_set bigint; t_usage bigint;
  n integer; m0 text; d0 bigint; d1 bigint;
BEGIN
  ASSERT (SELECT value = '90'::jsonb FROM public.app_settings WHERE key = 'analysis_log_detail_retention_days'), 'detail setting not seeded to 90';
  ASSERT (SELECT value = '400'::jsonb FROM public.app_settings WHERE key = 'analysis_log_retention_days'), 'row setting not seeded to 400';
  ASSERT to_regprocedure('public.analysis_log_retention_cutoff()') IS NULL, 'option A helper still present';
  SELECT count(*) INTO t_ledger FROM public.analytics_quota_reservations;
  SELECT count(*) INTO t_hist   FROM public.history;
  SELECT count(*) INTO t_prof   FROM public.profiles;
  SELECT count(*) INTO t_audit  FROM public.admin_audit_log;
  SELECT count(*) INTO t_pay    FROM public.payments;
  SELECT count(*) INTO t_set    FROM public.app_settings;
  SELECT coalesce(sum(usage_count), 0) INTO t_usage FROM public.profiles;
  IF rollup THEN
    -- Pre-existing cell for the 401-day row's day: exercises the ON CONFLICT merge.
    INSERT INTO public.analysis_log_daily(day, kind, status, rows, input_tokens, output_tokens)
    VALUES (((now() - interval '401 days') AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 'rewrite', 'success', 5, 100, 10)
    ON CONFLICT (day, kind, status) DO UPDATE SET rows = 5, input_tokens = 100, output_tokens = 10;
    SELECT coalesce(sum(rows), 0) INTO d0 FROM public.analysis_log_daily;
  END IF;

  -- Permissions: owned by postgres; DEFINER, fixed search_path, no API role may
  -- execute (cron and the owner run them as postgres); helper private.
  ASSERT (SELECT count(*) = 3 AND bool_and(pg_get_userbyid(proowner) = 'postgres') FROM pg_proc
           WHERE oid IN ('public.purge_expired_analysis_log()'::regprocedure, 'public.scrub_expired_analysis_log_detail()'::regprocedure,
                         'public.analysis_log_retention_cutoffs()'::regprocedure)), 'P1 functions not owned by postgres';
  ASSERT (SELECT bool_and(prosecdef AND proconfig IS NOT DISTINCT FROM ARRAY['search_path=""']) FROM pg_proc
           WHERE oid IN ('public.purge_expired_analysis_log()'::regprocedure, 'public.scrub_expired_analysis_log_detail()'::regprocedure)), 'not DEFINER/fixed search_path';
  ASSERT (SELECT NOT prosecdef AND proconfig IS NOT DISTINCT FROM ARRAY['search_path=""'] FROM pg_proc WHERE oid = 'public.analysis_log_retention_cutoffs()'::regprocedure), 'helper must be INVOKER with fixed search_path';
  ASSERT NOT has_function_privilege('anon', 'public.purge_expired_analysis_log()', 'EXECUTE')
     AND NOT has_function_privilege('authenticated', 'public.purge_expired_analysis_log()', 'EXECUTE')
     AND NOT has_function_privilege('service_role', 'public.purge_expired_analysis_log()', 'EXECUTE')
     AND NOT has_function_privilege('public', 'public.purge_expired_analysis_log()', 'EXECUTE'), 'purge EXECUTE granted to an API role';
  ASSERT NOT has_function_privilege('anon', 'public.scrub_expired_analysis_log_detail()', 'EXECUTE')
     AND NOT has_function_privilege('authenticated', 'public.scrub_expired_analysis_log_detail()', 'EXECUTE')
     AND NOT has_function_privilege('service_role', 'public.scrub_expired_analysis_log_detail()', 'EXECUTE')
     AND NOT has_function_privilege('public', 'public.scrub_expired_analysis_log_detail()', 'EXECUTE'), 'scrub EXECUTE granted to an API role';
  ASSERT NOT has_function_privilege('anon', 'public.analysis_log_retention_cutoffs()', 'EXECUTE')
     AND NOT has_function_privilege('authenticated', 'public.analysis_log_retention_cutoffs()', 'EXECUTE')
     AND NOT has_function_privilege('service_role', 'public.analysis_log_retention_cutoffs()', 'EXECUTE'), 'cutoff helper exposed';
  -- The only admin write path for app_settings cannot touch either retention key.
  UPDATE public.profiles SET role = 'admin' WHERE id = u;  -- rolled back with the block
  BEGIN
    PERFORM public.admin_update_app_setting(u, 'analysis_log_retention_days', '366'::jsonb);
    RAISE EXCEPTION 'admin_update_app_setting accepted row retention key';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.admin_update_app_setting(u, 'analysis_log_detail_retention_days', '400'::jsonb);
    RAISE EXCEPTION 'admin_update_app_setting accepted detail retention key';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  UPDATE public.profiles SET role = 'user' WHERE id = u;
  ASSERT NOT has_table_privilege('authenticated', 'public.app_settings', 'UPDATE')
     AND NOT has_table_privilege('anon', 'public.app_settings', 'UPDATE'), 'API roles can write app_settings';

  -- Stage 1: scrub. 89/90 keep detail; 91+ lose it; minimal fields unchanged.
  m0 := pg_temp.p1_min();
  n := public.scrub_expired_analysis_log_detail();
  ASSERT n = 6, 'expected 6 scrubbed, got '||n;
  ASSERT pg_temp.p1_min() = m0, 'scrub changed a minimal field';
  ASSERT (SELECT guard_metrics = '{"v":1}'::jsonb FROM public.analysis_log WHERE id = '00000000-0000-4000-8000-000000000e89'), '89-day row scrubbed';
  ASSERT (SELECT error_message = '[upstream_timeout]' FROM public.analysis_log WHERE id = '00000000-0000-4000-8000-000000000e90'), 'exactly-90-day row scrubbed';
  ASSERT NOT EXISTS (SELECT 1 FROM public.analysis_log WHERE id::text LIKE '00000000-0000-4000-8000-000000000%' AND created_at < now() - interval '90 days'
                      AND (error_message IS NOT NULL OR guard_metrics IS NOT NULL)), 'detail left on a row older than 90 days';
  -- Recent rows (1-hour AI cap and document cap markers) intact.
  ASSERT (SELECT guard_metrics = '{"v":1,"coverLetter":{}}'::jsonb AND user_id = u FROM public.analysis_log WHERE id = '00000000-0000-4000-8000-000000000e94'), 'recent document row changed';
  ASSERT (SELECT guard_metrics = '{"v":1,"fitShadow":{"v":1}}'::jsonb FROM public.analysis_log WHERE id = '00000000-0000-4000-8000-000000000e31'), 'scrub touched a 31-day row';
  n := public.scrub_expired_analysis_log_detail();
  ASSERT n = 0, 'second scrub changed '||n;

  -- Stage 2: row purge. 399/400 kept; 401 deleted.
  n := public.purge_expired_analysis_log();
  ASSERT n = 1, 'expected 1 deleted (401d), got '||n;
  ASSERT EXISTS (SELECT 1 FROM public.analysis_log WHERE id = '00000000-0000-4000-8000-000000000a99'), '399-day row deleted';
  ASSERT EXISTS (SELECT 1 FROM public.analysis_log WHERE id = '00000000-0000-4000-8000-000000000b00'), 'exactly-400-day row deleted';
  ASSERT NOT EXISTS (SELECT 1 FROM public.analysis_log WHERE id = '00000000-0000-4000-8000-000000000c01'), '401-day row kept';
  ASSERT (SELECT count(*) FROM public.analysis_log WHERE id::text LIKE '00000000-0000-4000-8000-000000000%') = 10, 'wrong rows remain';
  n := public.purge_expired_analysis_log();
  ASSERT n = 0, 'second purge deleted '||n;

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
    ASSERT d1 - d0 = 1, 'rollup counted '||(d1 - d0)||' rows, expected 1';
    ASSERT (SELECT rows = 6 AND input_tokens = 150 AND output_tokens = 15 FROM public.analysis_log_daily
             WHERE day = ((now() - interval '401 days') AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AND kind = 'rewrite' AND status = 'success'),
      'rollup merge into an existing cell is not additive';
    ASSERT NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'analysis_log_daily' AND column_name IN ('user_id','id','created_at')), 'rollup carries identifiers';
    ASSERT (SELECT relacl::text FROM pg_class WHERE oid = 'public.analysis_log_daily'::regclass) = '{postgres=arwdDxtm/postgres,authenticated=r/postgres}', 'rollup ACL not least-privilege';
  END IF;

  -- Cron: scrub (02) and row purge (04) are separate, separately approved
  -- migrations, so each job may be absent (0) — but never duplicated, and if
  -- present its definition must match. 4 existing jobs intact.
  ASSERT (SELECT count(*) FROM cron.job WHERE jobname = 'scrub-analysis-log-detail') <= 1, 'scrub job duplicated';
  ASSERT NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'scrub-analysis-log-detail')
      OR EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'scrub-analysis-log-detail' AND schedule = '30 20 * * *' AND command = 'SELECT public.scrub_expired_analysis_log_detail()' AND active AND username = 'postgres'), 'scrub job definition';
  ASSERT (SELECT count(*) FROM cron.job WHERE jobname = 'purge-analysis-log') <= 1, 'purge job duplicated';
  ASSERT NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-analysis-log')
      OR EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-analysis-log' AND schedule = '40 20 * * *' AND command = 'SELECT public.purge_expired_analysis_log()' AND active AND username = 'postgres'), 'purge job definition';
  ASSERT (SELECT count(*) FROM cron.job WHERE jobname IN ('purge-free-history','purge-api-rate-limits','storage-cleanup','purge-fit-shadow')) = 4, 'existing cron jobs missing';
  -- P0-H analysis_log ACL unchanged.
  ASSERT (SELECT relacl::text FROM pg_class WHERE oid = 'public.analysis_log'::regclass) = '{postgres=arwdDxtm/postgres,authenticated=r/postgres,service_role=ar/postgres}', 'analysis_log ACL changed';
  -- Dependency guard: the only SQL functions reading analysis_log are the admin
  -- reports, the fitShadow purge and the two P1 stages (no quota / billing /
  -- deletion RPC depends on it).
  ASSERT (SELECT array_agg(proname::text ORDER BY proname) FROM pg_proc
           WHERE pronamespace = 'public'::regnamespace AND prosrc ILIKE '%analysis_log%' AND proname <> 'analysis_log_retention_cutoffs')
         = ARRAY['admin_report_ops','admin_report_stats','purge_expired_analysis_log','purge_expired_fit_shadow','scrub_expired_analysis_log_detail'],
    'unexpected analysis_log dependency: '||(SELECT array_agg(proname::text ORDER BY proname) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND prosrc ILIKE '%analysis_log%')::text;
  ASSERT NOT EXISTS (SELECT 1 FROM pg_constraint WHERE confrelid = 'public.analysis_log'::regclass), 'inbound FK on analysis_log';
  ASSERT NOT EXISTS (SELECT 1 FROM pg_depend d JOIN pg_rewrite r ON r.oid = d.objid WHERE d.refobjid = 'public.analysis_log'::regclass), 'view depends on analysis_log';
  ASSERT NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.analysis_log'::regclass AND NOT tgisinternal), 'trigger on analysis_log';
END $$;
-- No API role can call either stage: asserted above with has_function_privilege
-- and end-to-end over PostgREST (403/401) in cron_integration.sh. Not by calling
-- here: on supabase/postgres 17.6.1.106 (aarch64) a denied function call after
-- SET ROLE in a postgres psql session segfaults the backend (PostgREST's
-- authenticator path returns 42501 cleanly).
ROLLBACK;

-- 2a. Invalid configuration fails closed: both stages raise, nothing changes.
BEGIN;
SELECT pg_temp.p1_seed();
DO $$
DECLARE bad jsonb; n integer; f0 text := pg_temp.p1_all(); k text;
BEGIN
  -- Row retention (detail kept at 90).
  FOREACH bad IN ARRAY ARRAY['365'::jsonb, '90'::jsonb, '0'::jsonb, '-5'::jsonb, '3651'::jsonb, '400.5'::jsonb, '"400"'::jsonb, 'null'::jsonb, '{}'::jsonb,
                             '99999999999'::jsonb, '1e10'::jsonb, '400.0'::jsonb, 'true'::jsonb] LOOP
    PERFORM pg_temp.p1_set('analysis_log_retention_days', bad);
    BEGIN n := public.scrub_expired_analysis_log_detail(); RAISE EXCEPTION 'scrub accepted row retention %, changed %', bad::text, n;
    EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
    BEGIN n := public.purge_expired_analysis_log(); RAISE EXCEPTION 'purge accepted row retention %, deleted %', bad::text, n;
    EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
    ASSERT pg_temp.p1_all() = f0, 'rows changed with row retention '||bad::text;
  END LOOP;
  PERFORM pg_temp.p1_set('analysis_log_retention_days', '400'::jsonb);
  -- Detail retention (rows kept at 400): below floor, above row retention, wrong types.
  FOREACH bad IN ARRAY ARRAY['89'::jsonb, '0'::jsonb, '401'::jsonb, '90.5'::jsonb, '"90"'::jsonb, 'null'::jsonb, '[]'::jsonb, '99999999999'::jsonb] LOOP
    PERFORM pg_temp.p1_set('analysis_log_detail_retention_days', bad);
    BEGIN n := public.scrub_expired_analysis_log_detail(); RAISE EXCEPTION 'scrub accepted detail retention %, changed %', bad::text, n;
    EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
    BEGIN n := public.purge_expired_analysis_log(); RAISE EXCEPTION 'purge accepted detail retention %, deleted %', bad::text, n;
    EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
    ASSERT pg_temp.p1_all() = f0, 'rows changed with detail retention '||bad::text;
  END LOOP;
  PERFORM pg_temp.p1_set('analysis_log_detail_retention_days', '90'::jsonb);
  -- Missing keys.
  FOREACH k IN ARRAY ARRAY['analysis_log_retention_days', 'analysis_log_detail_retention_days'] LOOP
    DELETE FROM public.app_settings WHERE key = k;
    BEGIN n := public.scrub_expired_analysis_log_detail(); RAISE EXCEPTION 'scrub accepted missing %', k;
    EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
    BEGIN n := public.purge_expired_analysis_log(); RAISE EXCEPTION 'purge accepted missing %', k;
    EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
    ASSERT pg_temp.p1_all() = f0, 'rows changed with missing '||k;
    INSERT INTO public.app_settings(key, value) VALUES (k, CASE k WHEN 'analysis_log_retention_days' THEN '400'::jsonb ELSE '90'::jsonb END);
  END LOOP;
END $$;
ROLLBACK;

-- 2b. Valid non-default values are honoured.
BEGIN;
SELECT pg_temp.p1_seed();
DO $$ DECLARE n integer; BEGIN
  PERFORM pg_temp.p1_set('analysis_log_detail_retention_days', '150'::jsonb);
  n := public.scrub_expired_analysis_log_detail();
  ASSERT n = 4, 'detail 150 should scrub 200/399/400/401, got '||n;
  ASSERT pg_temp.p1_has_detail('00000000-0000-4000-8000-000000000e92'), 'detail 150 scrubbed a 120-day row';
  n := public.purge_expired_analysis_log();
  ASSERT n = 1, 'rows 400 should delete 401 only, got '||n;
END $$;
ROLLBACK;
BEGIN;
SELECT pg_temp.p1_seed();
DO $$ DECLARE n integer; BEGIN
  -- Lowest allowed row retention; detail may equal it.
  PERFORM pg_temp.p1_set('analysis_log_retention_days', '366'::jsonb);
  PERFORM pg_temp.p1_set('analysis_log_detail_retention_days', '366'::jsonb);
  n := public.scrub_expired_analysis_log_detail();
  ASSERT n = 3, 'detail 366 should scrub 399/400/401, got '||n;
  ASSERT pg_temp.p1_has_detail('00000000-0000-4000-8000-000000000e93'), 'detail 366 scrubbed a 200-day row';
  n := public.purge_expired_analysis_log();
  ASSERT n = 3, 'rows 366 should delete 399/400/401, got '||n;
  PERFORM pg_temp.p1_set('analysis_log_retention_days', '3650'::jsonb);
  ASSERT public.purge_expired_analysis_log() = 0, 'rows 3650 deleted something';
END $$;
ROLLBACK;

-- 3a. fitShadow purge THEN scrub.
BEGIN;
SELECT pg_temp.p1_seed();
DO $$ DECLARE n integer; BEGIN
  n := public.purge_expired_fit_shadow();
  ASSERT n = 2, 'fitShadow purge (first) changed '||n;
  n := public.scrub_expired_analysis_log_detail();
  ASSERT n = 6, 'scrub after fitShadow changed '||n;
  ASSERT (SELECT guard_metrics = '{"v":1}'::jsonb FROM public.analysis_log WHERE id = '00000000-0000-4000-8000-000000000e31'), 'order A: 31-day row not stripped to {"v":1}';
  ASSERT (SELECT guard_metrics IS NULL FROM public.analysis_log WHERE id = '00000000-0000-4000-8000-000000000e91'), 'order A: 91-day row not scrubbed';
END $$;
ROLLBACK;
-- 3b. scrub THEN fitShadow purge: same end state.
BEGIN;
SELECT pg_temp.p1_seed();
DO $$ DECLARE n integer; BEGIN
  n := public.scrub_expired_analysis_log_detail();
  ASSERT n = 6, 'scrub (first) changed '||n;
  n := public.purge_expired_fit_shadow();
  ASSERT n = 1, 'fitShadow purge after scrub changed '||n;
  ASSERT (SELECT guard_metrics = '{"v":1}'::jsonb FROM public.analysis_log WHERE id = '00000000-0000-4000-8000-000000000e31'), 'order B: 31-day row not stripped to {"v":1}';
  ASSERT (SELECT guard_metrics IS NULL FROM public.analysis_log WHERE id = '00000000-0000-4000-8000-000000000e91'), 'order B: 91-day row not scrubbed';
END $$;
ROLLBACK;

-- 4a. Account deletion THEN scrub + purge: rows unlinked (FK SET NULL), counts unchanged.
BEGIN;
SELECT pg_temp.p1_seed();
DO $$ DECLARE n integer; BEGIN
  DELETE FROM auth.users WHERE id = '00000000-0000-4000-8000-0000000000e1';
  ASSERT NOT EXISTS (SELECT 1 FROM public.analysis_log WHERE user_id = '00000000-0000-4000-8000-0000000000e1'), 'rows still linked after account deletion';
  n := public.scrub_expired_analysis_log_detail();
  ASSERT n = 6, 'deletion-then-scrub changed '||n;
  n := public.purge_expired_analysis_log();
  ASSERT n = 1, 'deletion-then-purge deleted '||n;
  ASSERT (SELECT count(*) FROM public.analysis_log WHERE id::text LIKE '00000000-0000-4000-8000-000000000%' AND user_id IS NULL) = 10, 'unlinked rows lost';
END $$;
ROLLBACK;
-- 4b. Scrub + purge THEN account deletion: deletion still succeeds.
BEGIN;
SELECT pg_temp.p1_seed();
DO $$ BEGIN
  PERFORM public.scrub_expired_analysis_log_detail();
  PERFORM public.purge_expired_analysis_log();
  DELETE FROM auth.users WHERE id = '00000000-0000-4000-8000-0000000000e1';
  ASSERT NOT EXISTS (SELECT 1 FROM auth.users WHERE id = '00000000-0000-4000-8000-0000000000e1'), 'account deletion failed after purge';
  ASSERT NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = '00000000-0000-4000-8000-0000000000e1'), 'profile not removed';
END $$;
ROLLBACK;

-- 5. Admin reports: the scrub leaves every count, token and latency figure
--    unchanged; only error categories older than 90 days disappear. The row
--    purge then removes the 401-day row from the totals.
BEGIN;
SELECT pg_temp.p1_seed();
UPDATE public.profiles SET role = 'admin' WHERE id = '00000000-0000-4000-8000-0000000000e1';
CREATE TEMP TABLE p1_r(tag text PRIMARY KEY, stats jsonb, ops jsonb);
GRANT ALL ON p1_r TO authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
INSERT INTO p1_r SELECT 'before', public.admin_report_stats(now() - interval '500 days', now() + interval '1 day') - 'as_of',
                                  public.admin_report_ops(now() - interval '500 days', now() + interval '1 day');
RESET ROLE;
SELECT public.scrub_expired_analysis_log_detail();
SET LOCAL ROLE authenticated;
INSERT INTO p1_r SELECT 'scrubbed', public.admin_report_stats(now() - interval '500 days', now() + interval '1 day') - 'as_of',
                                    public.admin_report_ops(now() - interval '500 days', now() + interval '1 day');
RESET ROLE;
SELECT public.purge_expired_analysis_log();
SET LOCAL ROLE authenticated;
INSERT INTO p1_r SELECT 'purged', public.admin_report_stats(now() - interval '500 days', now() + interval '1 day') - 'as_of',
                                  public.admin_report_ops(now() - interval '500 days', now() + interval '1 day');
RESET ROLE;
DO $$
DECLARE b p1_r; s p1_r; p p1_r;
BEGIN
  SELECT * INTO b FROM p1_r WHERE tag = 'before';
  SELECT * INTO s FROM p1_r WHERE tag = 'scrubbed';
  SELECT * INTO p FROM p1_r WHERE tag = 'purged';
  ASSERT (b.stats->>'total_success')::int = 5 AND (b.stats->>'total_error')::int = 2, 'seed totals unexpected: '||b.stats::text;
  ASSERT s.stats = b.stats, 'scrub changed admin_report_stats';
  ASSERT s.ops->'latency_p50_ms' = b.ops->'latency_p50_ms' AND s.ops->'latency_p95_ms' = b.ops->'latency_p95_ms', 'scrub changed latency';
  ASSERT b.ops->'error_categories' @> '[{"message":"Monthly analysis limit exceeded"}]', 'old error category missing before scrub';
  ASSERT NOT (s.ops->'error_categories' @> '[{"message":"Monthly analysis limit exceeded"}]'), 'error category older than 90 days survived scrub';
  ASSERT s.ops->'error_categories' @> '[{"message":"[upstream_timeout]"}]', 'error category inside 90 days lost';
  -- Purge removes only the 401-day rewrite row: analyze totals unchanged; tokens drop by its 50/5.
  ASSERT p.stats->'total_success' = s.stats->'total_success' AND p.stats->'total_error' = s.stats->'total_error', 'purge changed analyze totals';
  ASSERT (s.stats->>'total_input_tokens')::bigint - (p.stats->>'total_input_tokens')::bigint = 50
     AND (s.stats->>'total_output_tokens')::bigint - (p.stats->>'total_output_tokens')::bigint = 5, 'purge token delta wrong';
END $$;
ROLLBACK;
