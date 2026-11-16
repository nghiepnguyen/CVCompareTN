-- Disposable DB only; migrations through 20261116000000. Fixtures roll back.
-- Single-session semantics of the M2-C2 quota ledger. Concurrency is covered
-- by scripts/db-quota-concurrency.ts (parallel connections).
BEGIN;

CREATE FUNCTION pg_temp.set_user(u uuid, jwt_role text DEFAULT 'authenticated') RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM set_config('request.jwt.claims', json_build_object('sub',u,'role',jwt_role)::text, true);
 PERFORM set_config('request.jwt.claim.sub', coalesce(u::text,''), true);
 PERFORM set_config('request.jwt.claim.role', jwt_role, true);
END $$;

-- ── Permissions ────────────────────────────────────────────────────────────
DO $$
DECLARE f text;
BEGIN
 ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid='public.analytics_quota_reservations'::regclass), 'RLS must be enabled';
 ASSERT NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.analytics_quota_reservations'::regclass), 'ledger must have no policies';
 ASSERT NOT has_table_privilege('authenticated','public.analytics_quota_reservations','SELECT'), 'authenticated can read ledger';
 ASSERT NOT has_table_privilege('authenticated','public.analytics_quota_reservations','INSERT'), 'authenticated can write ledger';
 ASSERT NOT has_table_privilege('anon','public.analytics_quota_reservations','SELECT'), 'anon can read ledger';
 FOREACH f IN ARRAY ARRAY[
   'public.reserve_analytics_quota(uuid,uuid,integer)',
   'public.commit_analytics_quota(uuid,uuid)',
   'public.release_analytics_quota(uuid,uuid,text)',
   'public.analytics_quota_lock_state(uuid)',
   'public.analytics_quota_mark_uncertain(uuid,text,integer,integer,text)',
   'public.analytics_quota_expire(uuid,integer,text)',
   'public.analytics_quota_forgiven_per_cycle()']
 LOOP
   ASSERT NOT has_function_privilege('anon', f, 'EXECUTE'), 'anon can execute '||f;
   ASSERT NOT has_function_privilege('authenticated', f, 'EXECUTE'), 'authenticated can execute '||f;
 END LOOP;
 FOREACH f IN ARRAY ARRAY[
   'public.analytics_quota_lock_state(uuid)',
   'public.analytics_quota_mark_uncertain(uuid,text,integer,integer,text)',
   'public.analytics_quota_expire(uuid,integer,text)',
   'public.analytics_quota_forgiven_per_cycle()']
 LOOP
   ASSERT NOT has_function_privilege('service_role', f, 'EXECUTE'), 'service_role can bypass the lock via '||f;
 END LOOP;
 ASSERT has_function_privilege('service_role','public.reserve_analytics_quota(uuid,uuid,integer)','EXECUTE'), 'service_role cannot reserve';
 ASSERT has_function_privilege('service_role','public.commit_analytics_quota(uuid,uuid)','EXECUTE'), 'service_role cannot commit';
 ASSERT has_function_privilege('service_role','public.release_analytics_quota(uuid,uuid,text)','EXECUTE'), 'service_role cannot release';
 ASSERT (SELECT bool_and(prosecdef) FROM pg_proc WHERE proname IN ('reserve_analytics_quota','commit_analytics_quota','release_analytics_quota')), 'RPCs must be definer';
 ASSERT (SELECT bool_and(proconfig @> ARRAY['search_path=""']) FROM pg_proc WHERE proname LIKE 'analytics_quota_%' OR proname IN ('reserve_analytics_quota','commit_analytics_quota','release_analytics_quota')), 'empty search_path required';
END $$;

