-- Re-apply EXECUTE grants after 20260601210000 recreated activate_pro_plan.
-- REVOKE FROM PUBLIC does not remove anon/authenticated on Supabase.

-- activate_pro_plan: service_role only (PayOS webhook)
-- Guarded: 20260601300000 (back-dated, written later) replaces this 4-arg signature with a
-- 5-arg one, so on a fresh replay the 4-arg function no longer exists here. Databases that
-- applied this file while the 4-arg function existed got exactly these two statements.
DO $$
BEGIN
  IF to_regprocedure('public.activate_pro_plan(uuid,bigint,integer,jsonb)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.activate_pro_plan(uuid, bigint, integer, jsonb)
      FROM anon, authenticated, PUBLIC;
    GRANT EXECUTE ON FUNCTION public.activate_pro_plan(uuid, bigint, integer, jsonb)
      TO service_role;
  END IF;
END
$$;

-- admin_set_user_plan: authenticated only (is_admin() guard inside function)
REVOKE EXECUTE ON FUNCTION public.admin_set_user_plan(uuid, text, integer)
  FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_user_plan(uuid, text, integer)
  TO authenticated;

-- Config helper: not callable by anon
REVOKE EXECUTE ON FUNCTION public.get_default_monthly_analytics_limit()
  FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_default_monthly_analytics_limit()
  TO authenticated;

-- Idempotent re-sync of prior anon revokes
REVOKE EXECUTE ON FUNCTION public.check_analytics_quota(uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_plan(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.effective_monthly_analytics_limit(boolean, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.resolve_monthly_analytics_limit(text, boolean, integer)
  FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_monthly_analytics_limit(text, boolean, integer)
  TO authenticated;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_usage_count(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_profile_usage_month(uuid) FROM anon;
