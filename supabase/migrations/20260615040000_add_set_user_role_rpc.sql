-- RPC: set_user_role — admin-only role promotion/demotion.
-- Replaces direct client-side UPDATE on profiles.role (which relied solely on RLS).
-- Guards: caller must be admin, role must be valid, admin cannot demote themselves.

CREATE OR REPLACE FUNCTION public.set_user_role(
  p_user_id uuid,
  p_role text
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

  IF p_role NOT IN ('user', 'admin') THEN
    RAISE EXCEPTION 'invalid_role' USING ERRCODE = '22023';
  END IF;

  -- Prevent self-demotion (admin cannot remove their own admin access)
  IF p_user_id = auth.uid() AND p_role = 'user' THEN
    RAISE EXCEPTION 'cannot_demote_self' USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles
  SET role = p_role
  WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_user_role(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_user_role(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.set_user_role(uuid, text) IS
  'Admin-only: promote or demote a user role. Guards: must be admin, valid role, cannot self-demote.';
