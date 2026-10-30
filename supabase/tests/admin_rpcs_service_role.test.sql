-- Run against a disposable database after migration 20261101050000; rolls back fixtures.
-- admin_set_user_plan / set_user_role are called by /api/admin as service_role
-- (auth.uid() is NULL) and must work there; clients must not execute them.
BEGIN;
DO $$
DECLARE u uuid:=gen_random_uuid(); p public.profiles;
BEGIN
 INSERT INTO auth.users(id) VALUES(u);
 INSERT INTO public.profiles(id,email) VALUES(u,'u@example.test');

 ASSERT NOT has_function_privilege('authenticated','public.admin_set_user_plan(uuid,text,integer)','EXECUTE'), 'authenticated can set plan';
 ASSERT NOT has_function_privilege('anon','public.admin_set_user_plan(uuid,text,integer)','EXECUTE'), 'anon can set plan';
 ASSERT NOT has_function_privilege('authenticated','public.set_user_role(uuid,text)','EXECUTE'), 'authenticated can set role';
 ASSERT NOT has_function_privilege('anon','public.set_user_role(uuid,text)','EXECUTE'), 'anon can set role';

 SET LOCAL ROLE service_role;
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 PERFORM set_config('request.jwt.claim.sub','',true);

 PERFORM public.admin_set_user_plan(u,'recruiter',30);
 SELECT * INTO p FROM public.profiles WHERE id=u;
 ASSERT p.plan='recruiter' AND p.plan_expires_at > now() + interval '29 days', 'plan not set to recruiter';

 PERFORM public.admin_set_user_plan(u,'free',30);
 SELECT * INTO p FROM public.profiles WHERE id=u;
 ASSERT p.plan='free' AND p.plan_expires_at IS NULL AND p.usage_count=0, 'plan not reset to free';

 PERFORM public.set_user_role(u,'admin');
 SELECT * INTO p FROM public.profiles WHERE id=u;
 ASSERT p.role='admin', 'role not set to admin';
 PERFORM public.set_user_role(u,'user');
 SELECT * INTO p FROM public.profiles WHERE id=u;
 ASSERT p.role='user', 'role not set back to user';

 BEGIN
  PERFORM public.set_user_role(u,'owner');
  RAISE EXCEPTION 'invalid role accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;
 END;
END $$;
ROLLBACK;
