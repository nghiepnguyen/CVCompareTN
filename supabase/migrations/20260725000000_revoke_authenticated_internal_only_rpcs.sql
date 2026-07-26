-- Security: revoke `authenticated` EXECUTE from internal-only RPCs
-- Fixes Supabase Security Advisor WARN (authenticated_security_definer_function_executable)
--
-- sync_campaign_counters(p_campaign_id) and sync_profile_usage_month(p_user_id) have
-- NO ownership/auth check inside the function body — they trust the caller's argument
-- as-is. They were granted to `authenticated` so any signed-in user could call
-- rpc/sync_campaign_counters or rpc/sync_profile_usage_month with an arbitrary
-- campaign_id / user_id belonging to someone else, forcing an unauthorized write
-- (recomputed counters + updated_at on someone else's campaign; early usage_count
-- reset / plan demotion on someone else's profile). The recomputed values are
-- deterministic from real state (no data leak/corruption), but the write itself
-- is unauthorized and the calling role has no business invoking these directly.
--
-- Both are only ever called internally via PERFORM from other SECURITY DEFINER
-- functions that already validate ownership (update_candidate_hr_status,
-- save_candidate_analysis, check_analytics_quota, increment_usage_count). Those
-- internal calls keep working after this revoke: a SECURITY DEFINER function runs
-- as its owner, and the owner always has implicit EXECUTE on its own functions —
-- no grant to `authenticated` is needed for the internal call chain.

REVOKE EXECUTE ON FUNCTION public.sync_campaign_counters(uuid)
  FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.sync_profile_usage_month(uuid)
  FROM authenticated;

COMMENT ON FUNCTION public.sync_campaign_counters(uuid) IS
  'Sync candidate_count, analyzed_count, shortlisted_count from candidate_cvs to recruitment_campaigns. Internal-only — no ownership check, must not be granted to authenticated/anon; called via PERFORM from update_candidate_hr_status / save_candidate_analysis after they validate ownership.';

COMMENT ON FUNCTION public.sync_profile_usage_month(uuid) IS
  'Reset usage_count when the per-user quota cycle changes (based on quota_reset_day) OR when pro/recruiter plan expires (demote to free). Internal-only — no ownership check, must not be granted to authenticated/anon; called via PERFORM from check_analytics_quota / increment_usage_count after they validate the caller.';
