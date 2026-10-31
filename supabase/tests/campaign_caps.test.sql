-- Run against a disposable database after migration 20261101110000; rolls back fixtures.
-- MAX_CAMPAIGNS.recruiter = 10 (src/lib/planLimits.ts); all statuses count.
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
DECLARE
 rec_u uuid:=gen_random_uuid();
 free_u uuid:=gen_random_uuid();
 admin_u uuid:=gen_random_uuid();
 i int;
BEGIN
 INSERT INTO auth.users(id) VALUES (rec_u),(free_u),(admin_u);
 INSERT INTO public.profiles(id,email,plan,role) VALUES
  (rec_u,'rec@example.test','recruiter','user'),
  (free_u,'free@example.test','free','user'),
  (admin_u,'admin@example.test','free','admin');
 GRANT ALL ON public.recruitment_campaigns TO authenticated; -- stub env; Supabase grants this by default

 SET LOCAL ROLE authenticated;

 -- A recruiter can create 10 campaigns, including archived ones.
 PERFORM pg_temp.as_user(rec_u);
 FOR i IN 1..9 LOOP
  INSERT INTO public.recruitment_campaigns(user_id,title,status) VALUES(rec_u,'campaign '||i,'active');
 END LOOP;
 INSERT INTO public.recruitment_campaigns(user_id,title,status) VALUES(rec_u,'archived','archived');
 ASSERT (SELECT count(*) FROM public.recruitment_campaigns WHERE user_id=rec_u)=10, 'setup: expected 10 campaigns';
 ASSERT pg_temp.denied(format('INSERT INTO public.recruitment_campaigns(user_id) VALUES(%L)', rec_u)),
  'recruiter created an 11th campaign';

 -- Free plan still cannot create campaigns at all.
 PERFORM pg_temp.as_user(free_u);
 ASSERT pg_temp.denied(format('INSERT INTO public.recruitment_campaigns(user_id) VALUES(%L)', free_u)),
  'free plan created a campaign';

 -- Admins are exempt from the recruiter cap (their plan resolves to pro).
 PERFORM pg_temp.as_user(admin_u);
 FOR i IN 1..11 LOOP
  INSERT INTO public.recruitment_campaigns(user_id,title) VALUES(admin_u,'admin '||i);
 END LOOP;
 ASSERT (SELECT count(*) FROM public.recruitment_campaigns WHERE user_id=admin_u)=11, 'admin campaign cap applied';
END $$;

-- service_role and SECURITY DEFINER maintenance paths are not capped.
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role','service_role',true);
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
INSERT INTO public.recruitment_campaigns(user_id,title)
SELECT id, 'service '||row_number() OVER () FROM public.profiles WHERE email='rec@example.test';
INSERT INTO public.recruitment_campaigns(user_id,title)
SELECT id, 'service '||row_number() OVER () FROM public.profiles WHERE email='rec@example.test';
DO $$
BEGIN
 ASSERT (SELECT count(*) FROM public.recruitment_campaigns WHERE user_id=(SELECT id FROM public.profiles WHERE email='rec@example.test'))=12,
  'service_role insert blocked by campaign cap';
END $$;

ROLLBACK;
