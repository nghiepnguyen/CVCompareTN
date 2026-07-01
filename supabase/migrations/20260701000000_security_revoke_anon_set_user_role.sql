-- Security: explicitly revoke anon from set_user_role.
-- Previous migration 20260615040000 used "REVOKE ALL ... FROM PUBLIC" which does
-- NOT automatically revoke `anon` on Supabase's permission model (anon inherits
-- via PUBLIC, and REVOKE FROM PUBLIC does not revoke from roles that were
-- previously granted).
--
-- Fixes: Supabase Security Linter #0028 (anon_security_definer_function_executable)
--        for public.set_user_role(p_user_id uuid, p_role text)
--
-- The function body already has an is_admin() guard; revoking anon closes the
-- remaining attack surface from unauthenticated callers.

REVOKE EXECUTE ON FUNCTION public.set_user_role(uuid, text)
  FROM anon;