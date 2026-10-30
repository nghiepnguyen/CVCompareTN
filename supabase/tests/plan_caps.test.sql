-- Run against a disposable database after migration 20261101070000; rolls back fixtures.
-- Client inserts must respect plan caps (src/lib/planLimits.ts).
BEGIN;
CREATE FUNCTION pg_temp.as_user(u uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, true);
 PERFORM set_config('request.jwt.claim.sub', u::text, true);
 PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
END $$;
CREATE FUNCTION pg_temp.denied(sql text) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
 EXECUTE sql;
 RETURN false;
EXCEPTION WHEN insufficient_privilege THEN RETURN true;
END $$;

DO $$
DECLARE free_u uuid:=gen_random_uuid(); pro_u uuid:=gen_random_uuid(); rec_u uuid:=gen_random_uuid(); camp uuid:=gen_random_uuid(); i int;
BEGIN
 INSERT INTO auth.users(id) VALUES(free_u),(pro_u),(rec_u);
 INSERT INTO public.profiles(id,email,plan,plan_expires_at) VALUES
  (free_u,'f@example.test','free',NULL),(pro_u,'p@example.test','pro',now()+interval '1 day'),(rec_u,'r@example.test','recruiter',NULL);
 INSERT INTO public.recruitment_campaigns(id,user_id) VALUES(camp,rec_u);
 GRANT ALL ON public.saved_cvs, public.saved_jds, public.recruitment_campaigns, public.candidate_cvs TO authenticated; -- stub env; Supabase grants this by default

 SET LOCAL ROLE authenticated;

 -- free: 1 saved CV, 3 saved JDs, no recruiter features
 PERFORM pg_temp.as_user(free_u);
 INSERT INTO public.saved_cvs(user_id,cv_id,file_path) VALUES(free_u,'c1',free_u||'/c1');
 ASSERT pg_temp.denied(format('INSERT INTO public.saved_cvs(user_id,cv_id,file_path) VALUES(%L,%L,%L)', free_u, 'c2', free_u||'/c2')), 'free got a 2nd saved CV';
 FOR i IN 1..3 LOOP INSERT INTO public.saved_jds(user_id,jd_id) VALUES(free_u,'j'||i); END LOOP;
 ASSERT pg_temp.denied(format('INSERT INTO public.saved_jds(user_id,jd_id) VALUES(%L,%L)', free_u, 'j4')), 'free got a 4th saved JD';
 ASSERT pg_temp.denied(format('INSERT INTO public.recruitment_campaigns(user_id) VALUES(%L)', free_u)), 'free created a campaign';

 -- pro: 10 saved CVs, unlimited JDs, still no campaigns
 PERFORM pg_temp.as_user(pro_u);
 FOR i IN 1..10 LOOP INSERT INTO public.saved_cvs(user_id,cv_id,file_path) VALUES(pro_u,'c'||i,pro_u||'/c'||i); END LOOP;
 ASSERT pg_temp.denied(format('INSERT INTO public.saved_cvs(user_id,cv_id,file_path) VALUES(%L,%L,%L)', pro_u, 'c11', pro_u||'/c11')), 'pro got an 11th saved CV';
 FOR i IN 1..5 LOOP INSERT INTO public.saved_jds(user_id,jd_id) VALUES(pro_u,'j'||i); END LOOP;
 ASSERT pg_temp.denied(format('INSERT INTO public.recruitment_campaigns(user_id) VALUES(%L)', pro_u)), 'pro created a campaign';

 -- recruiter: campaigns allowed, 50 candidates per campaign
 PERFORM pg_temp.as_user(rec_u);
 INSERT INTO public.recruitment_campaigns(user_id) VALUES(rec_u);
 FOR i IN 1..50 LOOP INSERT INTO public.candidate_cvs(campaign_id,file_path) VALUES(camp,rec_u||'/k'||i); END LOOP;
 ASSERT pg_temp.denied(format('INSERT INTO public.candidate_cvs(campaign_id,file_path) VALUES(%L,%L)', camp, rec_u||'/k51')), 'recruiter got a 51st candidate';

 -- service_role is not capped
 RESET ROLE;
 SET LOCAL ROLE service_role;
 PERFORM set_config('request.jwt.claim.role','service_role',true);
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 INSERT INTO public.saved_cvs(user_id,cv_id,file_path) VALUES(free_u,'svc',free_u||'/svc');
END $$;
ROLLBACK;
