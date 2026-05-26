-- resolve_monthly_analytics_limit: revoke PUBLIC execute (anon inherits via =X/postgres).

REVOKE EXECUTE ON FUNCTION public.resolve_monthly_analytics_limit(text, boolean, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_monthly_analytics_limit(text, boolean, integer)
  TO authenticated;
