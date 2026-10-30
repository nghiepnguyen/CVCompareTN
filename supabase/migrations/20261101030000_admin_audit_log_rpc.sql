-- P2-1: stop non-admins forging admin_audit_log rows.
-- OWNER: before applying on production, run
--   SELECT action, count(*) FROM public.admin_audit_log GROUP BY 1;
-- Any action outside the 6 below is possibly a forged row; the CHECK would fail
-- on it (delete it, or change the constraint to NOT VALID).

REVOKE INSERT ON public.admin_audit_log FROM authenticated, anon;
DROP POLICY IF EXISTS "self_insert_audit_log" ON public.admin_audit_log;

ALTER TABLE public.admin_audit_log
  ADD CONSTRAINT admin_audit_log_action_check CHECK (action IN (
    'update_role','update_plan','delete_user',
    'update_permission','update_analytics_limit','reset_analytics_limit'));

CREATE OR REPLACE FUNCTION public.log_admin_action(
  p_action text, p_target_user_id uuid, p_details jsonb DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.admin_audit_log(admin_id, action, target_user_id, details)
  VALUES (auth.uid(), p_action, p_target_user_id, p_details);
END $$;

REVOKE ALL ON FUNCTION public.log_admin_action(text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_admin_action(text, uuid, jsonb) TO authenticated;
