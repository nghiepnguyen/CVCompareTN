-- M2-Q Phase 2C: commit_analytics_quota_and_save_candidate (migration
-- 20261118000000). Disposable DB only; fixtures roll back. Single-session
-- decision table: commit rules are exactly commit_analytics_quota's, the save
-- is exactly the M2-D3 fence, and a save failure never undoes the charge.
-- Real-handler fault injection (lost responses, late commits, two tabs):
-- src/__tests__/db/m2q2cAtomicSettlement.db.test.ts.
BEGIN;

CREATE FUNCTION pg_temp.as_user(u uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, true);
 PERFORM set_config('request.jwt.claim.sub', u::text, true);
 PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
END $$;

-- ── Permissions / definer settings ─────────────────────────────────────────
DO $$
DECLARE f text := 'public.commit_analytics_quota_and_save_candidate(uuid,uuid,uuid,uuid,jsonb,numeric)';
BEGIN
 ASSERT has_function_privilege('service_role', f, 'EXECUTE'), 'service_role must execute';
 ASSERT NOT has_function_privilege('authenticated', f, 'EXECUTE'), 'authenticated can execute';
 ASSERT NOT has_function_privilege('anon', f, 'EXECUTE'), 'anon can execute';
 ASSERT NOT EXISTS (SELECT 1 FROM information_schema.role_routine_grants
                     WHERE routine_name = 'commit_analytics_quota_and_save_candidate' AND grantee = 'PUBLIC'), 'PUBLIC grant';
 ASSERT (SELECT prosecdef FROM pg_proc WHERE oid = f::regprocedure), 'must be SECURITY DEFINER';
 ASSERT (SELECT proconfig @> ARRAY['search_path=""'] FROM pg_proc WHERE oid = f::regprocedure), 'search_path must be empty';
 ASSERT (SELECT count(*) FROM pg_proc WHERE proname = 'commit_analytics_quota_and_save_candidate') = 1, 'one overload (no PostgREST ambiguity)';
 -- Building blocks keep their grants (personal path, app rollback).
 ASSERT has_function_privilege('service_role', 'public.commit_analytics_quota(uuid,uuid)', 'EXECUTE'), 'commit grant changed';
 ASSERT NOT has_function_privilege('authenticated', 'public.commit_analytics_quota(uuid,uuid)', 'EXECUTE'), 'commit exposed';
 ASSERT has_function_privilege('service_role', 'public.save_candidate_analysis_attempt(uuid,uuid,uuid,jsonb,integer)', 'EXECUTE'), 'save grant changed';
 ASSERT NOT has_function_privilege('authenticated', 'public.save_candidate_analysis_attempt(uuid,uuid,uuid,jsonb,integer)', 'EXECUTE'), 'save exposed';
 -- The new RPC must not delete ledger rows (also enforced by m2q_quota_safety S1).
 ASSERT (SELECT prosrc !~* 'delete' FROM pg_proc WHERE oid = f::regprocedure), 'RPC deletes';
END $$;

-- ── Decision table ────────────────────────────────────────────────────────
DO $$
DECLARE
 u uuid := gen_random_uuid();
 other uuid := gen_random_uuid();
 cyc text;
 k uuid; ko uuid;
 cand uuid[] := ARRAY[]::uuid[];
 oc uuid;
 c uuid; a uuid; a2 uuid; res uuid;
 r jsonb;
 n int;
 usage0 int;
 t timestamptz;
 i int;
 res_for jsonb := '{"matchScore":70,"scoreVersion":"v"}';

 -- claim → reserve for candidate i; returns reservation id, sets a (attempt)
