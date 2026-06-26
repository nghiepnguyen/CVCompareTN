-- Change free user default monthly analytics limit from 20 to 10.
-- Applies to: app_settings, get_default_monthly_analytics_limit fallback.

-- Update the runtime default in app_settings
UPDATE public.app_settings
SET value = '10'::jsonb,
    updated_at = now()
WHERE key = 'default_monthly_analytics_limit';

-- Update the function fallback (used when app_settings row is missing)
CREATE OR REPLACE FUNCTION public.get_default_monthly_analytics_limit()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT (s.value #>> '{}')::integer
      FROM public.app_settings AS s
      WHERE s.key = 'default_monthly_analytics_limit'
    ),
    10
  );
$$;

REVOKE ALL ON FUNCTION public.get_default_monthly_analytics_limit() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_default_monthly_analytics_limit() TO authenticated;

COMMENT ON FUNCTION public.get_default_monthly_analytics_limit() IS
  'Global default analyses per quota cycle; fallback 10 if app_settings row missing.';