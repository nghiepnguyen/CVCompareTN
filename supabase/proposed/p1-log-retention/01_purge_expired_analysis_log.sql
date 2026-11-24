-- PROPOSED (P1, option B) — NOT A MIGRATION YET. Blocked on legal advice
-- (scope of Decree 333/2026 Art. 16.6 / 20.3 for cvfit.pro and analysis_log)
-- and separate owner approval. Lives outside supabase/migrations so
-- `supabase db push` and CI never apply it. To adopt: copy into
-- supabase/migrations with a fresh timestamp, then follow
-- docs/audits/2026-11-24-p1-option-b-retention.md.
--
-- Two-stage retention for analysis_log (one row per AI call; no CV/JD text):
--   1. scrub_expired_analysis_log_detail(): after analysis_log_detail_retention_days
--      (seed 90) clears error_message and guard_metrics. The row keeps id,
--      user_id, kind, status, created_at, tokens, model, latency_ms.
--   2. purge_expired_analysis_log(): deletes rows older than
--      analysis_log_retention_days (seed 400). Scheduled by a SEPARATE file
--      (04) so row deletion gets its own production approval.
-- Nothing else is touched: quota/billing live in analytics_quota_reservations /
-- payments / profiles, admin evidence in admin_audit_log, CV/JD in history.
--
-- Configurable, fail-closed (both settings are validated together, so one bad
-- value stops BOTH stages):
--   * periods come from app_settings, never from a caller argument;
--   * each must be a JSON integer of at most 4 digits (larger values would
--     otherwise overflow ::integer with 22003 instead of 22023); row retention in [366, 3650] (366 = 12
--     months across a leap day; going lower needs a migration), detail
--     retention in [90, row retention];
--   * missing / NULL / string / fraction / out of range => RAISE 22023, nothing
--     changed;
--   * admin_update_app_setting only accepts 'default_monthly_analytics_limit',
--     so the admin UI/API cannot change these keys.
-- SECURITY DEFINER owned by postgres (P0-H left service_role SELECT/INSERT
-- only on analysis_log); EXECUTE for postgres only (cron + owner). Idempotent.
-- shortcut: one unbatched UPDATE / DELETE; fine at current volume (≈3 rows/day).
-- Batch (LIMIT via ctid) if daily volume reaches tens of thousands.

INSERT INTO public.app_settings (key, value) VALUES
  ('analysis_log_detail_retention_days', '90'::jsonb),
  ('analysis_log_retention_days', '400'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Option A (90-day row delete) used a one-argument-free cutoff helper; drop it
-- if a local stack still has it so only the validated pair exists.
DROP FUNCTION IF EXISTS public.analysis_log_retention_cutoff();

CREATE OR REPLACE FUNCTION public.analysis_log_retention_cutoffs(
  OUT detail_cutoff timestamptz,
  OUT row_cutoff timestamptz
)
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE vd jsonb; vr jsonb; dd integer; dr integer;
BEGIN
  SELECT s.value INTO vd FROM public.app_settings AS s WHERE s.key = 'analysis_log_detail_retention_days';
  SELECT s.value INTO vr FROM public.app_settings AS s WHERE s.key = 'analysis_log_retention_days';
  IF vr IS NULL OR jsonb_typeof(vr) <> 'number' OR (vr #>> '{}') !~ '^[0-9]{1,4}$' THEN
    RAISE EXCEPTION 'analysis_log_retention_days missing or not an integer' USING ERRCODE = '22023';
  END IF;
  IF vd IS NULL OR jsonb_typeof(vd) <> 'number' OR (vd #>> '{}') !~ '^[0-9]{1,4}$' THEN
    RAISE EXCEPTION 'analysis_log_detail_retention_days missing or not an integer' USING ERRCODE = '22023';
  END IF;
  dr := (vr #>> '{}')::integer;
  dd := (vd #>> '{}')::integer;
  IF dr < 366 OR dr > 3650 THEN
    RAISE EXCEPTION 'analysis_log_retention_days % outside [366, 3650]', dr USING ERRCODE = '22023';
  END IF;
  IF dd < 90 OR dd > dr THEN
    RAISE EXCEPTION 'analysis_log_detail_retention_days % outside [90, %]', dd, dr USING ERRCODE = '22023';
  END IF;
  detail_cutoff := now() - make_interval(days => dd);
  row_cutoff := now() - make_interval(days => dr);
END;
$$;

REVOKE ALL ON FUNCTION public.analysis_log_retention_cutoffs() FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.scrub_expired_analysis_log_detail()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE n integer; c timestamptz;
BEGIN
  SELECT detail_cutoff INTO c FROM public.analysis_log_retention_cutoffs();
  UPDATE public.analysis_log
     SET error_message = NULL, guard_metrics = NULL
   WHERE created_at < c
     AND (error_message IS NOT NULL OR guard_metrics IS NOT NULL);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.purge_expired_analysis_log()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE n integer; c timestamptz;
BEGIN
  SELECT row_cutoff INTO c FROM public.analysis_log_retention_cutoffs();
  DELETE FROM public.analysis_log WHERE created_at < c;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- Only pg_cron (as postgres) and the owner's counted first run call these; no
-- API code does, so service_role (PostgREST /rpc) gets no EXECUTE either.
REVOKE ALL ON FUNCTION public.scrub_expired_analysis_log_detail() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.purge_expired_analysis_log() FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.analysis_log_retention_cutoffs() IS
  'P1-B: (detail_cutoff, row_cutoff) from app_settings; raises unless row days in [366, 3650] and detail days in [90, row days].';
COMMENT ON FUNCTION public.scrub_expired_analysis_log_detail() IS
  'P1-B: clears analysis_log.error_message and guard_metrics older than analysis_log_detail_retention_days (fail-closed). Returns rows changed.';
COMMENT ON FUNCTION public.purge_expired_analysis_log() IS
  'P1-B: deletes analysis_log rows older than analysis_log_retention_days (fail-closed). Returns rows deleted.';