-- ── Fixtures ───────────────────────────────────────────────────────────────
DO $$
BEGIN
 INSERT INTO auth.users(id) VALUES
   ('00000000-0000-4000-8000-0000000000a1'),
   ('00000000-0000-4000-8000-0000000000a2'),
   ('00000000-0000-4000-8000-0000000000a3');
 INSERT INTO public.profiles(id, role, plan, has_permission, quota_reset_day, usage_count, usage_month,
                             monthly_analytics_limit_custom, monthly_analytics_limit) VALUES
   ('00000000-0000-4000-8000-0000000000a1','user','free',true,1,0,public.current_quota_cycle(1::smallint),true,3),
   ('00000000-0000-4000-8000-0000000000a2','admin','free',true,1,0,public.current_quota_cycle(1::smallint),false,NULL),
   ('00000000-0000-4000-8000-0000000000a3','user','free',true,1,0,public.current_quota_cycle(1::smallint),true,5);
END $$;

-- Role-level calls (anon / authenticated JWT through PostgREST) are exercised
-- over HTTP in scripts/db-quota-concurrency.ts. Not done here with SET ROLE:
-- on the local Supabase image (PG 17.6.1.121 with pgaudit/plpgsql_check
-- preloaded) a superuser session that SET ROLEs to authenticated and calls a
-- function it lacks EXECUTE on segfaults the backend — reproducible with
-- pre-existing functions too (e.g. sync_profile_usage_month), not via PostgREST.

-- ── State machine, K = 2 forgiveness, late commits ─────────────────────────
DO $$
DECLARE
 u uuid := '00000000-0000-4000-8000-0000000000a1';
 j jsonb; r1 uuid; r2 uuid; r3 uuid; r4 uuid; r5 uuid; k uuid := gen_random_uuid();
 usage int;
BEGIN
 j := public.reserve_analytics_quota(u, k);            ASSERT j->>'status'='reserved', j::text; r1 := (j->>'reservation_id')::uuid;
 j := public.reserve_analytics_quota(u, k);            ASSERT j->>'status'='duplicate' AND j->>'state'='reserved', 'dup key: '||j::text;
 j := public.reserve_analytics_quota(u, gen_random_uuid()); ASSERT j->>'status'='reserved'; r2 := (j->>'reservation_id')::uuid;
 j := public.reserve_analytics_quota(u, gen_random_uuid()); ASSERT j->>'status'='reserved'; r3 := (j->>'reservation_id')::uuid;
 j := public.reserve_analytics_quota(u, gen_random_uuid()); ASSERT j->>'status'='denied' AND (j->>'reserved')::int=3, '4th must be denied: '||j::text;

 j := public.commit_analytics_quota(u, r1);            ASSERT j->>'status'='committed' AND (j->>'charged')::boolean, j::text;
 j := public.commit_analytics_quota(u, r1);            ASSERT (j->>'replay')::boolean, 'commit replay: '||j::text;
 SELECT usage_count INTO usage FROM public.profiles WHERE id=u; ASSERT usage=1, 'double commit charged twice';

 j := public.release_analytics_quota(u, r2, 'pre_gemini');  ASSERT j->>'status'='refunded', j::text;
 j := public.release_analytics_quota(u, r2, 'pre_gemini');  ASSERT (j->>'replay')::boolean, 'double refund';
 j := public.commit_analytics_quota(u, r2);                 ASSERT j->>'status'='conflict', 'commit after refund: '||j::text;

 -- Uncertain #1 and #2 forgiven, #3 charged.
 j := public.release_analytics_quota(u, r3, 'uncertain');   ASSERT j->>'settlement'='forgiven', j::text;
 j := public.release_analytics_quota(u, r3, 'pre_gemini');  ASSERT j->>'status'='uncertain', 'refund after uncertain: '||j::text;
 j := public.reserve_analytics_quota(u, gen_random_uuid()); r4 := (j->>'reservation_id')::uuid;
 j := public.release_analytics_quota(u, r4, 'uncertain');   ASSERT j->>'settlement'='forgiven', j::text;
 j := public.reserve_analytics_quota(u, gen_random_uuid()); r5 := (j->>'reservation_id')::uuid;
 j := public.release_analytics_quota(u, r5, 'uncertain');   ASSERT j->>'settlement'='charged', 'third uncertain must charge: '||j::text;
 SELECT usage_count INTO usage FROM public.profiles WHERE id=u; ASSERT usage=2, 'usage after charged uncertain: '||usage;
 ASSERT (SELECT count(*) FROM public.analytics_quota_reservations WHERE user_id=u AND forgiven)=2, 'forgiven rows';

 -- Late commit of a charged uncertain row: no second charge.
 j := public.commit_analytics_quota(u, r5);                 ASSERT j->>'status'='committed' AND (j->>'charged')::boolean;
 SELECT usage_count INTO usage FROM public.profiles WHERE id=u; ASSERT usage=2, 'late commit double-charged';
 -- Late commit of a forgiven row: charged now, forgiveness slot freed.
 j := public.commit_analytics_quota(u, r3);                 ASSERT (j->>'charged')::boolean, j::text;
 SELECT usage_count INTO usage FROM public.profiles WHERE id=u; ASSERT usage=3, 'forgiven late commit not charged';
 ASSERT (SELECT count(*) FROM public.analytics_quota_reservations WHERE user_id=u AND forgiven)=1, 'slot not freed';

 j := public.reserve_analytics_quota(u, gen_random_uuid()); ASSERT j->>'status'='denied', 'limit 3 reached: '||j::text;
