-- API-role EXECUTE guard: SECURITY DEFINER functions in API-exposed schemas
-- must not be executable by anon/authenticated unless listed below with a reason.
-- Uses has_function_privilege, so it sees the EFFECTIVE privilege: direct grants,
-- grants to PUBLIC, grants inherited through role membership, and Supabase's
-- default privileges (which grant EXECUTE on every new public function to
-- anon/authenticated unless the migration revokes it). Read-only; no fixtures.
--
-- Adding a DEFINER function that clients must call? Add it here with the reason
-- and the in-function check that makes it safe. Revoking one? Remove its row:
-- the suite also fails on stale entries so the list stays exact.
BEGIN;
DO $$
DECLARE
  unexpected text;
  stale text;
BEGIN
  CREATE TEMP TABLE allowed(fn regprocedure, role name, reason text) ON COMMIT DROP;
  INSERT INTO allowed VALUES
    -- Anonymous on purpose: public pricing page reads plan caps, no user data.
    ('public.get_public_plan_limits()', 'anon', 'public plan caps for pricing page'),
    ('public.get_public_plan_limits()', 'authenticated', 'public plan caps for pricing page'),
    -- Signed-in client RPCs; each scopes to auth.uid() (or is_admin()) inside.
    ('public.add_application_note(uuid,text,uuid)', 'authenticated', 'tracker: own application only'),
    ('public.check_analytics_quota(uuid,integer)', 'authenticated', 'quota check: own id only'),
    ('public.claim_candidate_analysis(uuid,uuid,boolean)', 'authenticated', 'recruiter: own campaign only'),
    ('public.increment_usage_count(uuid)', 'authenticated', 'quota: own id only'),
    ('public.is_admin()', 'authenticated', 'RLS helper, reads caller role'),
    ('public.log_admin_action(text,uuid,jsonb)', 'authenticated', 'admin audit, requires is_admin()'),
    ('public.log_application_contact(uuid,text,timestamp with time zone,text,uuid)', 'authenticated', 'tracker: own application only'),
    ('public.save_application(uuid,text,text,text,text,jsonb,text,text,jsonb,text,text)', 'authenticated', 'P2A sole write path, own rows'),
    ('public.transition_application_status(uuid,text,text,timestamp with time zone,text,uuid)', 'authenticated', 'tracker: own application only'),
    ('public.update_application_details(uuid,timestamp with time zone,text,text,date,uuid)', 'authenticated', 'tracker: own application only'),
    ('public.update_candidate_hr_status(uuid,text,text)', 'authenticated', 'recruiter: own campaign only');

  CREATE TEMP TABLE actual ON COMMIT DROP AS
    SELECT p.oid::regprocedure AS fn, r.role
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN (VALUES ('anon'::name), ('authenticated'::name)) r(role)
    WHERE n.nspname IN ('public', 'graphql_public')
      AND p.prosecdef
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
      AND has_function_privilege(r.role, p.oid, 'EXECUTE');

  SELECT string_agg(format('%s -> %s', fn, role), E'\n' ORDER BY fn::text, role) INTO unexpected
  FROM (SELECT fn, role FROM actual EXCEPT SELECT fn, role FROM allowed) x;
  SELECT string_agg(format('%s -> %s', fn, role), E'\n' ORDER BY fn::text, role) INTO stale
  FROM (SELECT fn, role FROM allowed EXCEPT SELECT fn, role FROM actual) x;

  ASSERT unexpected IS NULL, E'SECURITY DEFINER function executable by an API role without allowlist entry:\n' || unexpected;
  ASSERT stale IS NULL, E'allowlist entry no longer granted (remove it):\n' || stale;
END $$;
ROLLBACK;
