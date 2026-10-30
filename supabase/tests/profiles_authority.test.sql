-- Run against a disposable database after migration 20261101000000; rollback fixtures.
-- P0-1: clients (authenticated/anon) must not write privileged profiles columns.
BEGIN;
CREATE FUNCTION pg_temp.expect_denied(stmt text, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 EXECUTE stmt;
 RAISE EXCEPTION '% succeeded', label;
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.expect_denied(text,text) TO authenticated;
DO $$
DECLARE
 attacker uuid:=gen_random_uuid(); victim uuid:=gen_random_uuid(); admin_id uuid:=gen_random_uuid(); newbie uuid:=gen_random_uuid();
 p public.profiles; n integer; q jsonb; ict_day integer:=LEAST(EXTRACT(DAY FROM now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::int,28);
BEGIN
 INSERT INTO auth.users(id) VALUES(attacker),(victim),(admin_id),(newbie);
 INSERT INTO public.profiles(id,email,role,has_permission,usage_count) VALUES
  (attacker,'attacker@example.test','user',true,3),
  (victim,'victim@example.test','user',false,0),
  (admin_id,'admin@example.test','admin',true,0);

 -- attacker: privileged columns on own row
 EXECUTE 'SET LOCAL ROLE authenticated';
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
 PERFORM set_config('request.jwt.claim.sub',attacker::text,true);
 PERFORM pg_temp.expect_denied(format('UPDATE public.profiles SET role=%L WHERE id=%L','admin',attacker),'self role escalation');
 PERFORM pg_temp.expect_denied(format('UPDATE public.profiles SET plan=%L WHERE id=%L','recruiter',attacker),'self plan change');
 PERFORM pg_temp.expect_denied(format('UPDATE public.profiles SET plan_expires_at=NULL WHERE id=%L',attacker),'self plan_expires_at change');
 PERFORM pg_temp.expect_denied(format('UPDATE public.profiles SET usage_count=0 WHERE id=%L',attacker),'self usage reset');
 PERFORM pg_temp.expect_denied(format('UPDATE public.profiles SET usage_month=%L WHERE id=%L','2020-01-01',attacker),'self usage_month change');
 PERFORM pg_temp.expect_denied(format('UPDATE public.profiles SET quota_reset_day=15 WHERE id=%L',attacker),'self quota_reset_day change');
 -- self-service columns stay writable
 UPDATE public.profiles SET display_name='Atk', photo_url='https://example.test/a.png', is_new=false WHERE id=attacker;
 GET DIAGNOSTICS n=ROW_COUNT; ASSERT n=1, 'self-service update blocked';
 -- no client delete
 BEGIN
  DELETE FROM public.profiles WHERE id=attacker;
  GET DIAGNOSTICS n=ROW_COUNT; ASSERT n=0, 'client deleted own profile';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;

 -- victim (locked): admin-only columns on own row
 PERFORM set_config('request.jwt.claim.sub',victim::text,true);
 PERFORM pg_temp.expect_denied(format('UPDATE public.profiles SET has_permission=true WHERE id=%L',victim),'self unlock');
 PERFORM pg_temp.expect_denied(format('UPDATE public.profiles SET monthly_analytics_limit=9999 WHERE id=%L',victim),'self limit change');
 PERFORM pg_temp.expect_denied(format('UPDATE public.profiles SET monthly_analytics_limit_custom=true WHERE id=%L',victim),'self custom-limit flag');

 -- new user INSERT with the createUserProfile shape plus forged privileged values
 PERFORM set_config('request.jwt.claim.sub',newbie::text,true);
 INSERT INTO public.profiles(id,email,display_name,photo_url,role,has_permission,usage_count,usage_month,monthly_analytics_limit_custom,quota_reset_day,is_new,plan,plan_expires_at,plan_updated_at)
 VALUES(newbie,'new@example.test','New','https://example.test/n.png','admin',true,0,'2020-01-01',true,1,true,'recruiter',now()+interval '1 year',now());

 -- admin: admin-only columns on victim OK, role/plan never via client
 PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
 UPDATE public.profiles SET has_permission=true, monthly_analytics_limit=50, monthly_analytics_limit_custom=true, is_new=false WHERE id=victim;
 GET DIAGNOSTICS n=ROW_COUNT; ASSERT n=1, 'admin update of victim blocked';
 PERFORM pg_temp.expect_denied(format('UPDATE public.profiles SET role=%L WHERE id=%L','admin',victim),'admin client role change');
 PERFORM pg_temp.expect_denied(format('UPDATE public.profiles SET plan=%L WHERE id=%L','pro',victim),'admin client plan change');

 -- SECURITY DEFINER quota RPCs called by the user still write usage columns
 PERFORM set_config('request.jwt.claim.sub',attacker::text,true);
 PERFORM public.increment_usage_count(attacker);
 q:=public.check_analytics_quota(attacker,NULL::integer);
 ASSERT q IS NOT NULL, 'check_analytics_quota returned null';

 EXECUTE 'RESET ROLE';
 SELECT * INTO p FROM public.profiles WHERE id=attacker;
 ASSERT FOUND, 'attacker row deleted';
 ASSERT p.role='user' AND p.plan='free' AND p.display_name='Atk' AND NOT p.is_new, 'attacker row wrong after updates';
 ASSERT p.usage_count=4, format('increment_usage_count did not increment: %s', p.usage_count);
 SELECT * INTO p FROM public.profiles WHERE id=victim;
 ASSERT p.has_permission AND p.monthly_analytics_limit=50 AND p.monthly_analytics_limit_custom AND p.role='user' AND p.plan='free', 'victim row wrong after admin update';
 SELECT * INTO p FROM public.profiles WHERE id=newbie;
 ASSERT p.role='user' AND p.plan='free' AND p.plan_expires_at IS NULL AND p.plan_updated_at IS NULL, 'insert kept forged role/plan';
 ASSERT p.usage_count=0 AND p.has_permission AND NOT p.monthly_analytics_limit_custom AND p.display_name='New' AND p.is_new, 'insert kept forged quota fields';
 ASSERT p.quota_reset_day=ict_day, format('quota_reset_day %s <> %s', p.quota_reset_day, ict_day);
 ASSERT p.usage_month=public.current_quota_cycle(p.quota_reset_day), format('usage_month %s', p.usage_month);

 -- definer RPC resets usage on cycle change while called as authenticated
 UPDATE public.profiles SET usage_month='2020-01-01', usage_count=2 WHERE id=attacker;
 EXECUTE 'SET LOCAL ROLE authenticated';
 q:=public.check_analytics_quota(attacker,NULL::integer);
 EXECUTE 'RESET ROLE';
 SELECT * INTO p FROM public.profiles WHERE id=attacker;
 ASSERT p.usage_count=0 AND p.usage_month<>'2020-01-01', 'quota cycle reset blocked for definer RPC';

 -- trigger alone blocks privileged columns even if a table-level UPDATE grant comes back (grant undone by the subtransaction)
 BEGIN
  GRANT UPDATE ON public.profiles TO authenticated;
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM pg_temp.expect_denied(format('UPDATE public.profiles SET role=%L WHERE id=%L','admin',attacker),'trigger-only role escalation');
  PERFORM pg_temp.expect_denied(format('UPDATE public.profiles SET usage_count=99 WHERE id=%L',attacker),'trigger-only usage change');
  RAISE EXCEPTION USING ERRCODE='P0099';
 EXCEPTION WHEN SQLSTATE 'P0099' THEN NULL;
 END;

 -- backend service_role path is unaffected
 EXECUTE 'SET LOCAL ROLE service_role';
 PERFORM set_config('request.jwt.claim.role','service_role',true);
 UPDATE public.profiles SET plan='pro', role='admin', usage_count=7 WHERE id=victim;
 GET DIAGNOSTICS n=ROW_COUNT; ASSERT n=1, 'service_role update blocked';
 EXECUTE 'RESET ROLE';
 SELECT * INTO p FROM public.profiles WHERE id=victim;
 ASSERT p.plan='pro' AND p.role='admin' AND p.usage_count=7, 'service_role update lost';
END $$;
DO $$
BEGIN
 ASSERT NOT has_table_privilege('authenticated','public.profiles','UPDATE'), 'authenticated has table UPDATE';
 ASSERT NOT has_table_privilege('authenticated','public.profiles','DELETE'), 'authenticated has DELETE';
 ASSERT NOT has_table_privilege('anon','public.profiles','UPDATE'), 'anon has table UPDATE';
 ASSERT NOT has_column_privilege('authenticated','public.profiles','role','UPDATE'), 'authenticated can UPDATE role';
 ASSERT has_column_privilege('authenticated','public.profiles','is_new','UPDATE'), 'authenticated lost is_new UPDATE';
 ASSERT NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='public.profiles'::regclass AND polname='profiles_delete_own_or_admin'), 'delete policy still present';
END $$;
ROLLBACK;
