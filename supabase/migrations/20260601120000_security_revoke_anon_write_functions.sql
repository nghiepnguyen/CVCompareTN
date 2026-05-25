-- Security: prevent anon from incrementing usage or syncing usage month for arbitrary user IDs.

REVOKE EXECUTE ON FUNCTION public.increment_usage_count(uuid) FROM anon;

REVOKE EXECUTE ON FUNCTION public.sync_profile_usage_month(uuid) FROM anon;