BEGIN
 INSERT INTO auth.users(id) VALUES (u), (other);
 cyc := public.current_quota_cycle(1::smallint);
 INSERT INTO public.profiles(id,email,plan,role,has_permission,quota_reset_day,usage_count,usage_month,monthly_analytics_limit_custom,monthly_analytics_limit) VALUES
  (u,'m2q2c@example.test','recruiter','user',true,1,0,cyc,true,100),
  (other,'m2q2co@example.test','recruiter','user',true,1,0,cyc,true,100);
 PERFORM pg_temp.as_user(u);
 INSERT INTO public.recruitment_campaigns(user_id,title,jd_title,jd_content) VALUES (u,'t','t','jd') RETURNING id INTO k;
 FOR i IN 1..12 LOOP
   INSERT INTO public.candidate_cvs(campaign_id,candidate_name,file_name,file_path,file_size)
   VALUES (k,'c'||i,'c.txt',u::text||'/campaigns/x/'||i||'.txt',1) RETURNING id INTO c;
   cand := cand || c;
 END LOOP;
 PERFORM pg_temp.as_user(other);
 INSERT INTO public.recruitment_campaigns(user_id,title,jd_title,jd_content) VALUES (other,'o','o','jd') RETURNING id INTO ko;
 INSERT INTO public.candidate_cvs(campaign_id,candidate_name,file_name,file_path,file_size)
 VALUES (ko,'o','o.txt',other::text||'/campaigns/x/o.txt',1) RETURNING id INTO oc;
 PERFORM pg_temp.as_user(u);

 -- 1. Normal: one call charges once and saves under the attempt.
 a := gen_random_uuid();
 r := public.claim_candidate_analysis(cand[1], a, false); ASSERT r->>'result' = 'claimed', '1 claim '||r::text;
 res := (public.reserve_analytics_quota(u, a)->>'reservation_id')::uuid;
 r := public.commit_analytics_quota_and_save_candidate(u, res, cand[1], a, res_for, 70);
 ASSERT r->>'status' = 'committed' AND (r->>'charged')::boolean AND r->>'save' = 'saved' AND NOT (r->>'save_replay')::boolean, '1 '||r::text;
 ASSERT (SELECT usage_count FROM public.profiles WHERE id=u) = 1, '1 usage';
 ASSERT (SELECT status='done' AND match_score=70 AND analysis_attempt_id=a AND analysis_result=res_for FROM public.candidate_cvs WHERE id=cand[1]), '1 row';
 ASSERT (SELECT state='committed' AND charged FROM public.analytics_quota_reservations WHERE id=res), '1 ledger';
 ASSERT (SELECT analyzed_count FROM public.recruitment_campaigns WHERE id=k) = 1, '1 counters';

 -- 2. Replay of the same call (lost response): no second charge, no rewrite.
 SELECT analyzed_at INTO t FROM public.candidate_cvs WHERE id=cand[1];
 FOR i IN 1..3 LOOP
   r := public.commit_analytics_quota_and_save_candidate(u, res, cand[1], a, '{"matchScore":1}', 1);
   ASSERT r->>'status' = 'committed' AND (r->>'replay')::boolean AND r->>'save' = 'saved' AND (r->>'save_replay')::boolean, '2 replay '||r::text;
 END LOOP;
 ASSERT (SELECT usage_count FROM public.profiles WHERE id=u) = 1, '2 charged twice';
 ASSERT (SELECT analyzed_at = t AND match_score = 70 AND analysis_result = res_for FROM public.candidate_cvs WHERE id=cand[1]), '2 replay rewrote the row';

 -- 3. Decimal score: integer column rounded, exact value kept in the JSON.
 a := gen_random_uuid();
 PERFORM public.claim_candidate_analysis(cand[2], a, false);
 res := (public.reserve_analytics_quota(u, a)->>'reservation_id')::uuid;
 r := public.commit_analytics_quota_and_save_candidate(u, res, cand[2], a, '{"matchScore":72.5}', 72.5);
 ASSERT r->>'save' = 'saved', '3 '||r::text;
 ASSERT (SELECT match_score = 73 AND (analysis_result->>'matchScore')::numeric = 72.5 FROM public.candidate_cvs WHERE id=cand[2]), '3 decimal';

 -- 4. Save error (score out of range) rolls back only the save: charge kept.
 a := gen_random_uuid();
 PERFORM public.claim_candidate_analysis(cand[3], a, false);
 res := (public.reserve_analytics_quota(u, a)->>'reservation_id')::uuid;
 SELECT usage_count INTO usage0 FROM public.profiles WHERE id=u;
 r := public.commit_analytics_quota_and_save_candidate(u, res, cand[3], a, '{"matchScore":150}', 150);
 ASSERT r->>'status' = 'committed' AND (r->>'charged')::boolean AND r->>'save' = 'failed' AND r->>'save_error' = '22023', '4 '||r::text;
 ASSERT (SELECT usage_count FROM public.profiles WHERE id=u) = usage0 + 1, '4 charge lost';
 ASSERT (SELECT state FROM public.analytics_quota_reservations WHERE id=res) = 'committed', '4 ledger';
 ASSERT (SELECT status='analyzing' AND analysis_result IS NULL FROM public.candidate_cvs WHERE id=cand[3]), '4 partial save';
 -- the browser fallback (same attempt) can still save it afterwards
 r := public.save_candidate_analysis_attempt(u, cand[3], a, '{"matchScore":90}', 90);
 ASSERT r->>'result' = 'saved', '4 fallback '||r::text;
 -- NaN / NULL scores are save errors too, never a rolled-back charge
 a := gen_random_uuid();
 PERFORM public.claim_candidate_analysis(cand[4], a, false);
 res := (public.reserve_analytics_quota(u, a)->>'reservation_id')::uuid;
 r := public.commit_analytics_quota_and_save_candidate(u, res, cand[4], a, '{}', 'NaN');
 ASSERT r->>'status' = 'committed' AND r->>'save' = 'failed', '4 NaN '||r::text;

 -- 5. Cross-account: u's reservation, other's candidate → u charged (Gemini ran),
 --    other's row untouched, save refused (42501).
 PERFORM pg_temp.as_user(other);
 a2 := gen_random_uuid();
 PERFORM public.claim_candidate_analysis(oc, a2, false);
 PERFORM pg_temp.as_user(u);
 a := gen_random_uuid();
 res := (public.reserve_analytics_quota(u, a)->>'reservation_id')::uuid;
 r := public.commit_analytics_quota_and_save_candidate(u, res, oc, a2, '{"matchScore":1}', 1);
 ASSERT r->>'status' = 'committed' AND r->>'save' = 'failed' AND r->>'save_error' = '42501', '5 '||r::text;
 ASSERT (SELECT status='analyzing' AND analysis_result IS NULL AND analysis_attempt_id=a2 FROM public.candidate_cvs WHERE id=oc), '5 other row written';
 ASSERT (SELECT usage_count FROM public.profiles WHERE id=other) = 0, '5 other charged';
 -- other's reservation cannot be committed through u
 res := (public.reserve_analytics_quota(other, a2)->>'reservation_id')::uuid;
 r := public.commit_analytics_quota_and_save_candidate(u, res, oc, a2, '{"matchScore":1}', 1);
 ASSERT r->>'status' = 'not_found' AND r->>'save' = 'skipped', '5 cross reservation '||r::text;
 ASSERT (SELECT state FROM public.analytics_quota_reservations WHERE id=res) = 'reserved', '5 other ledger touched';

 -- 6. Stale attempt: a newer attempt owns the row → charged, not_owner, newer untouched;
 --    newer attempt already done → superseded.
 a := gen_random_uuid();
 PERFORM public.claim_candidate_analysis(cand[5], a, false);
 res := (public.reserve_analytics_quota(u, a)->>'reservation_id')::uuid;
 a2 := gen_random_uuid();
 UPDATE public.candidate_cvs SET analysis_attempt_id = a2 WHERE id = cand[5];
 r := public.commit_analytics_quota_and_save_candidate(u, res, cand[5], a, '{"matchScore":1}', 1);
 ASSERT r->>'status' = 'committed' AND (r->>'charged')::boolean AND r->>'save' = 'not_owner', '6 '||r::text;
 ASSERT (SELECT analysis_attempt_id = a2 AND status = 'analyzing' AND analysis_result IS NULL FROM public.candidate_cvs WHERE id=cand[5]), '6 newer overwritten';
 r := public.save_candidate_analysis_attempt(u, cand[5], a2, '{"matchScore":88}', 88);
 a := gen_random_uuid();
 UPDATE public.candidate_cvs SET analysis_attempt_id = a2 WHERE id = cand[5]; -- no-op, row done under a2
 res := (public.reserve_analytics_quota(u, a)->>'reservation_id')::uuid;
 r := public.commit_analytics_quota_and_save_candidate(u, res, cand[5], a, '{"matchScore":1}', 1);
 ASSERT r->>'save' = 'superseded', '6 superseded '||r::text;
 ASSERT (SELECT match_score FROM public.candidate_cvs WHERE id=cand[5]) = 88, '6 done row overwritten';

 -- 7. Not committed → no save at all: refunded reservation (conflict).
 a := gen_random_uuid();
 PERFORM public.claim_candidate_analysis(cand[6], a, false);
 res := (public.reserve_analytics_quota(u, a)->>'reservation_id')::uuid;
 PERFORM public.release_analytics_quota(u, res, 'provider_error');
 SELECT usage_count INTO usage0 FROM public.profiles WHERE id=u;
 r := public.commit_analytics_quota_and_save_candidate(u, res, cand[6], a, '{"matchScore":1}', 1);
 ASSERT r->>'status' = 'conflict' AND r->>'save' = 'skipped', '7 '||r::text;
 ASSERT (SELECT status = 'analyzing' AND analysis_result IS NULL FROM public.candidate_cvs WHERE id=cand[6]), '7 saved without commit';
 ASSERT (SELECT usage_count FROM public.profiles WHERE id=u) = usage0, '7 charged';

 -- 8. NULL attempt never reaches the legacy NULL-attempt fence; charge kept.
 UPDATE public.candidate_cvs SET status='analyzing', analysis_attempt_id=NULL WHERE id=cand[7];
 a := gen_random_uuid();
 res := (public.reserve_analytics_quota(u, a)->>'reservation_id')::uuid;
 r := public.commit_analytics_quota_and_save_candidate(u, res, cand[7], NULL, '{"matchScore":1}', 1);
 ASSERT r->>'status' = 'committed' AND r->>'save' = 'failed' AND r->>'save_error' = '22023', '8 '||r::text;
 ASSERT (SELECT analysis_result IS NULL FROM public.candidate_cvs WHERE id=cand[7]), '8 legacy row written';

 -- 9. Invalid commit arguments raise before any lock or write (whole call).
 SELECT usage_count INTO usage0 FROM public.profiles WHERE id=u;
 BEGIN PERFORM public.commit_analytics_quota_and_save_candidate(u, NULL, cand[8], gen_random_uuid(), '{}', 1); ASSERT false, '9 accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 ASSERT (SELECT usage_count FROM public.profiles WHERE id=u) = usage0, '9 charged';

 -- 10. Lease/TTL expired while running: expiry settled it uncertain/forgiven,
 --     the late call charges once (existing late_commit rule) and saves.
 a := gen_random_uuid();
 PERFORM public.claim_candidate_analysis(cand[9], a, false);
 res := (public.reserve_analytics_quota(u, a)->>'reservation_id')::uuid;
 UPDATE public.analytics_quota_reservations SET expires_at = now() - interval '1 second' WHERE id = res;
 UPDATE public.candidate_cvs SET analysis_started_at = now() - interval '20 minutes' WHERE id = cand[9];
 PERFORM public.reserve_analytics_quota(u, gen_random_uuid()); -- user's own next RPC settles expiry
 ASSERT (SELECT state='uncertain' AND forgiven FROM public.analytics_quota_reservations WHERE id=res), '10 expiry';
 SELECT usage_count INTO usage0 FROM public.profiles WHERE id=u;
 r := public.commit_analytics_quota_and_save_candidate(u, res, cand[9], a, '{"matchScore":60}', 60);
 ASSERT r->>'status' = 'committed' AND (r->>'charged')::boolean AND r->>'save' = 'saved', '10 '||r::text;
 ASSERT (SELECT outcome FROM public.analytics_quota_reservations WHERE id=res) = 'late_commit', '10 outcome';
 ASSERT (SELECT usage_count FROM public.profiles WHERE id=u) = usage0 + 1, '10 usage';

 -- 11. Over the limit at commit time: existing over_limit_waived rule (no charge), result saved.
 a := gen_random_uuid();
 PERFORM public.claim_candidate_analysis(cand[10], a, false);
 res := (public.reserve_analytics_quota(u, a)->>'reservation_id')::uuid;
 UPDATE public.profiles SET monthly_analytics_limit = usage_count WHERE id = u;
 SELECT usage_count INTO usage0 FROM public.profiles WHERE id=u;
 r := public.commit_analytics_quota_and_save_candidate(u, res, cand[10], a, '{"matchScore":61}', 61);
 ASSERT r->>'status' = 'committed' AND NOT (r->>'charged')::boolean AND r->>'outcome' = 'over_limit_waived' AND r->>'save' = 'saved', '11 '||r::text;
 ASSERT (SELECT usage_count FROM public.profiles WHERE id=u) = usage0, '11 charged over limit';

 -- 12. Ledger evidence: every reservation made here still exists.
 SELECT count(*) INTO n FROM public.analytics_quota_reservations WHERE user_id = u;
 ASSERT n >= 10, '12 ledger rows lost: '||n;
END $$;

ROLLBACK;
\echo 'commit_and_save_candidate: PASS'
