-- Fix: check_analytics_quota and increment_usage_count reject calls made by the
-- backend's service-role client (_server-lib/payment/supabaseAdmin.ts getSupabaseAdmin()).
--
-- Their internal guard `p_user_id IS DISTINCT FROM auth.uid() AND NOT is_admin()`
-- assumes a logged-in user's JWT, but a service_role JWT carries no `sub` claim,
-- so auth.uid() is NULL (and is_admin() also resolves false for the same reason).
-- The guard therefore always raised 'not_allowed' (42501) for backend-originated
-- calls:
--   - increment_usage_count: was not even granted to service_role, so it failed
--     at the GRANT level. The failure is swallowed by a fire-and-forget try/catch
--     in _server-lib/analyze/handler.ts, so profiles.usage_count never
--     incremented — the Admin > User directory "Analyses / month" column always
--     showed 0.
--   - check_analytics_quota: migration 20260703010000 granted EXECUTE to
--     service_role, but the internal guard still raised, so every quota check
--     from the backend errored and handler.ts fails open (treats it as allowed),
--     silently disabling server-side quota enforcement.
--
-- Fix: let calls made with the service_role JWT bypass the per-user ownership
-- check (the backend is trusted; it already validates the caller's identity via
-- their own bearer token before ever invoking these RPCs).

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
         p.plan_expires_at,
         p.quota_reset_day
  INTO v_used, v_custom, v_stored_limit, v_row_plan, v_expires_at, v_reset_day
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
  v_limit := public.resolve_monthly_analytics_limit(v_effective_plan, v_custom, v_stored_limit);

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
  'Returns allowed/used/limit for the current per-user quota cycle. Resets usage_count when the cycle changes (based on quota_reset_day) or when pro/recruiter expires. Callable by the owning user, an admin, or the backend service_role client.';

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
         p.plan_expires_at,
         p.quota_reset_day
  INTO v_used, v_custom, v_stored_limit, v_row_plan, v_expires_at, v_reset_day
  FROM public.profiles AS p
  WHERE p.id = user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_cycle := public.current_quota_cycle((COALESCE(v_reset_day, 1))::smallint);
  v_effective_plan := public.effective_plan_from_row(v_row_plan, v_expires_at);
  v_limit := public.resolve_monthly_analytics_limit(v_effective_plan, v_custom, v_stored_limit);

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
  'Increments usage_count after successful analysis; enforces limit per quota cycle (based on quota_reset_day). Callable by the owning user, an admin, or the backend service_role client.';

GRANT EXECUTE ON FUNCTION public.increment_usage_count(uuid) TO service_role;
