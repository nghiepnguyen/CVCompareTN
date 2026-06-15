-- Security: revoke anon from sensitive SECURITY DEFINER functions.
-- Fixes residual findings from June 2026 Supabase Security Linter scan.
--
-- Root cause: an older 5-param overload of activate_pro_plan(..., p_plan text)
-- was never explicitly dropped; it remained in the DB alongside the idempotent
-- 4-param version and was still callable by anon.
--
-- All REVOKE statements are idempotent — safe to re-run.

-- Drop stale 5-param overload that was replaced by the 4-param idempotent version.
-- The 4-param version is already locked to service_role via migration 20260601210000.
DROP FUNCTION IF EXISTS public.activate_pro_plan(uuid, bigint, integer, jsonb, text);

-- Re-apply revokes for recruiter functions in case migration 20260610000000
-- was not yet applied to production at time of lint scan.

-- save_candidate_analysis: service_role only (called exclusively by backend API)
REVOKE EXECUTE ON FUNCTION public.save_candidate_analysis(uuid, jsonb, integer, text)
  FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_candidate_analysis(uuid, jsonb, integer, text)
  TO service_role;

-- sync_campaign_counters: authenticated only (internal counter sync, not anonymous)
REVOKE EXECUTE ON FUNCTION public.sync_campaign_counters(uuid)
  FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_campaign_counters(uuid)
  TO authenticated;

-- update_candidate_hr_status: authenticated only (recruiter HR action)
REVOKE EXECUTE ON FUNCTION public.update_candidate_hr_status(uuid, text, text)
  FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_candidate_hr_status(uuid, text, text)
  TO authenticated;
