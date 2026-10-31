-- Public pricing surface (landing + upgrade) needs the current free quota.
-- app_settings is not readable by anon, so expose only the three plan limits
-- through a SECURITY DEFINER RPC. Values are already public marketing copy.
CREATE OR REPLACE FUNCTION public.get_public_plan_limits()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'free', public.get_default_monthly_analytics_limit(),
    'pro', public.resolve_monthly_analytics_limit('pro', false, NULL::integer),
    'recruiter', public.resolve_monthly_analytics_limit('recruiter', false, NULL::integer)
  );
$$;

REVOKE ALL ON FUNCTION public.get_public_plan_limits()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_plan_limits()
  TO anon, authenticated;

COMMENT ON FUNCTION public.get_public_plan_limits() IS
  'Public read-only plan limits for landing/upgrade pricing: app_settings free default + pro/recruiter caps.';
