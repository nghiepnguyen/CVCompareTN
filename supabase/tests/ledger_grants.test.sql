-- M2-Q H1 (Q-6): permission boundaries on the quota ledger.
-- Disposable DB only; migrations through 20261120000000. Everything rolls back.
-- REST-level and Auth-delete checks: src/__tests__/db/m2qH1LedgerGrants.db.test.ts
BEGIN;

-- ── G1. Effective privileges per role (has_table_privilege, not information_schema)
DO $$
DECLARE
 ledger constant text := 'public.analytics_quota_reservations';
 r text; p text;
BEGIN
 FOREACH p IN ARRAY ARRAY['DELETE','TRUNCATE','TRIGGER','REFERENCES'] LOOP
   ASSERT NOT has_table_privilege('service_role', ledger, p), 'service_role must not hold '||p;
 END LOOP;
 FOREACH p IN ARRAY ARRAY['SELECT','INSERT','UPDATE'] LOOP
   ASSERT has_table_privilege('service_role', ledger, p), 'service_role lost '||p||' (fixtures need it)';
 END LOOP;
 FOREACH r IN ARRAY ARRAY['anon','authenticated','authenticator'] LOOP
   FOREACH p IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER','REFERENCES'] LOOP
     ASSERT NOT has_table_privilege(r, ledger, p), r||' must not hold '||p;
   END LOOP;
 END LOOP;
 ASSERT NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='analytics_quota_reservations'),
   'ledger must have no RLS policies';
 ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid = ledger::regclass), 'ledger RLS must stay enabled';
 ASSERT pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid = ledger::regclass)) = 'postgres', 'ledger owner must be postgres';
END $$;

-- Fixture: one user with one reservation made through the real RPC.
CREATE TEMP TABLE g (u uuid, k uuid, res uuid);
INSERT INTO g VALUES (gen_random_uuid(), gen_random_uuid(), NULL);
GRANT SELECT, UPDATE ON g TO service_role;
INSERT INTO auth.users(id) SELECT u FROM g;
INSERT INTO public.profiles(id,email,role,plan,has_permission,quota_reset_day,usage_count,usage_month,
                            monthly_analytics_limit_custom,monthly_analytics_limit)
  SELECT u, 'h1-grants@example.test', 'user', 'free', true, 1, 0, public.current_quota_cycle(1::smallint), true, 10 FROM g;

-- ── G2. Billing RPCs still work when called as service_role
SET LOCAL ROLE service_role;
DO $$
DECLARE j jsonb; gu uuid; gk uuid;
BEGIN
 SELECT u, k INTO gu, gk FROM g;
 j := public.reserve_analytics_quota(gu, gk);
 ASSERT j->>'status' = 'reserved', 'reserve as service_role: '||j::text;
 UPDATE g SET res = (j->>'reservation_id')::uuid;
 j := public.commit_analytics_quota(gu, (j->>'reservation_id')::uuid);
 ASSERT j->>'status' = 'committed' AND (j->>'charged')::boolean, 'commit as service_role: '||j::text;
 j := public.reserve_analytics_quota(gu, gen_random_uuid());
 j := public.release_analytics_quota(gu, (j->>'reservation_id')::uuid, 'pre_gemini');
 ASSERT j->>'status' = 'refunded', 'release as service_role: '||j::text;
END $$;

-- ── G3. Destructive statements as service_role fail with 42501; reads and updates still work
DO $$
DECLARE stmt text; ok boolean;
BEGIN
 FOREACH stmt IN ARRAY ARRAY[
   'DELETE FROM public.analytics_quota_reservations WHERE user_id = (SELECT u FROM g)',
   'TRUNCATE public.analytics_quota_reservations',
   'TRUNCATE public.profiles CASCADE'
 ] LOOP
   ok := false;
   BEGIN
     EXECUTE stmt;
   EXCEPTION WHEN insufficient_privilege THEN ok := true;
   END;
   ASSERT ok, 'expected 42501 for: '||stmt;
 END LOOP;
 ASSERT (SELECT count(*) FROM public.analytics_quota_reservations WHERE user_id = (SELECT u FROM g)) = 2,
   'service_role can no longer read the ledger';
 UPDATE public.analytics_quota_reservations SET outcome = outcome WHERE user_id = (SELECT u FROM g);
END $$;
RESET ROLE;

-- ── G4. Account delete still cascades ledger rows (RI runs as the table owner).
-- Exercised as service_role through the deleteUser.ts profiles.delete() fallback;
-- the GoTrue auth.admin.deleteUser path is covered by the DB vitest.
SET LOCAL ROLE service_role;
DO $$
BEGIN
 ASSERT (SELECT count(*) FROM public.analytics_quota_reservations WHERE user_id = (SELECT u FROM g)) = 2, 'fixture rows missing';
 DELETE FROM public.profiles WHERE id = (SELECT u FROM g);
END $$;
RESET ROLE;
DO $$
BEGIN
 ASSERT NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT u FROM g)), 'profile not deleted';
 ASSERT NOT EXISTS (SELECT 1 FROM public.analytics_quota_reservations WHERE user_id = (SELECT u FROM g)),
   'ledger rows not cascaded on account delete (cascade behaviour changed)';
END $$;

ROLLBACK;
SELECT 'ledger_grants: all assertions passed' AS result;
