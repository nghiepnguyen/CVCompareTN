-- C2: the global limit is now written by admin_update_app_setting (service_role)
-- after API validation + audit. Remove the old direct-admin RLS write path so a
-- client cannot bypass the audit trail via PostgREST.
DROP POLICY IF EXISTS "app_settings_admin_write" ON public.app_settings;
REVOKE INSERT, UPDATE, DELETE ON public.app_settings FROM anon, authenticated;
