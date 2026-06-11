-- Security: revoke anon/authenticated from recruiter SECURITY DEFINER functions
-- Fixes Supabase Security Linter warnings (June 2026 scan)
--
-- P0: save_candidate_analysis — should be service_role ONLY (backend API)
-- P1: sync_campaign_counters, update_candidate_hr_status — should be authenticated only (not anon)
--
-- Background: On Supabase, REVOKE FROM PUBLIC does NOT remove permissions from
-- anon/authenticated. They inherit from PUBLIC by default but retain their own
-- grants. This migration explicitly revokes from those roles.

-- save_candidate_analysis: service_role only (never called directly from client)
REVOKE EXECUTE ON FUNCTION public.save_candidate_analysis(uuid, jsonb, integer, text)
  FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_candidate_analysis(uuid, jsonb, integer, text)
  TO service_role;

-- sync_campaign_counters: authenticated only (internal trigger, not anonymous)
REVOKE EXECUTE ON FUNCTION public.sync_campaign_counters(uuid)
  FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_campaign_counters(uuid)
  TO authenticated;

-- update_candidate_hr_status: authenticated only (recruiter action, not anonymous)
REVOKE EXECUTE ON FUNCTION public.update_candidate_hr_status(uuid, text, text)
  FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_candidate_hr_status(uuid, text, text)
  TO authenticated;