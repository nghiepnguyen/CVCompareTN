-- PROPOSED (P1, option B) — NOT A MIGRATION YET. Blocked on legal
-- confirmation (log-retention duty under Law 116/2025/QH15 + its decree) and
-- separate owner approval. Lives outside supabase/migrations so
-- `supabase db push` and CI never apply it. To adopt: copy into
-- supabase/migrations with a fresh timestamp, then follow
-- docs/audits/2026-11-23-p1-retention-design.md.
--
-- Deletes analysis_log rows strictly older than the configured retention
-- (app_settings.analysis_log_retention_days, seeded 90). Nothing else is
-- touched: quota and billing live in analytics_quota_reservations / payments /
-- profiles, admin evidence in admin_audit_log, CV/JD in history/saved_*.
--
-- Configurable, fail-closed:
--   * the period is read from app_settings, never from a caller argument
--     (an argument would let any service_role caller pick a short window);
--   * missing / NULL / non-integer / < 90 / > 3650 => RAISE, nothing deleted;
--   * raising the period (e.g. 365 for option C) is a one-row service_role/SQL
--     update; going BELOW 90 needs a migration that changes the floor here.
--   * admin_update_app_setting only accepts 'default_monthly_analytics_limit',
--     so the admin UI/API cannot change this key.
-- SECURITY DEFINER owned by postgres (P0-H left service_role SELECT/INSERT
-- only on analysis_log). Idempotent.
-- shortcut: one unbatched DELETE; fine at current volume (≈10 rows/day). Batch
-- (LIMIT via ctid) if daily volume reaches tens of thousands.

INSERT INTO public.app_settings (key, value)
VALUES ('analysis_log_retention_days', '90'::jsonb)
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
  IF v IS NULL OR jsonb_typeof(v) <> 'number' OR (v #>> '{}') !~ '^[0-9]+$' THEN
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
DECLARE n integer;
BEGIN
  DELETE FROM public.analysis_log
   WHERE created_at < public.analysis_log_retention_cutoff();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_analysis_log() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_analysis_log() TO service_role;

COMMENT ON FUNCTION public.analysis_log_retention_cutoff() IS
  'P1: now() - app_settings.analysis_log_retention_days; raises unless an integer in [90, 3650].';
COMMENT ON FUNCTION public.purge_expired_analysis_log() IS
  'P1: deletes analysis_log rows older than analysis_log_retention_days (fail-closed). Returns rows deleted.';
