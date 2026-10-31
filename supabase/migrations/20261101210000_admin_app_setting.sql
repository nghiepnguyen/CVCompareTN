-- C2: move the global limit write behind the admin API and audit it in the
-- same transaction. The app_settings table keeps its own updated_by, but the
-- privileged action is now recorded in admin_audit_log too.

ALTER TABLE public.admin_audit_log
  DROP CONSTRAINT IF EXISTS admin_audit_log_action_check;

ALTER TABLE public.admin_audit_log
  ADD CONSTRAINT admin_audit_log_action_check CHECK (action IN (
    'update_role','update_plan','delete_user',
    'update_permission','update_analytics_limit','reset_analytics_limit',
    'update_app_setting'
  ));

CREATE OR REPLACE FUNCTION public.admin_update_app_setting(
  p_admin_id uuid,
  p_key text,
  p_value jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_admin_id AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = '42501';
  END IF;

  IF p_key <> 'default_monthly_analytics_limit' THEN
    RAISE EXCEPTION 'invalid setting key' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_value) <> 'number'
     OR (p_value #>> '{}') !~ '^[0-9]+$' THEN
    RAISE EXCEPTION 'invalid setting value' USING ERRCODE = '22023';
  END IF;

  v_limit := (p_value #>> '{}')::integer;
  IF v_limit < 0 OR v_limit > 100000 THEN
    RAISE EXCEPTION 'invalid setting value' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.app_settings(key, value, updated_at, updated_by)
  VALUES (p_key, to_jsonb(v_limit), now(), p_admin_id)
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value,
        updated_at = now(),
        updated_by = EXCLUDED.updated_by;

  INSERT INTO public.admin_audit_log(admin_id, action, target_user_id, details)
  VALUES (
    p_admin_id,
    'update_app_setting',
    NULL,
    jsonb_build_object('key', p_key, 'value', v_limit)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_app_setting(uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_app_setting(uuid, text, jsonb)
  TO service_role;

COMMENT ON FUNCTION public.admin_update_app_setting(uuid, text, jsonb) IS
  'Admin-only via backend: validated app_settings upsert + audit row in one transaction.';
