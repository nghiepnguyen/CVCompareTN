-- B6: one transaction for an admin edit that may change plan and/or the
-- monthly limit. Replaces the UI's sequential limit-then-plan calls, which
-- could leave a half-applied state and could stack plan duration twice on a
-- double submit.
--
-- Called only by the backend (service_role) after /api/admin verifies the
-- caller. p_plan NULL = keep the plan; p_limit_mode 'keep' = keep the limit.
-- Audit rows are written in the same transaction, so a failure rolls back the
-- privileged change too.

CREATE OR REPLACE FUNCTION public.admin_update_user(
  p_admin_id uuid,
  p_user_id uuid,
  p_plan text DEFAULT NULL,
  p_duration_days integer DEFAULT 30,
  p_limit_mode text DEFAULT 'keep',
  p_limit integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_target_role text;
  v_duration integer := COALESCE(p_duration_days, 30);
  v_limit_mode text := COALESCE(p_limit_mode, 'keep');
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_admin_id AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'user not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_plan IS NOT NULL AND p_plan NOT IN ('free', 'pro', 'recruiter') THEN
    RAISE EXCEPTION 'invalid plan' USING ERRCODE = '22023';
  END IF;

  IF p_plan IS NOT NULL AND v_duration < 1 THEN
    RAISE EXCEPTION 'invalid duration' USING ERRCODE = '22023';
  END IF;

  IF v_limit_mode NOT IN ('keep', 'inherit', 'custom') THEN
    RAISE EXCEPTION 'invalid limit mode' USING ERRCODE = '22023';
  END IF;

  IF v_limit_mode = 'custom' AND (p_limit IS NULL OR p_limit < 0) THEN
    RAISE EXCEPTION 'invalid limit' USING ERRCODE = '22023';
  END IF;

  SELECT role INTO v_target_role FROM public.profiles WHERE id = p_user_id;

  IF p_plan IS NOT NULL THEN
    PERFORM public.admin_set_user_plan(p_user_id, p_plan, v_duration);
    INSERT INTO public.admin_audit_log(admin_id, action, target_user_id, details)
    VALUES (
      p_admin_id,
      'update_plan',
      p_user_id,
      jsonb_build_object(
        'plan', p_plan,
        'duration_days', v_duration,
        'target_role', v_target_role
      )
    );
  END IF;

  IF v_limit_mode = 'inherit' THEN
    UPDATE public.profiles
    SET monthly_analytics_limit_custom = false
    WHERE id = p_user_id;

    INSERT INTO public.admin_audit_log(admin_id, action, target_user_id, details)
    VALUES (
      p_admin_id,
      'update_analytics_limit',
      p_user_id,
      jsonb_build_object('limit_mode', 'inherit', 'monthly_analytics_limit', NULL)
    );
  ELSIF v_limit_mode = 'custom' THEN
    UPDATE public.profiles
    SET monthly_analytics_limit = p_limit,
        monthly_analytics_limit_custom = true
    WHERE id = p_user_id;

    INSERT INTO public.admin_audit_log(admin_id, action, target_user_id, details)
    VALUES (
      p_admin_id,
      'update_analytics_limit',
      p_user_id,
      jsonb_build_object('limit_mode', 'custom', 'monthly_analytics_limit', p_limit)
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_user(uuid, uuid, text, integer, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_user(uuid, uuid, text, integer, text, integer)
  TO service_role;

COMMENT ON FUNCTION public.admin_update_user(uuid, uuid, text, integer, text, integer) IS
  'Admin-only via backend: atomically update plan and/or monthly limit, with audit rows in the same transaction.';
