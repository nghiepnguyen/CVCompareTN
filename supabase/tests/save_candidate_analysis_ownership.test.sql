-- Run against a disposable database after migration 20261101010000; rolls back fixtures.
-- P1-1: save_candidate_analysis must only write candidates in campaigns owned by p_user_id.
BEGIN;
DO $$
DECLARE
 owner_id uuid:=gen_random_uuid(); attacker uuid:=gen_random_uuid();
 camp uuid:=gen_random_uuid(); cand uuid:=gen_random_uuid();
 c public.candidate_cvs; n integer; ok boolean;
BEGIN
 PERFORM set_config('request.jwt.claim.role','service_role',true); -- bypass storage_protect_metadata on fixtures
 INSERT INTO auth.users(id) VALUES(owner_id),(attacker);
 INSERT INTO public.profiles(id,email) VALUES(owner_id,'owner@example.test'),(attacker,'attacker@example.test');
 INSERT INTO public.recruitment_campaigns(id,user_id) VALUES(camp,owner_id);
 INSERT INTO public.candidate_cvs(id,campaign_id,analysis_result,match_score,status)
  VALUES(cand,camp,'{"summary":"genuine"}',82,'done');

  ASSERT to_regprocedure('public.save_candidate_analysis(uuid,jsonb,integer,text)') IS NULL, '4-arg v1 still exists';

-- grants: only service_role may execute
 ASSERT NOT has_function_privilege('authenticated','public.save_candidate_analysis(uuid,uuid,jsonb,integer,text)','EXECUTE'), 'authenticated can execute';
 ASSERT NOT has_function_privilege('anon','public.save_candidate_analysis(uuid,uuid,jsonb,integer,text)','EXECUTE'), 'anon can execute';
 ASSERT has_function_privilege('service_role','public.save_candidate_analysis(uuid,uuid,jsonb,integer,text)','EXECUTE'), 'service_role cannot execute';

 SET LOCAL ROLE service_role;
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);

 -- attacker: denied, row untouched
 BEGIN
  PERFORM public.save_candidate_analysis(attacker,cand,'{"summary":"PWNED"}',100,'done');
  RAISE EXCEPTION 'cross-tenant write succeeded';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 SELECT * INTO c FROM public.candidate_cvs WHERE id=cand;
 ASSERT c.match_score=82 AND c.status='done' AND c.analysis_result->>'summary'='genuine', 'row modified by attacker';

 -- unknown candidate: P0002
 BEGIN
  PERFORM public.save_candidate_analysis(owner_id,gen_random_uuid(),'{}',50,'done');
  RAISE EXCEPTION 'missing candidate succeeded';
 EXCEPTION WHEN no_data_found THEN NULL;
 END;

 -- owner: allowed, versions from JSON, counters synced
 PERFORM public.save_candidate_analysis(owner_id,cand,'{"summary":"new","scoreVersion":"s1","probabilityVersion":"p1"}',100,'done');
 SELECT * INTO c FROM public.candidate_cvs WHERE id=cand;
 ASSERT c.match_score=100 AND c.score_version='s1' AND c.probability_version='p1', 'owner write wrong';
 SELECT analyzed_count INTO n FROM public.recruitment_campaigns WHERE id=camp;
 ASSERT n=1, 'counter not synced';
END $$;
ROLLBACK;
