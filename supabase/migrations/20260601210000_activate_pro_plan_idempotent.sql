-- Idempotent activate_pro_plan: claim payment row first, use payments.duration_days, return boolean.

DROP FUNCTION IF EXISTS public.activate_pro_plan(uuid, bigint, integer, jsonb);

CREATE OR REPLACE FUNCTION public.activate_pro_plan(
  p_user_id uuid,
  p_order_code bigint,
  p_duration_days integer DEFAULT 30,
  p_payos_data jsonb DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claimed_user_id uuid;
  v_duration integer;
BEGIN
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

  UPDATE public.profiles AS p SET
    plan = 'pro',
    plan_expires_at = CASE
      WHEN p.plan = 'pro' AND (p.plan_expires_at IS NULL OR p.plan_expires_at > now())
        THEN COALESCE(p.plan_expires_at, now()) + (v_duration || ' days')::interval
      ELSE now() + (v_duration || ' days')::interval
    END,
    plan_updated_at = now(),
    usage_count = 0,
    usage_month = public.current_usage_month()
  WHERE p.id = v_claimed_user_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.activate_pro_plan(uuid, bigint, integer, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_pro_plan(uuid, bigint, integer, jsonb) TO service_role;

COMMENT ON FUNCTION public.activate_pro_plan(uuid, bigint, integer, jsonb) IS
  'Claims pending payment then extends pro. Returns true if activated, false if order already paid or not pending.';

-- Align admin manual grant stacking with NULL expiry edge case
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

  IF p_plan NOT IN ('free', 'pro') THEN
    RAISE EXCEPTION 'invalid_plan' USING ERRCODE = '22023';
  END IF;

  IF p_plan = 'free' THEN
    UPDATE public.profiles SET
      plan = 'free',
      plan_expires_at = NULL,
      plan_updated_at = now()
    WHERE id = p_user_id;
    RETURN;
  END IF;

  IF p_duration_days IS NULL OR p_duration_days < 1 THEN
    RAISE EXCEPTION 'invalid_duration' USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles SET
    plan = 'pro',
    plan_expires_at = CASE
      WHEN plan = 'pro' AND (plan_expires_at IS NULL OR plan_expires_at > now())
        THEN COALESCE(plan_expires_at, now()) + (p_duration_days || ' days')::interval
      ELSE now() + (p_duration_days || ' days')::interval
    END,
    plan_updated_at = now(),
    usage_count = 0,
    usage_month = public.current_usage_month()
  WHERE id = p_user_id;
END;
$$;
