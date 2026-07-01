-- Fix: check_analytics_quota was granted only to `authenticated`, not `service_role`.
-- The backend admin client (service_role) calls this RPC, causing 42501 not_allowed.
GRANT EXECUTE ON FUNCTION public.check_analytics_quota(uuid, integer) TO service_role;
