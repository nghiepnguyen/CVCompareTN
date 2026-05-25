-- Security: prevent anon from reading quota/plan/admin helpers for arbitrary user IDs.

REVOKE EXECUTE ON FUNCTION public.check_analytics_quota(uuid, integer) FROM anon;

REVOKE EXECUTE ON FUNCTION public.get_user_plan(uuid) FROM anon;

REVOKE EXECUTE ON FUNCTION public.effective_monthly_analytics_limit(boolean, integer) FROM anon;

REVOKE EXECUTE ON FUNCTION public.resolve_monthly_analytics_limit(text, boolean, integer) FROM anon;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;
