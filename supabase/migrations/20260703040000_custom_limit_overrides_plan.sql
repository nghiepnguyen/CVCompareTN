-- Fix: resolve_monthly_analytics_limit checked plan tier (pro=100, recruiter=500)
-- BEFORE the admin-granted custom limit, so an admin-set custom limit on a
-- pro/recruiter user was silently ignored by enforcement (check_analytics_quota)
-- while the Admin UI's own resolveEffectiveMonthlyAnalyticsLimit() (userService.ts)
-- checks custom first and displayed the (unenforced) custom value — a real
-- display-vs-enforcement mismatch. Restores "custom always overrides plan",
-- matching the client-side precedence.

CREATE OR REPLACE FUNCTION public.resolve_monthly_analytics_limit(
  p_effective_plan text,
  p_custom boolean,
  p_stored_limit integer
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_custom THEN p_stored_limit
    WHEN p_effective_plan = 'recruiter' THEN 500
    WHEN p_effective_plan = 'pro' THEN 100
    ELSE public.get_default_monthly_analytics_limit()
  END;
$$;

COMMENT ON FUNCTION public.resolve_monthly_analytics_limit(text, boolean, integer) IS
  'Resolves effective monthly analytics limit: admin-granted custom limit always wins over plan tier; NULL custom limit means unlimited.';
