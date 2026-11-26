-- D1 Phase A migration on a database that already holds analysis_log data.
-- Needs the fixture loaded before the migration:
-- FIXTURE_BEFORE=20261126000000:/repo/tests/fixtures/pre_d1_analysis_log.sql \
--   supabase/tests/local/run.sh "$PWD" /repo/tests/analysis_log_retention.fixture-test.sql
-- (Not named *.test.sql: the plain suite runs without the fixture.)
CREATE FUNCTION pg_temp.d1_now() RETURNS TABLE(log_rows bigint, log_md5 text, history_md5 text, profiles_md5 text) LANGUAGE sql AS $$
  SELECT (SELECT count(*) FROM public.analysis_log),
         (SELECT md5(string_agg(concat_ws('|', id, user_id, status, kind, created_at, input_tokens, output_tokens, model, latency_ms, error_message, guard_metrics::text), ',' ORDER BY id)) FROM public.analysis_log),
         (SELECT md5(string_agg(concat_ws('|', user_id, analysis_id, timestamp), ',' ORDER BY analysis_id)) FROM public.history),
         (SELECT md5(string_agg(concat_ws('|', id, plan, usage_count), ',' ORDER BY id)) FROM public.profiles);
$$;
BEGIN;
DO $$
DECLARE s record; c record; pv record;
BEGIN
  ASSERT to_regclass('public.zz_pre_d1_snapshot') IS NOT NULL, 'fixture missing: run with FIXTURE_BEFORE';
  SELECT * INTO s FROM public.zz_pre_d1_snapshot;
  SELECT * INTO c FROM pg_temp.d1_now();
  ASSERT s.log_rows = 61 AND s.log_old_rows = 48, 'fixture size '||s.log_rows||'/'||s.log_old_rows;
  -- The migration deleted and changed nothing.
  ASSERT c.log_rows = s.log_rows AND c.log_md5 = s.log_md5, 'migration changed analysis_log';
  ASSERT c.history_md5 = s.history_md5 AND c.profiles_md5 = s.profiles_md5, 'migration changed history/profiles';
  -- Shipped disabled, period seeded, dry run sees the backlog.
  ASSERT (SELECT value FROM public.app_settings WHERE key = 'analysis_log_retention_enabled') = 'false'::jsonb, 'not disabled';
  ASSERT (SELECT value FROM public.app_settings WHERE key = 'analysis_log_retention_days') = '90'::jsonb, 'period not 90';
  SELECT * INTO pv FROM public.preview_expired_analysis_log();
  ASSERT pv.enabled IS FALSE AND pv.eligible_rows = 48, 'preview '||pv.enabled||'/'||pv.eligible_rows;
  BEGIN
    PERFORM public.purge_expired_analysis_log();
    RAISE EXCEPTION 'purge ran right after migration';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
  END;
  -- An operator-chosen value must survive a re-apply.
  UPDATE public.app_settings SET value = '120'::jsonb WHERE key = 'analysis_log_retention_days';
END $$;
-- Re-apply the migration file as-is: idempotent, overwrites nothing, deletes nothing.
\i /repo/migrations/20261126000000_analysis_log_retention_disabled.sql
DO $$
DECLARE s record; c record;
BEGIN
  SELECT * INTO s FROM public.zz_pre_d1_snapshot;
  SELECT * INTO c FROM pg_temp.d1_now();
  ASSERT c.log_rows = s.log_rows AND c.log_md5 = s.log_md5, 're-apply changed analysis_log';
  ASSERT (SELECT value FROM public.app_settings WHERE key = 'analysis_log_retention_days') = '120'::jsonb, 're-apply overwrote the period';
  ASSERT (SELECT value FROM public.app_settings WHERE key = 'analysis_log_retention_enabled') = 'false'::jsonb, 're-apply changed the flag';
  ASSERT (SELECT count(*) FROM public.app_settings WHERE key LIKE 'analysis_log_retention%') = 2, 'duplicate settings';
  ASSERT NOT has_function_privilege('anon', 'public.purge_expired_analysis_log()', 'EXECUTE')
     AND NOT has_function_privilege('authenticated', 'public.purge_expired_analysis_log()', 'EXECUTE')
     AND NOT has_function_privilege('service_role', 'public.purge_expired_analysis_log()', 'EXECUTE'), 're-apply re-granted EXECUTE';
END $$;
ROLLBACK;
