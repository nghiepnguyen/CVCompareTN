-- Security: convert 4 READ-ONLY SECURITY DEFINER functions to SECURITY INVOKER.
-- These functions only perform SELECT — they do not write data, making them safe
-- to run under the caller's privileges (with proper RLS in place).
--
-- Fixes 4 Supabase Security Linter warnings:
--   - authenticated_security_definer_function_executable: get_user_plan
--   - authenticated_security_definer_function_executable: get_default_monthly_analytics_limit
--   - authenticated_security_definer_function_executable: effective_monthly_analytics_limit
--   - authenticated_security_definer_function_executable: resolve_monthly_analytics_limit
--
-- Prerequisite: app_settings needs an RLS policy so authenticated users can
-- SELECT from it. We add a simple "all authenticated" policy below.

-- -----------------------------------------------------------------------------
-- 1. Add RLS policy for app_settings (required for SECURITY INVOKER to work)
-- -----------------------------------------------------------------------------
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_settings_select_authenticated" ON public.app_settings;
CREATE POLICY "app_settings_select_authenticated"
  ON public.app_settings FOR SELECT TO authenticated
  USING (true);

-- -----------------------------------------------------------------------------
-- 2. Convert get_default_monthly_analytics_limit → SECURITY INVOKER
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_default_monthly_analytics_limit()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT (s.value #>> '{}')::integer
      FROM public.app_settings AS s
      WHERE s.key = 'default_monthly_analytics_limit'
    ),
    20
  );
$$;

-- Keep existing grant (already authenticated-only)
-- REVOKE + GRANT are idempotent, re-apply for safety
REVOKE ALL ON FUNCTION public.get_default_monthly_analytics_limit() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_default_monthly_analytics_limit() TO authenticated;

COMMENT ON FUNCTION public.get_default_monthly_analytics_limit() IS
  'Global default analyses per UTC month; fallback 20 if app_settings row missing. (SECURITY INVOKER)';

-- -----------------------------------------------------------------------------
-- 3. Convert effective_monthly_analytics_limit → SECURITY INVOKER
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.effective_monthly_analytics_limit(
  p_custom boolean,
  p_limit integer
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_custom THEN p_limit
    ELSE public.get_default_monthly_analytics_limit()
  END;
$$;

REVOKE ALL ON FUNCTION public.effective_monthly_analytics_limit(boolean, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.effective_monthly_analytics_limit(boolean, integer) TO authenticated;

COMMENT ON FUNCTION public.effective_monthly_analytics_limit(boolean, integer) IS
  'Resolves per-user limit: custom row value (NULL=unlimited) or app_settings default. (SECURITY INVOKER)';

-- -----------------------------------------------------------------------------
-- 4. Convert get_user_plan → SECURITY INVOKER
-- -----------------------------------------------------------------------------
-- Profiles RLS (profiles_select_own_or_admin) checks:
--   id = auth.uid() OR public.is_admin()
-- Since is_admin() remains SECURITY DEFINER, admin calls for other users
-- will still pass RLS. Regular users can only read their own plan.
CREATE OR REPLACE FUNCTION public.get_user_plan(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT public.effective_plan_from_row(p.plan, p.plan_expires_at)
  FROM public.profiles AS p
  WHERE p.id = p_user_id;
$$;

REVOKE ALL ON FUNCTION public.get_user_plan(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_plan(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_user_plan(uuid) IS
  'Returns effective plan (free|pro|recruiter) accounting for plan_expires_at. (SECURITY INVOKER)';

-- -----------------------------------------------------------------------------
-- 5. Convert resolve_monthly_analytics_limit → SECURITY INVOKER
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_monthly_analytics_limit(
  p_effective_plan text,
  p_custom boolean,
  p_stored_limit integer
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_effective_plan = 'recruiter' THEN 500
    WHEN p_effective_plan = 'pro' THEN 100
    WHEN p_custom THEN p_stored_limit
    ELSE public.get_default_monthly_analytics_limit()
  END;
$$;

REVOKE ALL ON FUNCTION public.resolve_monthly_analytics_limit(text, boolean, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_monthly_analytics_limit(text, boolean, integer) TO authenticated;

COMMENT ON FUNCTION public.resolve_monthly_analytics_limit(text, boolean, integer) IS
  'Resolves effective monthly analytics limit from plan + custom flag. (SECURITY INVOKER)';