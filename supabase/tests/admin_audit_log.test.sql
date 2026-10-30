-- Run against a disposable database after migration 20261101030000; rollback fixtures.
-- P2-1: only admins (via RPC) or service_role may write public.admin_audit_log.
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
 attacker uuid:=gen_random_uuid(); victim uuid:=gen_random_uuid(); adm uuid:=gen_random_uuid();
 n integer; r public.admin_audit_log;
BEGIN
 INSERT INTO auth.users(id) VALUES(attacker),(victim),(adm);
 INSERT INTO public.profiles(id,email,role) VALUES
  (attacker,'attacker@example.test','user'),(victim,'victim@example.test','user'),(adm,'admin@example.test','admin');

 EXECUTE 'SET LOCAL ROLE authenticated';
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
 PERFORM set_config('request.jwt.claim.sub',attacker::text,true);
 PERFORM pg_temp.expect_denied(format('INSERT INTO public.admin_audit_log(admin_id,action,target_user_id) VALUES(%L,%L,%L)',attacker,'delete_user',victim),'direct client insert');
 PERFORM pg_temp.expect_denied(format('SELECT public.log_admin_action(%L,%L)','update_permission',victim),'non-admin RPC');

 -- admin: RPC works, admin_id comes from the session
 PERFORM set_config('request.jwt.claim.sub',adm::text,true);
 PERFORM public.log_admin_action('update_permission',victim,'{"has_permission":true}');
 SELECT * INTO r FROM public.admin_audit_log WHERE target_user_id=victim;
 ASSERT r.admin_id=adm AND r.action='update_permission', 'admin RPC row wrong';
 BEGIN
  PERFORM public.log_admin_action('foo',victim);
  RAISE EXCEPTION 'bad action accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;

 -- service_role keeps direct insert (_server-lib/admin/audit.ts)
 EXECUTE 'RESET ROLE';
 EXECUTE 'SET LOCAL ROLE service_role';
 PERFORM set_config('request.jwt.claim.role','service_role',true);
 INSERT INTO public.admin_audit_log(admin_id,action,target_user_id) VALUES(adm,'delete_user',victim);
 EXECUTE 'RESET ROLE';
 SELECT count(*) INTO n FROM public.admin_audit_log WHERE target_user_id=victim;
 ASSERT n=2, 'expected exactly 2 audit rows';
END $$;
ROLLBACK;