END $$;

-- ── TTL expiry is settled lazily by the next reserve ───────────────────────
DO $$
DECLARE u uuid := '00000000-0000-4000-8000-0000000000a3'; j jsonb; r uuid; st text;
BEGIN
 j := public.reserve_analytics_quota(u, gen_random_uuid(), 1); r := (j->>'reservation_id')::uuid;
 UPDATE public.analytics_quota_reservations SET expires_at = now() - interval '1 second' WHERE id = r;
 j := public.reserve_analytics_quota(u, gen_random_uuid());
 SELECT state INTO st FROM public.analytics_quota_reservations WHERE id = r;
 ASSERT st='uncertain', 'expired row not settled: '||st;
 ASSERT (SELECT outcome FROM public.analytics_quota_reservations WHERE id=r)='ttl_expired:forgiven', 'expiry outcome';
 -- Late completion after expiry still commits exactly once.
 j := public.commit_analytics_quota(u, r); ASSERT (j->>'charged')::boolean, j::text;
 j := public.commit_analytics_quota(u, r); ASSERT (j->>'replay')::boolean, j::text;
 ASSERT (SELECT usage_count FROM public.profiles WHERE id=u)=1, 'late completion charge';
END $$;

-- ── Limit lowered mid-flight: commit never exceeds the limit ───────────────
DO $$
DECLARE u uuid := '00000000-0000-4000-8000-0000000000a3'; j jsonb; r uuid;
BEGIN
 UPDATE public.profiles SET usage_count = 0, monthly_analytics_limit = 5 WHERE id = u;
 j := public.reserve_analytics_quota(u, gen_random_uuid()); r := (j->>'reservation_id')::uuid;
 UPDATE public.profiles SET monthly_analytics_limit = 0 WHERE id = u;
 j := public.commit_analytics_quota(u, r);
 ASSERT j->>'outcome'='over_limit_waived' AND NOT (j->>'charged')::boolean, j::text;
 ASSERT (SELECT usage_count FROM public.profiles WHERE id=u)=0, 'usage above lowered limit';
END $$;

-- ── Cycle rollover in flight ───────────────────────────────────────────────
DO $$
DECLARE u uuid := '00000000-0000-4000-8000-0000000000a3'; j jsonb; r uuid;
BEGIN
 DELETE FROM public.analytics_quota_reservations WHERE user_id = u;
 UPDATE public.profiles SET monthly_analytics_limit = 5, usage_count = 4 WHERE id = u;
 j := public.reserve_analytics_quota(u, gen_random_uuid()); r := (j->>'reservation_id')::uuid;
 -- Simulate the cycle having rolled over since the reservation was made.
 UPDATE public.profiles SET usage_month = '1999-01-01' WHERE id = u;
 UPDATE public.analytics_quota_reservations SET cycle = '1999-01-01' WHERE id = r;
 j := public.reserve_analytics_quota(u, gen_random_uuid());
 ASSERT j->>'status'='reserved' AND (j->>'used')::int=0 AND (j->>'reserved')::int=1, 'rollover must reset and ignore old rows: '||j::text;
 j := public.commit_analytics_quota(u, r);
 ASSERT j->>'outcome'='prior_cycle' AND NOT (j->>'charged')::boolean, j::text;
 ASSERT (SELECT usage_count FROM public.profiles WHERE id=u)=0, 'prior-cycle commit charged new cycle';
