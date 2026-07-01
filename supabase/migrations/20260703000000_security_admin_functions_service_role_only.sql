-- Security: restrict admin_set_user_plan and set_user_role to service_role only.
-- These functions are now called exclusively through the backend API
-- (server/routes/admin.ts and api/admin.ts) which uses the service_role key.
-- The backend performs its own is_admin() authorization check before calling.
--
-- Fixes 2 Supabase Security Linter warnings:
--   - authenticated_security_definer_function_executable: admin_set_user_plan
--   - authenticated_security_definer_function_executable: set_user_role

-- Revoke from anon and authenticated (keep service_role)
REVOKE EXECUTE ON FUNCTION public.admin_set_user_plan(uuid, text, integer)
  FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_user_plan(uuid, text, integer)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.set_user_role(uuid, text)
  FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_user_role(uuid, text)
  TO service_role;

COMMENT ON FUNCTION public.admin_set_user_plan(uuid, text, integer) IS
  'Admin-only via backend API: set user plan to free/pro/recruiter for p_duration_days. (service_role only)';

COMMENT ON FUNCTION public.set_user_role(uuid, text) IS
  'Admin-only via backend API: promote or demote a user role. (service_role only)';