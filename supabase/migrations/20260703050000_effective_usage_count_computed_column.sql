-- Admin > Users table read raw profiles.usage_count directly (plain select('*')),
-- but the monthly reset is entirely lazy: usage_count/usage_month are only
-- rolled over inside sync_profile_usage_month(), which runs solely as a side
-- effect of check_analytics_quota()/increment_usage_count() (i.e. when the
-- user themselves analyzes or opens their Profile page). A user who hasn't
-- triggered either since their cycle rolled over still shows last cycle's
-- stale usage_count in Admin, while their own Profile page (which calls the
-- RPC) already shows 0. This computed column projects what usage_count WOULD
-- be after a lazy sync, without mutating the row, so Admin can display the
-- live-correct number from a single select('*, effective_usage_count') query.

CREATE OR REPLACE FUNCTION public.effective_usage_count(p public.profiles)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    -- Mirrors sync_profile_usage_month's expiry-demotion branch: an expired
    -- paid plan resets usage_count to 0 on its next lazy sync.
    WHEN p.plan IN ('pro', 'recruiter')
         AND p.plan_expires_at IS NOT NULL
         AND p.plan_expires_at <= now()
      THEN 0
    -- Mirrors sync_profile_usage_month's cycle-rollover branch.
    WHEN p.usage_month IS DISTINCT FROM public.current_quota_cycle(COALESCE(p.quota_reset_day, 1)::smallint)
      THEN 0
    ELSE COALESCE(p.usage_count, 0)
  END;
$$;

REVOKE ALL ON FUNCTION public.effective_usage_count(public.profiles) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.effective_usage_count(public.profiles) TO authenticated;

COMMENT ON FUNCTION public.effective_usage_count(public.profiles) IS
  'Read-only projection of usage_count after a pending lazy rollover (cycle change or plan expiry), without mutating the row. PostgREST computed column: select(''*, effective_usage_count'') on profiles.';
