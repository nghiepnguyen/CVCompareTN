-- admin_set_user_plan / set_user_role have been service_role-only since
-- 20260703000000 (called by /api/admin after it verifies profiles.role='admin').
-- Their in-function is_admin() check reads auth.uid(), which is NULL under
-- service_role, so every admin plan/role change failed with not_admin.
-- Drop that dead check (and set_user_role's auth.uid() self-demotion check,
-- now enforced in the API handlers). Bodies otherwise unchanged; grants kept.

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

CREATE OR REPLACE FUNCTION public.set_user_role(p_user_id uuid, p_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_role NOT IN ('user', 'admin') THEN
    RAISE EXCEPTION 'invalid_role' USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles
  SET role = p_role
  WHERE id = p_user_id;
END;
$$;
