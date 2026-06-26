-- Fix: Reset usage_count when pro/recruiter plan expires.
-- Previously, usage_count was only reset on month rollover or plan activation.
-- A user with 90/100 usage on Pro would be stuck at 90/20 on Free after expiry.

-- =============================================================================
-- 1. Fix sync_profile_usage_month: detect expired plans and reset them
-- =============================================================================
CREATE OR REPLACE FUNCTION public.sync_profile_usage_month(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month text := public.current_usage_month();
  v_row record;
BEGIN
  SELECT p.plan, p.plan_expires_at
  INTO v_row
  FROM public.profiles AS p
  WHERE p.id = p_user_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Plan expiry: if pro/recruiter with a past expiry date, demote to free
  -- and reset usage_count so the free tier limit applies from 0.
  IF v_row.plan IN ('pro', 'recruiter')
     AND v_row.plan_expires_at IS NOT NULL
     AND v_row.plan_expires_at <= now() THEN
    UPDATE public.profiles AS p SET
      plan = 'free',
      plan_expires_at = NULL,
      plan_updated_at = now(),
      usage_count = 0,
      usage_month = v_month
    WHERE p.id = p_user_id
      AND p.plan = v_row.plan           -- guard: only if still the same plan
      AND p.plan_expires_at IS NOT NULL
      AND p.plan_expires_at <= now();
    RETURN;
  END IF;

  -- Month rollover: reset usage_count when the month changes
  UPDATE public.profiles AS p
  SET usage_month = v_month,
      usage_count = 0
  WHERE p.id = p_user_id
    AND p.usage_month IS DISTINCT FROM v_month;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_profile_usage_month(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_profile_usage_month(uuid) TO authenticated;

COMMENT ON FUNCTION public.sync_profile_usage_month(uuid) IS
  'Reset usage_count on month rollover OR when pro/recruiter plan expires (demote to free). Called by check_analytics_quota and increment_usage_count.';

-- =============================================================================
-- 2. Fix admin_set_user_plan: reset usage_count when admin downgrades to free
-- =============================================================================
CREATE OR REPLACE FUNCTION public.admin_set_user_plan(
  p_user_id uuid,
  p_plan text,
  p_duration_days integer DEFAULT 30
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
  END IF;

  IF p_plan NOT IN ('free', 'pro', 'recruiter') THEN
    RAISE EXCEPTION 'invalid_plan' USING ERRCODE = '22023';
  END IF;

  IF p_plan = 'free' THEN
    -- Downgrade to free: clear plan, reset usage_count so free limits apply
    UPDATE public.profiles SET
      plan = 'free',
      plan_expires_at = NULL,
      plan_updated_at = now(),
      usage_count = 0,
      usage_month = public.current_usage_month()
    WHERE id = p_user_id;
    RETURN;
  END IF;

  IF p_duration_days IS NULL OR p_duration_days < 1 THEN
    RAISE EXCEPTION 'invalid_duration' USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles SET
    plan = p_plan,
    plan_expires_at = CASE
      WHEN plan = p_plan AND (plan_expires_at IS NULL OR plan_expires_at > now())
        THEN COALESCE(plan_expires_at, now()) + (p_duration_days || ' days')::interval
      ELSE now() + (p_duration_days || ' days')::interval
    END,
    plan_updated_at = now(),
    usage_count = 0,
    usage_month = public.current_usage_month()
  WHERE id = p_user_id;
END;
$$;

COMMENT ON FUNCTION public.admin_set_user_plan(uuid, text, integer) IS
  'Admin-only: set user plan to free/pro/recruiter for p_duration_days. Free downgrade resets usage_count.';