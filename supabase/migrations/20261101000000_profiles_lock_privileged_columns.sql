-- P0-1 (security audit 2026-10-30): an authenticated user could PATCH their own
-- profiles row to role='admin' / paid plan / reset quota, because RLS only checks
-- row ownership. Clients (authenticated/anon) now get safe values on INSERT and
-- cannot change privileged columns on UPDATE. SECURITY DEFINER RPCs (run as owner)
-- and the service_role backend are not affected.

CREATE OR REPLACE FUNCTION public.profiles_guard_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.role := 'user';
    NEW.plan := 'free';
    NEW.plan_expires_at := NULL;
    NEW.plan_updated_at := NULL;
    NEW.usage_count := 0;
    NEW.has_permission := true;
    NEW.monthly_analytics_limit_custom := false;
    -- Matches vnSignupQuotaCycle (src/lib/vnTime.ts).
    NEW.quota_reset_day := LEAST(EXTRACT(DAY FROM now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::int, 28);
    NEW.usage_month := public.current_quota_cycle(NEW.quota_reset_day);
    RETURN NEW;
  END IF;

  -- Role/plan go through /api/admin (service_role); counters through definer RPCs.
  IF (NEW.role, NEW.plan, NEW.plan_expires_at, NEW.plan_updated_at,
      NEW.usage_count, NEW.usage_month, NEW.quota_reset_day)
     IS DISTINCT FROM
     (OLD.role, OLD.plan, OLD.plan_expires_at, OLD.plan_updated_at,
      OLD.usage_count, OLD.usage_month, OLD.quota_reset_day) THEN
    RAISE EXCEPTION 'profiles privileged columns are server-managed'
      USING ERRCODE = '42501';
  END IF;

  IF (NEW.has_permission, NEW.monthly_analytics_limit, NEW.monthly_analytics_limit_custom)
     IS DISTINCT FROM
     (OLD.has_permission, OLD.monthly_analytics_limit, OLD.monthly_analytics_limit_custom)
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'profiles permission/limit columns require admin'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.profiles_guard_privileged_columns() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_guard_privileged_columns ON public.profiles;
CREATE TRIGGER profiles_guard_privileged_columns
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_privileged_columns();

REVOKE UPDATE, DELETE ON public.profiles FROM authenticated, anon;
GRANT UPDATE (display_name, photo_url, is_new, has_permission,
              monthly_analytics_limit, monthly_analytics_limit_custom)
  ON public.profiles TO authenticated;

-- User deletion is a hard delete via /api/admin (service_role); no client path.
DROP POLICY IF EXISTS "profiles_delete_own_or_admin" ON public.profiles;
