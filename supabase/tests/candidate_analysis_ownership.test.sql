-- Disposable DB only; migrations through 20261117000000. Fixtures roll back.
-- Single-session semantics of M2-D3 claim / fenced save. Parallel claims are
-- covered by scripts/db-candidate-claim-concurrency.ts (real PostgREST calls).
-- No SET ROLE as postgres (supautils segfault, see M2-C2A preflight §3): JWT
-- claims are set via config; the RPCs are definer and read auth.uid().
BEGIN;

CREATE FUNCTION pg_temp.as_user(u uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, true);
 PERFORM set_config('request.jwt.claim.sub', u::text, true);
 PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
END $$;

-- ── Permissions / definer settings ─────────────────────────────────────────
DO $$
BEGIN
 ASSERT has_function_privilege('authenticated', 'public.claim_candidate_analysis(uuid,uuid,boolean)', 'EXECUTE'), 'authenticated must claim';
 ASSERT NOT has_function_privilege('anon', 'public.claim_candidate_analysis(uuid,uuid,boolean)', 'EXECUTE'), 'anon can claim';
 ASSERT NOT has_function_privilege('service_role', 'public.claim_candidate_analysis(uuid,uuid,boolean)', 'EXECUTE'), 'service_role can claim (no auth.uid)';
 ASSERT has_function_privilege('service_role', 'public.save_candidate_analysis_attempt(uuid,uuid,uuid,jsonb,integer)', 'EXECUTE'), 'service_role must save';
 ASSERT NOT has_function_privilege('authenticated', 'public.save_candidate_analysis_attempt(uuid,uuid,uuid,jsonb,integer)', 'EXECUTE'), 'authenticated can save directly';
 ASSERT NOT has_function_privilege('anon', 'public.save_candidate_analysis_attempt(uuid,uuid,uuid,jsonb,integer)', 'EXECUTE'), 'anon can save';
 ASSERT NOT has_function_privilege('authenticated', 'public.candidate_analysis_lease_seconds()', 'EXECUTE'), 'helper exposed';
 ASSERT (SELECT bool_and(prosecdef) FROM pg_proc WHERE proname IN ('claim_candidate_analysis','save_candidate_analysis_attempt')), 'RPCs must be definer';
 ASSERT (SELECT bool_and(proconfig @> ARRAY['search_path=""']) FROM pg_proc WHERE proname IN ('claim_candidate_analysis','save_candidate_analysis_attempt','candidate_analysis_lease_seconds')), 'search_path must be empty';
 -- Legacy save stays for the deployed app; exactly one overload per name (no PostgREST ambiguity).
 ASSERT (SELECT count(*) FROM pg_proc WHERE proname='save_candidate_analysis_attempt') = 1, 'one fenced save overload';
 ASSERT to_regprocedure('public.save_candidate_analysis(uuid,uuid,jsonb,integer,text)') IS NOT NULL, 'legacy 5-arg save removed';
 ASSERT (SELECT is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='candidate_cvs' AND column_name='analysis_started_at') = 'YES', 'started_at nullable';
 ASSERT (SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='candidate_cvs' AND column_name='analysis_attempt_id') = 'uuid', 'attempt id uuid';
END $$;

-- ── Decision table ────────────────────────────────────────────────────────
DO $$
DECLARE
 u uuid := gen_random_uuid();
 other uuid := gen_random_uuid();
 k uuid;
 c uuid;
 a1 uuid; a2 uuid;
 r jsonb;
 usage_before int; ledger_before int;
 cand uuid[] := ARRAY[]::uuid[];
 i int;
 ts timestamptz;
