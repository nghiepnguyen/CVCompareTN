-- Fix: perpetual plan (plan_expires_at IS NULL) was converted to finite when
-- user paid for the same plan. COALESCE(NULL, now()) + 30 days = now() + 30 days,
-- losing the admin-granted perpetual access.
--
-- Fix: NULL expiry is now treated as a separate branch — perpetual stays NULL.
-- Stacking only applies when the existing expiry is a future timestamp.
-- Applies to both activate_pro_plan (payment path) and admin_set_user_plan (admin path).

-- =============================================================================
-- 1. Fix activate_pro_plan
-- =============================================================================
CREATE OR REPLACE FUNCTION public.activate_pro_plan(
  p_user_id uuid,
  p_order_code bigint,
  p_duration_days integer DEFAULT 30,
  p_payos_data jsonb DEFAULT NULL,
  p_plan text DEFAULT 'pro'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claimed_user_id uuid;
  v_duration integer;
  v_reset_day smallint;
BEGIN
  IF p_plan NOT IN ('pro', 'recruiter') THEN
    RAISE EXCEPTION 'invalid_plan_type' USING ERRCODE = '22023';
  END IF;

  UPDATE public.payments AS pay
  SET
    status = 'paid',
    paid_at = now(),
    payos_data = COALESCE(p_payos_data, pay.payos_data)
  WHERE pay.order_code = p_order_code
    AND pay.user_id = p_user_id
    AND pay.status = 'pending'
  RETURNING pay.user_id, pay.duration_days
  INTO v_claimed_user_id, v_duration;

  IF v_claimed_user_id IS NULL THEN
    RETURN false;
  END IF;

  v_duration := COALESCE(NULLIF(v_duration, 0), NULLIF(p_duration_days, 0), 30);

  -- Preserve existing quota_reset_day; if NULL, default to today's day
  SELECT p.quota_reset_day INTO v_reset_day
  FROM public.profiles AS p
  WHERE p.id = v_claimed_user_id;

  IF v_reset_day IS NULL THEN
    v_reset_day := LEAST(EXTRACT(DAY FROM now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::int, 28)::smallint;
  END IF;

  UPDATE public.profiles AS p SET
    plan = p_plan,
    plan_expires_at = CASE
      WHEN p.plan = p_plan AND p.plan_expires_at IS NULL
        THEN NULL                                                            -- perpetual stays perpetual
      WHEN p.plan = p_plan AND p.plan_expires_at > now()
        THEN p.plan_expires_at + (v_duration || ' days')::interval          -- stack on active plan
      ELSE now() + (v_duration || ' days')::interval                        -- fresh start
    END,
    plan_updated_at = now(),
    usage_count = 0,
    usage_month = public.current_quota_cycle(v_reset_day),
    quota_reset_day = v_reset_day
  WHERE p.id = v_claimed_user_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.activate_pro_plan(uuid, bigint, integer, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_pro_plan(uuid, bigint, integer, jsonb, text) TO service_role;

COMMENT ON FUNCTION public.activate_pro_plan(uuid, bigint, integer, jsonb, text) IS
  'Claims pending payment then extends pro/recruiter. Returns true if activated, false if order already paid or not pending. Perpetual plans (NULL expiry) are preserved.';

-- =============================================================================
-- 2. Fix admin_set_user_plan
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
DECLARE
  v_reset_day smallint;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
  END IF;

  IF p_plan NOT IN ('free', 'pro', 'recruiter') THEN
    RAISE EXCEPTION 'invalid_plan' USING ERRCODE = '22023';
  END IF;

  -- Preserve existing quota_reset_day; if NULL, default to 1
  SELECT p.quota_reset_day INTO v_reset_day
  FROM public.profiles AS p
  WHERE p.id = p_user_id;

  IF v_reset_day IS NULL THEN
    v_reset_day := 1::smallint;
  END IF;

  IF p_plan = 'free' THEN
    -- Downgrade to free: clear plan, reset usage_count so free limits apply
    UPDATE public.profiles SET
      plan = 'free',
      plan_expires_at = NULL,
      plan_updated_at = now(),
      usage_count = 0,
      usage_month = public.current_quota_cycle(v_reset_day)
    WHERE id = p_user_id;
    RETURN;
  END IF;

  IF p_duration_days IS NULL OR p_duration_days < 1 THEN
    RAISE EXCEPTION 'invalid_duration' USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles SET
    plan = p_plan,
    plan_expires_at = CASE
      WHEN plan = p_plan AND plan_expires_at IS NULL
        THEN NULL                                                               -- perpetual stays perpetual
      WHEN plan = p_plan AND plan_expires_at > now()
        THEN plan_expires_at + (p_duration_days || ' days')::interval          -- stack on active plan
      ELSE now() + (p_duration_days || ' days')::interval                      -- fresh start
    END,
    plan_updated_at = now(),
    usage_count = 0,
    usage_month = public.current_quota_cycle(v_reset_day),
    quota_reset_day = v_reset_day
  WHERE id = p_user_id;
END;
$$;

COMMENT ON FUNCTION public.admin_set_user_plan(uuid, text, integer) IS
  'Admin-only: set user plan to free/pro/recruiter for p_duration_days. Free downgrade resets usage_count. Perpetual plans (NULL expiry) are preserved when stacking.';
