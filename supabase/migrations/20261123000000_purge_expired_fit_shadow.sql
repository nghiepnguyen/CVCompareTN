-- M3-B OD-M2: 30-day retention for analysis_log.guard_metrics.fitShadow
-- (fit-score-v1 shadow telemetry, written only while FIT_SCORE_SHADOW is on;
-- docs/11_guard_metrics.md). Strips ONLY that key from rows older than 30
-- days. Never deletes a row: tokens, cost, status, kind, user_id and created_at
-- (admin reports, the hourly AI cap in _server-lib/accountLock.ts) and every
-- other guard_metrics key stay as they are. Quota and billing live in their own
-- ledger tables and are not touched.
--
-- Idempotent: CREATE OR REPLACE, and re-running the purge strips nothing new.
-- Scheduled daily by 20261123000001_purge_expired_fit_shadow_pg_cron.sql.
--
-- shortcut: one unbatched UPDATE; fine at current volume (~2 analyze rows/day,
-- 2026-11-23). Batch it if shadow rows ever reach tens of thousands per day.

CREATE OR REPLACE FUNCTION public.purge_expired_fit_shadow()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE n integer;
BEGIN
  -- Any kind: fitShadow is only written on analyze rows, but if it ever lands
  -- elsewhere it is still shadow telemetry and expires the same way.
  UPDATE public.analysis_log
     SET guard_metrics = guard_metrics - 'fitShadow'
   WHERE guard_metrics ? 'fitShadow'
     AND created_at < now() - interval '30 days';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_fit_shadow() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_fit_shadow() TO service_role;

COMMENT ON FUNCTION public.purge_expired_fit_shadow() IS
  'M3-B OD-M2: removes guard_metrics.fitShadow from analysis_log rows older than 30 days; never deletes rows. Returns rows changed.';

COMMENT ON COLUMN public.analysis_log.guard_metrics IS
  'Guard telemetry v1. Aggregate operational metrics only; no CV, JD, rewrite content or PII. '
  'kind=analyze: {v:1, suggestionGuard, requirementVerification?, fitShadow?}; '
  'kind=rewrite: {v:1, fullCv | coverLetter | applicationReview | followUp}. '
  'fitShadow (fit-score-v1 shadow: numbers/enums only) is removed after 30 days by purge_expired_fit_shadow(). '
  'NULL means telemetry unavailable or not applicable. See docs/11_guard_metrics.md.';