BEGIN
 INSERT INTO auth.users(id) VALUES (u), (other);
 INSERT INTO public.profiles(id,email,plan,role,has_permission) VALUES
  (u,'m2d3@example.test','recruiter','user',true), (other,'m2d3o@example.test','recruiter','user',true);
 PERFORM pg_temp.as_user(u);
 INSERT INTO public.recruitment_campaigns(user_id,title,jd_title,jd_content) VALUES (u,'t','t','jd') RETURNING id INTO k;
 FOR i IN 1..12 LOOP
   INSERT INTO public.candidate_cvs(campaign_id,candidate_name,file_name,file_path,file_size)
   VALUES (k,'c'||i,'c.txt',u::text||'/campaigns/x/'||i||'.txt',1) RETURNING id INTO c;
   cand := cand || c;
 END LOOP;
 SELECT usage_count INTO usage_before FROM public.profiles WHERE id=u;
 SELECT count(*) INTO ledger_before FROM public.analytics_quota_reservations WHERE user_id=u;

 -- 1. pending → claimed; second claim (other tab) → active; started_at set by server.
 a1 := gen_random_uuid();
 r := public.claim_candidate_analysis(cand[1], a1, false);
 ASSERT r->>'result' = 'claimed', '1 claim: '||r;
 ASSERT (SELECT analysis_attempt_id = a1 AND analysis_started_at IS NOT NULL AND status='analyzing' FROM public.candidate_cvs WHERE id=cand[1]), '1 row state';
 r := public.claim_candidate_analysis(cand[1], gen_random_uuid(), true);
 ASSERT r->>'result' = 'active', '1 fresh claim is active even with confirm: '||r;
 -- reusing the owner token is rejected
 BEGIN PERFORM public.claim_candidate_analysis(cand[1], a1, false); ASSERT false, 'reuse accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;

 -- 2. stale, no ledger row (never reached reservation → Gemini never ran) → auto claim.
 UPDATE public.candidate_cvs SET analysis_started_at = now() - interval '11 minutes' WHERE id=cand[1];
 a2 := gen_random_uuid();
 r := public.claim_candidate_analysis(cand[1], a2, false);
 ASSERT r->>'result' = 'claimed' AND r->>'recovered' IS NULL, '2 stale pre-dispatch: '||r;

 -- 3. stale, ledger committed (Gemini delivered, save failed / response lost) → needs_confirm(paid_result_lost).
 a1 := gen_random_uuid();
 UPDATE public.candidate_cvs SET status='analyzing', analysis_attempt_id=a1, analysis_started_at=now()-interval '20 minutes' WHERE id=cand[2];
 INSERT INTO public.analytics_quota_reservations(user_id,request_key,cycle,state,charged,expires_at,settled_at) VALUES (u,a1,'x','committed',true,now(),now());
 r := public.claim_candidate_analysis(cand[2], gen_random_uuid(), false);
 ASSERT r->>'result' = 'needs_confirm' AND r->>'reason' = 'paid_result_lost', '3: '||r;
 ASSERT (SELECT analysis_attempt_id = a1 FROM public.candidate_cvs WHERE id=cand[2]), '3 unconfirmed claim must not touch the row';
 r := public.claim_candidate_analysis(cand[2], gen_random_uuid(), true);
 ASSERT r->>'result' = 'claimed' AND r->>'recovered' = 'paid_result_lost', '3 confirmed: '||r;

 -- 4. error row (client timeout) whose attempt the server committed → same (lost response).
 a1 := gen_random_uuid();
 UPDATE public.candidate_cvs SET status='error', error_message='timeout', analysis_attempt_id=a1, analysis_started_at=now()-interval '1 minute' WHERE id=cand[3];
 INSERT INTO public.analytics_quota_reservations(user_id,request_key,cycle,state,charged,expires_at,settled_at) VALUES (u,a1,'x','committed',true,now(),now());
 r := public.claim_candidate_analysis(cand[3], gen_random_uuid(), false);
 ASSERT r->>'result' = 'needs_confirm' AND r->>'reason' = 'paid_result_lost', '4: '||r;

 -- 5. uncertain → outcome_unknown.
 a1 := gen_random_uuid();
 UPDATE public.candidate_cvs SET status='analyzing', analysis_attempt_id=a1, analysis_started_at=now()-interval '20 minutes' WHERE id=cand[4];
 INSERT INTO public.analytics_quota_reservations(user_id,request_key,cycle,state,expires_at,settled_at,forgiven) VALUES (u,a1,'x','uncertain',now(),now(),true);
 r := public.claim_candidate_analysis(cand[4], gen_random_uuid(), false);
 ASSERT r->>'result' = 'needs_confirm' AND r->>'reason' = 'outcome_unknown', '5: '||r;

 -- 6. reserved, expired (server died mid-flight) → outcome_unknown; reserved live → active.
 a1 := gen_random_uuid();
 UPDATE public.candidate_cvs SET status='analyzing', analysis_attempt_id=a1, analysis_started_at=now()-interval '20 minutes' WHERE id=cand[5];
 INSERT INTO public.analytics_quota_reservations(user_id,request_key,cycle,expires_at) VALUES (u,a1,'x',now()-interval '1 minute');
 r := public.claim_candidate_analysis(cand[5], gen_random_uuid(), false);
 ASSERT r->>'result' = 'needs_confirm' AND r->>'reason' = 'outcome_unknown', '6 expired reserved: '||r;
 a1 := gen_random_uuid();
 UPDATE public.candidate_cvs SET status='analyzing', analysis_attempt_id=a1, analysis_started_at=now()-interval '20 minutes' WHERE id=cand[6];
 INSERT INTO public.analytics_quota_reservations(user_id,request_key,cycle,expires_at) VALUES (u,a1,'x',now()+interval '5 minutes');
 r := public.claim_candidate_analysis(cand[6], gen_random_uuid(), true);
 ASSERT r->>'result' = 'active', '6 live reservation even with confirm: '||r;

 -- 7. refunded → auto claim (nothing charged, no result can exist).
 a1 := gen_random_uuid();
 UPDATE public.candidate_cvs SET status='error', analysis_attempt_id=a1, analysis_started_at=now() WHERE id=cand[7];
 INSERT INTO public.analytics_quota_reservations(user_id,request_key,cycle,state,expires_at,settled_at,outcome) VALUES (u,a1,'x','refunded',now(),now(),'provider_error');
 r := public.claim_candidate_analysis(cand[7], gen_random_uuid(), false);
 ASSERT r->>'result' = 'claimed', '7 refunded: '||r;

 -- 8. legacy rows (pre-migration): analyzing w/o attempt → outcome_unknown; error w/o attempt → claim (M2-D2 status quo).
 UPDATE public.candidate_cvs SET status='analyzing' WHERE id=cand[8];
 r := public.claim_candidate_analysis(cand[8], gen_random_uuid(), false);
 ASSERT r->>'result' = 'needs_confirm' AND r->>'reason' = 'outcome_unknown', '8 legacy analyzing: '||r;
 UPDATE public.candidate_cvs SET status='error', error_message='old' WHERE id=cand[9];
 r := public.claim_candidate_analysis(cand[9], gen_random_uuid(), false);
 ASSERT r->>'result' = 'claimed', '8 legacy error: '||r;
 ASSERT (SELECT error_message IS NULL FROM public.candidate_cvs WHERE id=cand[9]), 'claim clears error_message';

 -- 9. done → done; another user's candidate → not_found.
 UPDATE public.candidate_cvs SET status='done' WHERE id=cand[10];
 ASSERT public.claim_candidate_analysis(cand[10], gen_random_uuid(), true)->>'result' = 'done', '9 done';
 PERFORM pg_temp.as_user(other);
 ASSERT public.claim_candidate_analysis(cand[11], gen_random_uuid(), true)->>'result' = 'not_found', '9 foreign';
 PERFORM pg_temp.as_user(u);

 -- 10. Strict fenced save. A claims, lease expires, B claims; A must never write.
 a1 := gen_random_uuid(); a2 := gen_random_uuid();
 PERFORM public.claim_candidate_analysis(cand[12], a1, false);
 UPDATE public.candidate_cvs SET analysis_started_at = now()-interval '11 minutes' WHERE id=cand[12];
 ASSERT public.claim_candidate_analysis(cand[12], a2, false)->>'result' = 'claimed', '10 B claims';
 r := public.save_candidate_analysis_attempt(u, cand[12], a1, '{"matchScore":40}', 40);
 ASSERT r->>'result' = 'not_owner', '10 A rejected while B analyzing: '||r;
 ASSERT (SELECT status='analyzing' AND analysis_attempt_id=a2 AND analysis_result IS NULL AND match_score IS NULL AND analyzed_at IS NULL
           FROM public.candidate_cvs WHERE id=cand[12]), '10 row unchanged by A';
 r := public.save_candidate_analysis_attempt(u, cand[12], a2, '{"matchScore":90}', 90);
 ASSERT r->>'result' = 'saved' AND NOT (r->>'replay')::boolean, '10 B saves: '||r;
 r := public.save_candidate_analysis_attempt(u, cand[12], a1, '{"matchScore":40}', 40);
 ASSERT r->>'result' = 'superseded', '10 A retry after B done: '||r;
 SELECT analyzed_at INTO ts FROM public.candidate_cvs WHERE id=cand[12];
 -- Same attempt replayed (lost save confirmation) → accepted, no write.
 r := public.save_candidate_analysis_attempt(u, cand[12], a2, '{"matchScore":11}', 11);
 ASSERT r->>'result' = 'saved' AND (r->>'replay')::boolean, '10 replay: '||r;
 ASSERT (SELECT match_score = 90 AND analysis_attempt_id = a2 AND analyzed_at = ts FROM public.candidate_cvs WHERE id=cand[12]), '10 replay wrote';
 ASSERT (SELECT analyzed_count FROM public.recruitment_campaigns WHERE id=k) = 2, '10 counters (cand10 manual done + cand12)';
 -- Wrong user → 42501, nothing written.
 BEGIN PERFORM public.save_candidate_analysis_attempt(other, cand[1], a2, '{}', 1); ASSERT false, 'foreign save';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 -- Unclaimed attempt on a pending row; NULL (legacy) on pending; any save on a released (error) row.
 ASSERT public.save_candidate_analysis_attempt(u, cand[11], gen_random_uuid(), '{}', 1)->>'result' = 'not_owner', '10 unclaimed attempt';
 ASSERT public.save_candidate_analysis_attempt(u, cand[11], NULL, '{}', 1)->>'result' = 'not_owner', '10 legacy on pending';
 ASSERT (SELECT status='pending' AND analysis_result IS NULL FROM public.candidate_cvs WHERE id=cand[11]), '10 pending untouched';
 a1 := (SELECT analysis_attempt_id FROM public.candidate_cvs WHERE id=cand[9]);   -- claimed in case 8
 UPDATE public.candidate_cvs SET status='error' WHERE id=cand[9];
 ASSERT public.save_candidate_analysis_attempt(u, cand[9], a1, '{}', 1)->>'result' = 'not_owner', '10 released row';
 -- Legacy client (NULL attempt) on a row no claim ever owned → allowed; on a claimed row → rejected.
 ASSERT public.save_candidate_analysis_attempt(u, cand[8], NULL, '{"matchScore":55}', 55)->>'result' = 'saved', '10 legacy null-attempt row';
 ASSERT public.save_candidate_analysis_attempt(u, cand[7], NULL, '{}', 1)->>'result' = 'not_owner', '10 legacy on claimed row';

 -- 11. Fenced release: a stale worker cannot flip another attempt's row.
 UPDATE public.candidate_cvs SET status='error', error_message='late'
  WHERE id=cand[12] AND analysis_attempt_id=a2 AND status='analyzing';
 GET DIAGNOSTICS i = ROW_COUNT;
 ASSERT i = 0, '11 stale release no-op';
 ASSERT (SELECT status FROM public.candidate_cvs WHERE id=cand[12]) = 'done', '11 still done';
 ASSERT (SELECT parsed_text IS NULL FROM public.candidate_cvs WHERE id=cand[12]), 'parsed_text untouched';

 -- 12. No quota effect: claims and saves never touch usage_count or create ledger rows.
 ASSERT (SELECT usage_count FROM public.profiles WHERE id=u) = usage_before, '12 usage changed';
 ASSERT (SELECT count(*) FROM public.analytics_quota_reservations WHERE user_id=u) = ledger_before + 6, '12 only seeded ledger rows';
END $$;

SELECT 'candidate_analysis_ownership.test.sql: all assertions passed' AS result;
ROLLBACK;
