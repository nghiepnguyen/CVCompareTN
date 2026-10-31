-- §4.11: remove legacy policies that exist only on the production database
-- (created through the dashboard around the 2026-06-13 manual changes) and are
-- not part of the source migration chain.
--
-- `allow_read_all` let every authenticated user SELECT every row in
-- `profiles` (email, plan, usage, permission flags) — broader than the product
-- needs. The other policies duplicate the own/admin policies created in
-- 20260516120000_cv_matcher_core_schema.sql (profiles/history/saved_jds), so
-- removing them keeps the source-of-truth model: owner row or `is_admin()`.
-- Idempotent so the migration is safe on databases that never had them.

DROP POLICY IF EXISTS "allow_read_all" ON public.profiles;
DROP POLICY IF EXISTS "allow_admin_manage_all" ON public.profiles;
DROP POLICY IF EXISTS "allow_update_self" ON public.profiles;
DROP POLICY IF EXISTS "allow_insert_for_self" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

DROP POLICY IF EXISTS "Users can manage own history" ON public.history;

DROP POLICY IF EXISTS "Allow users to delete their own JDs" ON public.saved_jds;
DROP POLICY IF EXISTS "Allow users to insert their own JDs" ON public.saved_jds;
DROP POLICY IF EXISTS "Allow users to view their own JDs" ON public.saved_jds;
DROP POLICY IF EXISTS "Users can manage own saved jds" ON public.saved_jds;