END $$;

-- ── Plan expiry (downgrade) in flight ──────────────────────────────────────
DO $$
DECLARE u uuid := '00000000-0000-4000-8000-0000000000a3'; j jsonb; r uuid;
BEGIN
 DELETE FROM public.analytics_quota_reservations WHERE user_id = u;
 UPDATE public.profiles SET plan='pro', plan_expires_at = now() + interval '1 day', usage_count = 7,
        monthly_analytics_limit_custom = false, monthly_analytics_limit = NULL WHERE id = u;
 j := public.reserve_analytics_quota(u, gen_random_uuid()); r := (j->>'reservation_id')::uuid;
 ASSERT j->>'status'='reserved' AND (j->>'limit')::int=100, 'pro limit unchanged: '||j::text;
 UPDATE public.profiles SET plan_expires_at = now() - interval '1 second' WHERE id = u;
 j := public.commit_analytics_quota(u, r);
 ASSERT (j->>'charged')::boolean, 'commit after downgrade: '||j::text;
 ASSERT (SELECT plan FROM public.profiles WHERE id=u)='free', 'expired plan not demoted';
 ASSERT (SELECT usage_count FROM public.profiles WHERE id=u)=1, 'downgrade must reset then charge once';
END $$;

-- ── Admin is unlimited, still metered ──────────────────────────────────────
DO $$
DECLARE u uuid := '00000000-0000-4000-8000-0000000000a2'; j jsonb; i int;
BEGIN
 FOR i IN 1..12 LOOP
   j := public.reserve_analytics_quota(u, gen_random_uuid());
   ASSERT j->>'status'='reserved', 'admin denied: '||j::text;
   PERFORM public.commit_analytics_quota(u, (j->>'reservation_id')::uuid);
 END LOOP;
 ASSERT (SELECT usage_count FROM public.profiles WHERE id=u)=12, 'admin usage not metered';
END $$;

-- ── Input validation and ownership ─────────────────────────────────────────
DO $$
DECLARE j jsonb; r uuid;
BEGIN
 BEGIN PERFORM public.reserve_analytics_quota('00000000-0000-4000-8000-0000000000a3', gen_random_uuid(), 0);
   RAISE EXCEPTION 'ttl 0 accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.release_analytics_quota('00000000-0000-4000-8000-0000000000a3', gen_random_uuid(), 'bogus');
   RAISE EXCEPTION 'bad outcome accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 j := public.reserve_analytics_quota('00000000-0000-4000-8000-0000000000a3', gen_random_uuid()); r := (j->>'reservation_id')::uuid;
 j := public.commit_analytics_quota('00000000-0000-4000-8000-0000000000a1', r);
 ASSERT j->>'status'='not_found', 'another user committed the reservation: '||j::text;
 j := public.reserve_analytics_quota('00000000-0000-4000-8000-00000000ffff', gen_random_uuid());
 ASSERT j->>'status'='unavailable', 'missing profile must be unavailable: '||j::text;
 BEGIN UPDATE public.analytics_quota_reservations SET forgiven = true WHERE id = r;
   RAISE EXCEPTION 'forgiven reserved row accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
END $$;

-- ── Invariant: committed usage never negative or above limit ───────────────
DO $$
BEGIN
 ASSERT NOT EXISTS (
   SELECT 1 FROM public.profiles p
    WHERE p.id IN ('00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000a3')
      AND (p.usage_count < 0 OR p.usage_count > public.resolve_monthly_analytics_limit(
            public.effective_plan_from_row(p.plan, p.plan_expires_at), p.monthly_analytics_limit_custom, p.monthly_analytics_limit))
 ), 'usage invariant violated';
END $$;

SELECT 'analytics_quota_reservations.test.sql: all assertions passed' AS result;
ROLLBACK;
