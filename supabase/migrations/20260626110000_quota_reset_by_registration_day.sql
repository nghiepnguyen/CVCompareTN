-- Replace monthly calendar reset with per-user "registration day" quota reset.
-- Instead of resetting usage_count on the 1st of each month (YYYY-MM),
-- each user has a quota_reset_day (1-28) and the cycle key becomes YYYY-MM-DD.

-- =============================================================================
-- 1. Add quota_reset_day column to profiles
-- =============================================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS quota_reset_day smallint
    CHECK (quota_reset_day >= 1 AND quota_reset_day <= 28);

COMMENT ON COLUMN public.profiles.quota_reset_day IS
  'Day of month (1–28) when the monthly usage_count resets. Default 1 = first of month.';

-- Set existing users to day 1 (backward-compatible: preserves current behavior)
UPDATE public.profiles
SET quota_reset_day = 1
WHERE quota_reset_day IS NULL;

-- Make it NOT NULL after backfill
ALTER TABLE public.profiles
  ALTER COLUMN quota_reset_day SET NOT NULL,
  ALTER COLUMN quota_reset_day SET DEFAULT 1;

-- =============================================================================
-- 2. Create current_quota_cycle(reset_day) — replaces current_usage_month()
-- =============================================================================
CREATE OR REPLACE FUNCTION public.current_quota_cycle(p_reset_day smallint)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT to_char(
    CASE
      WHEN EXTRACT(DAY FROM now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::int >= p_reset_day
        THEN date_trunc('month', now() AT TIME ZONE 'Asia/Ho_Chi_Minh')
             + make_interval(days => p_reset_day - 1)
      ELSE date_trunc('month', now() AT TIME ZONE 'Asia/Ho_Chi_Minh')
           - INTERVAL '1 month'
           + make_interval(days => p_reset_day - 1)
    END,
    'YYYY-MM-DD'
  );
$$;

REVOKE ALL ON FUNCTION public.current_quota_cycle(smallint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_quota_cycle(smallint) TO authenticated;

COMMENT ON FUNCTION public.current_quota_cycle(smallint) IS
  'Returns the start date (YYYY-MM-DD) of the current quota cycle for a given reset day (1-28). The cycle key changes when the calendar date passes the next reset day.';

-- =============================================================================
-- 3. Rewrite sync_profile_usage_month — detect plan expiry + per-user reset day.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.sync_profile_usage_month(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
  v_cycle text;
BEGIN
  SELECT p.plan, p.plan_expires_at, p.quota_reset_day
  INTO v_row
  FROM public.profiles AS p
  WHERE p.id = p_user_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_cycle := public.current_quota_cycle((COALESCE(v_row.quota_reset_day, 1))::smallint);

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
      usage_month = v_cycle
    WHERE p.id = p_user_id
      AND p.plan = v_row.plan
      AND p.plan_expires_at IS NOT NULL
      AND p.plan_expires_at <= now();
    RETURN;
  END IF;

  -- Quota cycle rollover: reset usage_count when the cycle changes
  UPDATE public.profiles AS p
  SET usage_month = v_cycle,
      usage_count = 0
  WHERE p.id = p_user_id
    AND p.usage_month IS DISTINCT FROM v_cycle;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_profile_usage_month(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_profile_usage_month(uuid) TO authenticated;

COMMENT ON FUNCTION public.sync_profile_usage_month(uuid) IS
  'Reset usage_count when the per-user quota cycle changes (based on quota_reset_day) OR when pro/recruiter plan expires (demote to free). Called by check_analytics_quota and increment_usage_count.';

-- =============================================================================
-- 4. Update check_analytics_quota — use quota_reset_day
-- =============================================================================
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
  IF p_user_id IS DISTINCT FROM auth.uid() AND NOT public.is_admin() THEN
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

REVOKE ALL ON FUNCTION public.check_analytics_quota(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_analytics_quota(uuid, integer) TO authenticated;

COMMENT ON FUNCTION public.check_analytics_quota(uuid, integer) IS
  'Returns allowed/used/limit for the current per-user quota cycle. Resets usage_count when the cycle changes (based on quota_reset_day) or when pro/recruiter expires.';

-- =============================================================================
-- 5. Update increment_usage_count — use quota_reset_day
-- =============================================================================
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
  IF user_id IS DISTINCT FROM auth.uid() AND NOT public.is_admin() THEN
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
  'Increments usage_count after successful analysis; enforces limit per quota cycle (based on quota_reset_day).';

-- =============================================================================
-- 6. Update activate_pro_plan — write quota_reset_day on activation
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
      WHEN p.plan = p_plan AND (p.plan_expires_at IS NULL OR p.plan_expires_at > now())
        THEN COALESCE(p.plan_expires_at, now()) + (v_duration || ' days')::interval
      ELSE now() + (v_duration || ' days')::interval
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
  'Claims pending payment then extends pro/recruiter. Returns true if activated, false if order already paid or not pending.';

-- =============================================================================
-- 7. Update admin_set_user_plan — preserve quota_reset_day on free downgrade
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
      WHEN plan = p_plan AND (plan_expires_at IS NULL OR plan_expires_at > now())
        THEN COALESCE(plan_expires_at, now()) + (p_duration_days || ' days')::interval
      ELSE now() + (p_duration_days || ' days')::interval
    END,
    plan_updated_at = now(),
    usage_count = 0,
    usage_month = public.current_quota_cycle(v_reset_day),
    quota_reset_day = v_reset_day
  WHERE id = p_user_id;
END;
$$;

COMMENT ON FUNCTION public.admin_set_user_plan(uuid, text, integer) IS
  'Admin-only: set user plan to free/pro/recruiter for p_duration_days. Free downgrade resets usage_count.';

-- =============================================================================
-- 8. Backfill usage_month for existing users
--    Old values were YYYY-MM; update to YYYY-MM-DD based on quota_reset_day
-- =============================================================================
UPDATE public.profiles AS p
SET usage_month = public.current_quota_cycle((COALESCE(p.quota_reset_day, 1))::smallint)
WHERE length(p.usage_month) <= 7;  -- Only fix old-format values (YYYY-MM)