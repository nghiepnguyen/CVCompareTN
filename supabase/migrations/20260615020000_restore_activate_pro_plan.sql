-- Restore activate_pro_plan after it was accidentally dropped by migration 20260615000000.
-- Root cause: 20260615000000 dropped the 5-param version (uuid, bigint, integer, jsonb, text)
-- which was the ONLY version in production (4-param was replaced by 20260601300000).
-- The function was already secured (GRANT TO service_role only) before the accidental drop.
-- This migration restores the exact definition from 20260601300000_add_recruiter_campaigns.sql.

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

  UPDATE public.profiles AS p SET
    plan = p_plan,
    plan_expires_at = CASE
      WHEN p.plan = p_plan AND (p.plan_expires_at IS NULL OR p.plan_expires_at > now())
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

REVOKE ALL ON FUNCTION public.activate_pro_plan(uuid, bigint, integer, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_pro_plan(uuid, bigint, integer, jsonb, text) TO service_role;

COMMENT ON FUNCTION public.activate_pro_plan(uuid, bigint, integer, jsonb, text) IS
  'Claims pending payment then extends pro/recruiter. Returns true if activated, false if order already paid or not pending.';
