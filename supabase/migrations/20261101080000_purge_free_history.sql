-- Free plan history is promised to be deleted after 7 days
-- (historyFreeRetentionNotice, HISTORY_DAYS_BY_PLAN.free); the client only
-- hid older rows. This hard-deletes them. Plan rule matches
-- effective_plan_from_row; admins keep everything. Scheduled daily by
-- 20261101080001_purge_free_history_pg_cron.sql.
CREATE OR REPLACE FUNCTION public.purge_expired_free_history()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE n integer;
BEGIN
  DELETE FROM public.history AS h
  USING public.profiles AS p
  WHERE p.id = h.user_id
    AND p.role IS DISTINCT FROM 'admin'
    AND public.effective_plan_from_row(p.plan, p.plan_expires_at) = 'free'
    AND h.timestamp < now() - interval '7 days';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_free_history() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_free_history() TO service_role;
