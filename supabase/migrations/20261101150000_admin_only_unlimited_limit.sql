-- B7 (admin-only unlimited): A7 production audit on 2026-10-31 returned 0
-- non-admin profiles with monthly_analytics_limit_custom = true AND
-- monthly_analytics_limit IS NULL, so this constraint can be validated
-- immediately. Admins stay unlimited by role; a normal user must either inherit
-- app_settings (custom = false) or carry an explicit non-negative limit.
--
-- Deploy the Admin UI/service change (no longer writes custom=true/limit=NULL
-- for normal users) before or together with this migration.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_admin_only_unlimited_limit'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_admin_only_unlimited_limit
      CHECK (
        role = 'admin'
        OR NOT (monthly_analytics_limit_custom AND monthly_analytics_limit IS NULL)
      );
  END IF;
END $$;

COMMENT ON CONSTRAINT profiles_admin_only_unlimited_limit ON public.profiles IS
  'Only role=admin may have custom unlimited (custom=true, limit=NULL); normal users inherit the app default or have an explicit limit.';
