-- P1-D1 Phase A: retention functions for public.analysis_log, DISABLED.
--
-- Additive only. This migration deletes nothing and schedules nothing:
--   * seeds app_settings 'analysis_log_retention_days' = 90 and
--     'analysis_log_retention_enabled' = false (ON CONFLICT DO NOTHING, so a
--     re-run never overwrites an operator's value);
--   * creates purge_expired_analysis_log(), which REFUSES to run (SQLSTATE
--     55000) unless 'analysis_log_retention_enabled' is exactly JSON true;
--   * creates preview_expired_analysis_log(), a read-only dry run that works
--     while disabled.
-- Turning retention on (setting the flag, running the first purge, scheduling
-- a daily job) is a separate, owner-approved step; the privacy policy is only
-- updated after deletion actually runs.
--
-- analysis_log holds one row per AI call (status, kind, tokens, latency,
-- error code, guard telemetry; no CV/JD text). Nothing references it (no
-- inbound FK, view or trigger); quota and billing live in their own tables;
-- the hourly AI cap reads the last hour only; admin reports read date ranges.
--
-- Fail-closed configuration:
--   * enabled flag: anything other than JSON true (missing, false, "true", 1,
--     null) means disabled; checked before anything else;
--   * period: a JSON integer of at most 4 digits in [90, 3650], else 22023
--     (going below 90 needs a migration);
--   * admin_update_app_setting only accepts 'default_monthly_analytics_limit',
--     and anon/authenticated cannot write app_settings.
-- Bounded: at most 10000 rows per call, oldest first; a repeat call deletes 0
-- once caught up. Cutoff = now() - N days on timestamptz (database TimeZone is
-- UTC, so N days is exactly N * 24 hours).

INSERT INTO public.app_settings (key, value) VALUES
  ('analysis_log_retention_days', '90'::jsonb),
  ('analysis_log_retention_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.analysis_log_retention_cutoff()
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE v jsonb; d integer;
BEGIN
  SELECT s.value INTO v FROM public.app_settings AS s WHERE s.key = 'analysis_log_retention_days';
  IF v IS NULL OR jsonb_typeof(v) <> 'number' OR (v #>> '{}') !~ '^[0-9]{1,4}$' THEN
    RAISE EXCEPTION 'analysis_log_retention_days missing or not an integer' USING ERRCODE = '22023';
  END IF;
  d := (v #>> '{}')::integer;
  IF d < 90 OR d > 3650 THEN
    RAISE EXCEPTION 'analysis_log_retention_days % outside [90, 3650]', d USING ERRCODE = '22023';
  END IF;
  RETURN now() - make_interval(days => d);
END;
$$;

REVOKE ALL ON FUNCTION public.analysis_log_retention_cutoff() FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.purge_expired_analysis_log()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE n integer; c timestamptz;
BEGIN
  IF (SELECT s.value FROM public.app_settings AS s WHERE s.key = 'analysis_log_retention_enabled') IS DISTINCT FROM 'true'::jsonb THEN
    RAISE EXCEPTION 'analysis_log retention is disabled' USING ERRCODE = '55000';
  END IF;
  c := public.analysis_log_retention_cutoff();
  DELETE FROM public.analysis_log
   WHERE id IN (SELECT l.id FROM public.analysis_log AS l
                 WHERE l.created_at < c
                 ORDER BY l.created_at
                 LIMIT 10000);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- Dry run: what the next purge call would delete if enabled. Counts and
-- timestamps only; changes nothing.
CREATE OR REPLACE FUNCTION public.preview_expired_analysis_log(
  OUT enabled boolean,
  OUT cutoff timestamptz,
  OUT eligible_rows bigint,
  OUT next_call_rows bigint,
  OUT oldest_eligible timestamptz,
  OUT newest_eligible timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  enabled := coalesce((SELECT s.value = 'true'::jsonb FROM public.app_settings AS s WHERE s.key = 'analysis_log_retention_enabled'), false);
  cutoff := public.analysis_log_retention_cutoff();
  SELECT count(*), min(l.created_at), max(l.created_at)
    INTO eligible_rows, oldest_eligible, newest_eligible
    FROM public.analysis_log AS l WHERE l.created_at < cutoff;
  next_call_rows := least(eligible_rows, 10000);
END;
$$;

-- Only the database owner (postgres: SQL editor, a future pg_cron job) may run
-- these. No API role, including service_role, gets EXECUTE.
REVOKE ALL ON FUNCTION public.purge_expired_analysis_log() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.preview_expired_analysis_log() FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.analysis_log_retention_cutoff() IS
  'P1-D1: now() - app_settings.analysis_log_retention_days; raises 22023 unless a JSON integer in [90, 3650].';
COMMENT ON FUNCTION public.purge_expired_analysis_log() IS
  'P1-D1: refuses (55000) unless analysis_log_retention_enabled is JSON true; then deletes up to 10000 analysis_log rows older than analysis_log_retention_days, oldest first. Returns rows deleted.';
COMMENT ON FUNCTION public.preview_expired_analysis_log() IS
  'P1-D1 dry run: enabled flag, cutoff, eligible rows, rows the next purge call would delete, oldest/newest eligible created_at. Changes nothing.';
