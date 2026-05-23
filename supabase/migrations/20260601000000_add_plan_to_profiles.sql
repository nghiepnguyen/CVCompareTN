-- PayOS Pro: plan columns, payments ledger, plan RPCs, quota by plan

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'free'
    CHECK (plan IN ('free', 'pro')),
  ADD COLUMN IF NOT EXISTS plan_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS plan_updated_at timestamptz;

COMMENT ON COLUMN public.profiles.plan IS 'Subscription tier: free or pro (check plan_expires_at for active pro).';
COMMENT ON COLUMN public.profiles.plan_expires_at IS 'UTC expiry for pro; NULL with plan=pro treated as active in get_user_plan.';

CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  order_code bigint NOT NULL UNIQUE,
  amount integer NOT NULL,
  plan text NOT NULL DEFAULT 'pro' CHECK (plan IN ('free', 'pro')),
  duration_days integer NOT NULL DEFAULT 30,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'cancelled', 'expired')),
  payos_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);

CREATE INDEX IF NOT EXISTS payments_user_id_idx ON public.payments(user_id);
CREATE INDEX IF NOT EXISTS payments_order_code_idx ON public.payments(order_code);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payments_select_own" ON public.payments;
CREATE POLICY "payments_select_own"
  ON public.payments FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Effective plan from profile row (stable helper)
CREATE OR REPLACE FUNCTION public.effective_plan_from_row(
  p_plan text,
  p_expires_at timestamptz
)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN p_plan = 'pro' AND (p_expires_at IS NULL OR p_expires_at > now())
      THEN 'pro'
    ELSE 'free'
  END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_plan(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.effective_plan_from_row(p.plan, p.plan_expires_at)
  FROM public.profiles AS p
  WHERE p.id = p_user_id;
$$;

REVOKE ALL ON FUNCTION public.get_user_plan(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_plan(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_user_plan(uuid) IS
  'Returns effective plan (free|pro) accounting for plan_expires_at.';

CREATE OR REPLACE FUNCTION public.activate_pro_plan(
  p_user_id uuid,
  p_order_code bigint,
  p_duration_days integer DEFAULT 30,
  p_payos_data jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles SET
    plan = 'pro',
    plan_expires_at = CASE
      WHEN plan = 'pro' AND plan_expires_at > now()
        THEN plan_expires_at + (p_duration_days || ' days')::interval
      ELSE now() + (p_duration_days || ' days')::interval
    END,
    plan_updated_at = now(),
    usage_count = 0,
    usage_month = public.current_usage_month()
  WHERE id = p_user_id;

  UPDATE public.payments SET
    status = 'paid',
    paid_at = now(),
    payos_data = COALESCE(p_payos_data, payos_data)
  WHERE order_code = p_order_code AND user_id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.activate_pro_plan(uuid, bigint, integer, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_pro_plan(uuid, bigint, integer, jsonb) TO service_role;

-- Resolve monthly analytics limit including pro tier (100) and admin unlimited
CREATE OR REPLACE FUNCTION public.resolve_monthly_analytics_limit(
  p_effective_plan text,
  p_custom boolean,
  p_stored_limit integer
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_custom AND p_stored_limit IS NULL THEN NULL
    WHEN p_effective_plan = 'pro' THEN 100
    ELSE public.effective_monthly_analytics_limit(p_custom, p_stored_limit)
  END;
$$;

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
  v_month text := public.current_usage_month();
  v_used integer;
  v_custom boolean;
  v_stored_limit integer;
  v_limit integer;
  v_effective_plan text;
  v_row_plan text;
  v_expires_at timestamptz;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;

  PERFORM public.sync_profile_usage_month(p_user_id);

  SELECT p.usage_count,
         p.monthly_analytics_limit_custom,
         p.monthly_analytics_limit,
         p.plan,
         p.plan_expires_at
  INTO v_used, v_custom, v_stored_limit, v_row_plan, v_expires_at
  FROM public.profiles AS p
  WHERE p.id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'used', 0,
      'limit', null,
      'month', v_month,
      'plan', 'free',
      'reason', 'profile_not_found'
    );
  END IF;

  v_effective_plan := public.effective_plan_from_row(v_row_plan, v_expires_at);
  v_limit := public.resolve_monthly_analytics_limit(v_effective_plan, v_custom, v_stored_limit);

  IF v_limit IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'used', v_used,
      'limit', null,
      'month', v_month,
      'plan', v_effective_plan
    );
  END IF;

  IF v_used + GREATEST(p_additional, 0) > v_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'used', v_used,
      'limit', v_limit,
      'month', v_month,
      'plan', v_effective_plan,
      'reason', 'monthly_limit_exceeded'
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'used', v_used,
    'limit', v_limit,
    'month', v_month,
    'plan', v_effective_plan
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_usage_count(user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month text := public.current_usage_month();
  v_custom boolean;
  v_stored_limit integer;
  v_limit integer;
  v_used integer;
  v_effective_plan text;
  v_row_plan text;
  v_expires_at timestamptz;
BEGIN
  IF user_id IS DISTINCT FROM auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;

  PERFORM public.sync_profile_usage_month(user_id);

  SELECT p.usage_count,
         p.monthly_analytics_limit_custom,
         p.monthly_analytics_limit,
         p.plan,
         p.plan_expires_at
  INTO v_used, v_custom, v_stored_limit, v_row_plan, v_expires_at
  FROM public.profiles AS p
  WHERE p.id = user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_effective_plan := public.effective_plan_from_row(v_row_plan, v_expires_at);
  v_limit := public.resolve_monthly_analytics_limit(v_effective_plan, v_custom, v_stored_limit);

  IF v_limit IS NOT NULL AND v_used >= v_limit THEN
    RAISE EXCEPTION 'monthly_limit_exceeded'
      USING ERRCODE = 'P0001',
            MESSAGE = 'Monthly analytics limit reached';
  END IF;

  UPDATE public.profiles AS p
  SET usage_count = COALESCE(p.usage_count, 0) + 1,
      usage_month = v_month
  WHERE p.id = user_id;
END;
$$;
