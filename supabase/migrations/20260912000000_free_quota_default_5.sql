-- Change free user default monthly analytics limit from 10 to 5.
-- Applies to: app_settings, get_default_monthly_analytics_limit fallback.

UPDATE public.app_settings
SET value = '5'::jsonb,
    updated_at = now()
WHERE key = 'default_monthly_analytics_limit';

CREATE OR REPLACE FUNCTION public.get_default_monthly_analytics_limit()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT (s.value #>> '{}')::integer
      FROM public.app_settings AS s
      WHERE s.key = 'default_monthly_analytics_limit'
    ),
    5
  );
$$;

REVOKE ALL ON FUNCTION public.get_default_monthly_analytics_limit() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_default_monthly_analytics_limit() TO authenticated;

COMMENT ON FUNCTION public.get_default_monthly_analytics_limit() IS
  'Global default analyses per quota cycle; fallback 5 if app_settings row missing.';
