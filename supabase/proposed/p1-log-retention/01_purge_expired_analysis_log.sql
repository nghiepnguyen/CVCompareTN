-- PROPOSED (P1, option B) — NOT A MIGRATION YET. Blocked on legal
-- confirmation (no 12-month log-retention duty) and separate owner approval.
-- Lives outside supabase/migrations so `supabase db push` and CI never apply it.
-- To adopt: copy into supabase/migrations with a fresh timestamp, then follow
-- docs/audits/2026-11-23-p1-retention-design.md.
--
-- Deletes analysis_log rows strictly older than 90 days (the privacy policy's
-- "at most 90 days" for technical logs). Nothing else is touched: quota and
-- billing live in analytics_quota_reservations / payments / profiles, admin
-- security evidence in admin_audit_log, CV/JD in history/saved_* (user-managed).
-- The 1-hour AI caps and the 30-day fitShadow purge are unaffected.
-- SECURITY DEFINER owned by postgres (the table owner; P0-H left service_role
-- with SELECT/INSERT only, so the purge must run as owner). Idempotent.
-- shortcut: one unbatched DELETE; fine at current volume (≈10 rows/day). Batch
-- (LIMIT via ctid) if daily volume reaches tens of thousands.
CREATE OR REPLACE FUNCTION public.purge_expired_analysis_log()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE n integer;
BEGIN
  DELETE FROM public.analysis_log
   WHERE created_at < now() - interval '90 days';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_analysis_log() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_analysis_log() TO service_role;

COMMENT ON FUNCTION public.purge_expired_analysis_log() IS
  'P1: deletes analysis_log rows older than 90 days (technical-log retention). Returns rows deleted.';
