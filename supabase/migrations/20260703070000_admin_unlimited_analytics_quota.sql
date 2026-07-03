-- Admins have unlimited analytics quota at the DB level.
--
-- Previously, is_admin() was only used to let an admin query/increment *another*
-- user's quota row — it never exempted the admin's own row from the limit
-- itself. The frontend's client-side pre-check (checkAnalyticsQuota) was
-- skipped for role='admin' users (see AnalysisRunContext.tsx), giving the
-- impression admins never run out of quota. But the backend
-- (_server-lib/analyze/handler.ts) calls check_analytics_quota /
-- increment_usage_count for every userId regardless of role, and those
-- functions resolved the limit purely from profiles.plan (which stays 'free'
-- by default for admin accounts). So an admin who ran more than the free-tier
-- limit worth of analyses would get a raw HTTP 429 ("Monthly analysis limit
-- exceeded") mid-request — a real client/server enforcement mismatch.
--
-- Fix: both RPCs now treat profiles.role = 'admin' as an unlimited quota
-- (limit = NULL), matching the frontend's assumption. usage_count is still
-- tracked/incremented for admins (for the Admin > Users "Analyses" column),
-- it just never blocks them.

CREATE OR REPLACE FUNCTION public.check_analytics_quota(
  p_user_id uuid,
  p_additional integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cycle text;
  v_used integer;
  v_custom boolean;
  v_stored_limit integer;
  v_limit integer;
  v_effective_plan text;
  v_row_plan text;
  v_row_role text;
  v_expires_at timestamptz;
  v_reset_day smallint;
BEGIN
  IF auth.role() <> 'service_role'
     AND p_user_id IS DISTINCT FROM auth.uid()
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;

  PERFORM public.sync_profile_usage_month(p_user_id);

  SELECT p.usage_count,
         p.monthly_analytics_limit_custom,
         p.monthly_analytics_limit,
         p.plan,
         p.role,
         p.plan_expires_at,
         p.quota_reset_day
  INTO v_used, v_custom, v_stored_limit, v_row_plan, v_row_role, v_expires_at, v_reset_day
  FROM public.profiles AS p
  WHERE p.id = p_user_id;

  IF NOT FOUND THEN
    v_cycle := public.current_quota_cycle(1::smallint);
    RETURN jsonb_build_object(
      'allowed', false,
      'used', 0,
      'limit', null,
      'month', v_cycle,
      'plan', 'free',
      'resetDay', 1,
      'reason', 'profile_not_found'
    );
  END IF;

  v_cycle := public.current_quota_cycle((COALESCE(v_reset_day, 1))::smallint);
  v_effective_plan := public.effective_plan_from_row(v_row_plan, v_expires_at);
  v_limit := CASE
    WHEN v_row_role = 'admin' THEN NULL
    ELSE public.resolve_monthly_analytics_limit(v_effective_plan, v_custom, v_stored_limit)
  END;

  IF v_limit IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'used', v_used,
      'limit', null,
      'month', v_cycle,
      'plan', v_effective_plan,
      'resetDay', COALESCE(v_reset_day, 1)
    );
  END IF;

  IF v_used + GREATEST(p_additional, 0) > v_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'used', v_used,
      'limit', v_limit,
      'month', v_cycle,
      'plan', v_effective_plan,
      'resetDay', COALESCE(v_reset_day, 1),
      'reason', 'monthly_limit_exceeded'
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'used', v_used,
    'limit', v_limit,
    'month', v_cycle,
    'plan', v_effective_plan,
    'resetDay', COALESCE(v_reset_day, 1)
  );
END;
$$;

COMMENT ON FUNCTION public.check_analytics_quota(uuid, integer) IS
  'Returns allowed/used/limit for the current per-user quota cycle. Resets usage_count when the cycle changes (based on quota_reset_day) or when pro/recruiter expires. Admins (profiles.role = ''admin'') always get limit = null (unlimited). Callable by the owning user, an admin, or the backend service_role client.';

CREATE OR REPLACE FUNCTION public.increment_usage_count(user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cycle text;
  v_custom boolean;
  v_stored_limit integer;
  v_limit integer;
  v_used integer;
  v_effective_plan text;
  v_row_plan text;
  v_row_role text;
  v_expires_at timestamptz;
  v_reset_day smallint;
BEGIN
  IF auth.role() <> 'service_role'
     AND user_id IS DISTINCT FROM auth.uid()
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;

  PERFORM public.sync_profile_usage_month(user_id);

  SELECT p.usage_count,
         p.monthly_analytics_limit_custom,
         p.monthly_analytics_limit,
         p.plan,
         p.role,
         p.plan_expires_at,
         p.quota_reset_day
  INTO v_used, v_custom, v_stored_limit, v_row_plan, v_row_role, v_expires_at, v_reset_day
  FROM public.profiles AS p
  WHERE p.id = user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_cycle := public.current_quota_cycle((COALESCE(v_reset_day, 1))::smallint);
  v_effective_plan := public.effective_plan_from_row(v_row_plan, v_expires_at);
  v_limit := CASE
    WHEN v_row_role = 'admin' THEN NULL
    ELSE public.resolve_monthly_analytics_limit(v_effective_plan, v_custom, v_stored_limit)
  END;

  IF v_limit IS NOT NULL AND v_used >= v_limit THEN
    RAISE EXCEPTION 'monthly_limit_exceeded'
      USING ERRCODE = 'P0001',
            MESSAGE = 'Monthly analytics limit reached';
  END IF;

  UPDATE public.profiles AS p
  SET usage_count = COALESCE(p.usage_count, 0) + 1,
      usage_month = v_cycle
  WHERE p.id = user_id;
END;
$$;

COMMENT ON FUNCTION public.increment_usage_count(uuid) IS
  'Increments usage_count after successful analysis; enforces limit per quota cycle (based on quota_reset_day). Admins (profiles.role = ''admin'') are never blocked by the limit. Callable by the owning user, an admin, or the backend service_role client.';
