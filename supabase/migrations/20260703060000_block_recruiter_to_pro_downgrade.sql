-- Block "downgrade" from an active recruiter plan (500 analyses/mo) to pro
-- (100/mo) via either admin-initiated plan changes or self-service payment
-- activation. The self-service checkout-creation path is already guarded in
-- _server-lib/payment/handlers.ts (handlePaymentCreate rejects before taking
-- payment); these DB-level guards are the authoritative backstop for both
-- entry points (admin_set_user_plan, activate_pro_plan), covering direct RPC
-- calls and races where a checkout was created before the user became
-- recruiter. Downgrading to 'free' is unaffected — only pro is blocked while
-- the recruiter grant is still active (NULL or future plan_expires_at).

-- =============================================================================
-- 1. admin_set_user_plan
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
  v_current_plan text;
  v_current_plan_expires_at timestamptz;
  v_current_usage_count integer;
  v_current_usage_month text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
  END IF;

  IF p_plan NOT IN ('free', 'pro', 'recruiter') THEN
    RAISE EXCEPTION 'invalid_plan' USING ERRCODE = '22023';
  END IF;

  SELECT p.quota_reset_day, p.plan, p.plan_expires_at, p.usage_count, p.usage_month
  INTO v_reset_day, v_current_plan, v_current_plan_expires_at, v_current_usage_count, v_current_usage_month
  FROM public.profiles AS p
  WHERE p.id = p_user_id;

  IF p_plan = 'pro' AND v_current_plan = 'recruiter'
     AND (v_current_plan_expires_at IS NULL OR v_current_plan_expires_at > now()) THEN
    RAISE EXCEPTION 'cannot_downgrade_recruiter_to_pro' USING ERRCODE = 'P0001';
  END IF;

  IF v_reset_day IS NULL THEN
    v_reset_day := 1::smallint;
  END IF;

  IF p_plan = 'free' THEN
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
        THEN NULL                                                                       -- perpetual stays perpetual
      WHEN plan = p_plan AND plan_expires_at > now()
        THEN plan_expires_at + (p_duration_days || ' days')::interval                  -- stack on active plan
      ELSE now() + (p_duration_days || ' days')::interval                              -- fresh start (plan change or expired)
    END,
    plan_updated_at = now(),
    usage_count = CASE WHEN v_current_plan = 'free' THEN COALESCE(v_current_usage_count, 0) ELSE 0 END,
    usage_month = CASE
      WHEN v_current_plan = 'free'
        THEN COALESCE(v_current_usage_month, public.current_quota_cycle(v_reset_day))
      ELSE public.current_quota_cycle(v_reset_day)
    END,
    quota_reset_day = v_reset_day
  WHERE id = p_user_id;
END;
$$;

COMMENT ON FUNCTION public.admin_set_user_plan(uuid, text, integer) IS
  'Admin-only: set user plan. Free downgrade resets usage_count. Free→paid upgrade preserves usage_count. Paid renewal resets to 0. Perpetual plans (NULL expiry) stay perpetual on same-plan renewal. Blocks recruiter→pro downgrade while recruiter is active.';

-- =============================================================================
-- 2. activate_pro_plan
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
  v_current_plan text;
  v_current_plan_expires_at timestamptz;
BEGIN
  IF p_plan NOT IN ('pro', 'recruiter') THEN
    RAISE EXCEPTION 'invalid_plan_type' USING ERRCODE = '22023';
  END IF;

  SELECT p.plan, p.plan_expires_at INTO v_current_plan, v_current_plan_expires_at
  FROM public.profiles AS p
  WHERE p.id = p_user_id;

  IF p_plan = 'pro' AND v_current_plan = 'recruiter'
     AND (v_current_plan_expires_at IS NULL OR v_current_plan_expires_at > now()) THEN
    RAISE EXCEPTION 'cannot_downgrade_recruiter_to_pro' USING ERRCODE = 'P0001';
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
        THEN NULL                                                                      -- perpetual stays perpetual
      WHEN p.plan = p_plan AND p.plan_expires_at > now()
        THEN p.plan_expires_at + (v_duration || ' days')::interval                    -- stack on active plan
      ELSE now() + (v_duration || ' days')::interval                                  -- fresh start (plan change or expired)
    END,
    plan_updated_at = now(),
    -- free→paid: preserve count so user sees real tally vs new higher limit
    -- paid→paid (renewal): reset to 0 — fresh quota period starts now
    usage_count = CASE WHEN p.plan = 'free' THEN COALESCE(p.usage_count, 0) ELSE 0 END,
    usage_month = CASE
      WHEN p.plan = 'free' THEN COALESCE(p.usage_month, public.current_quota_cycle(v_reset_day))
      ELSE public.current_quota_cycle(v_reset_day)
    END,
    quota_reset_day = v_reset_day
  WHERE p.id = v_claimed_user_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.activate_pro_plan(uuid, bigint, integer, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_pro_plan(uuid, bigint, integer, jsonb, text) TO service_role;

COMMENT ON FUNCTION public.activate_pro_plan(uuid, bigint, integer, jsonb, text) IS
  'Claims pending payment then extends pro/recruiter. Perpetual plans (NULL expiry) stay perpetual on renewal. Future expiry stacks. Plan change resets to now()+duration. Preserves usage_count when upgrading from free; resets to 0 when renewing same paid plan. Blocks recruiter→pro downgrade while recruiter is active (payment stays pending, not claimed).';
