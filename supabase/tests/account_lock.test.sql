-- Disposable DB only; migrations through 20261101090000. Fixtures roll back.
BEGIN;
CREATE FUNCTION pg_temp.set_user(u uuid, jwt_role text DEFAULT 'authenticated') RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM set_config('request.jwt.claims', json_build_object('sub',u,'role',jwt_role)::text, true);
 PERFORM set_config('request.jwt.claim.sub', coalesce(u::text,''), true);
 PERFORM set_config('request.jwt.claim.role', jwt_role, true);
END $$;
CREATE FUNCTION pg_temp.blocked(stmt text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
 EXECUTE stmt;
 GET DIAGNOSTICS n=ROW_COUNT;
 ASSERT n=0, format('locked caller mutated rows: %s',stmt);
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
DO $$
BEGIN
 ASSERT NOT (SELECT prosecdef FROM pg_proc WHERE oid='public.enforce_account_unlocked()'::regprocedure), 'guard must preserve execution role';
 ASSERT NOT has_function_privilege('authenticated','public.enforce_account_unlocked()','EXECUTE'), 'guard callable by authenticated';
 ASSERT NOT has_function_privilege('anon','public.enforce_account_unlocked()','EXECUTE'), 'guard callable by anon';
 ASSERT (SELECT count(*) FROM pg_trigger WHERE tgname='account_unlocked' AND NOT tgisinternal)=5, 'public write guards missing';
 ASSERT (SELECT count(*) FROM pg_trigger WHERE tgname IN ('account_unlocked_insert','account_unlocked_update','account_unlocked_delete') AND tgrelid='storage.objects'::regclass)=3, 'storage write guards missing';
 ASSERT (SELECT count(*) FROM pg_policy WHERE polname='account_unlocked_read' AND NOT polpermissive AND polcmd='r')=6, 'restrictive read policies missing';
 ASSERT NOT EXISTS(SELECT 1 FROM pg_class WHERE oid IN ('public.history'::regclass,'public.saved_jds'::regclass,'public.saved_cvs'::regclass,'public.recruitment_campaigns'::regclass,'public.candidate_cvs'::regclass,'storage.objects'::regclass) AND NOT relrowsecurity), 'ownership RLS disabled';
END $$;
DO $$
DECLARE
 locked_u uuid:=gen_random_uuid(); other_u uuid:=gen_random_uuid(); admin_u uuid:=gen_random_uuid();
 camp uuid:=gen_random_uuid(); cand uuid:=gen_random_uuid(); target record; bucket text; n integer;
BEGIN
 PERFORM pg_temp.set_user(NULL,'service_role');
 INSERT INTO auth.users(id) VALUES(locked_u),(other_u),(admin_u);
 INSERT INTO public.profiles(id,role,has_permission,plan) VALUES
  (locked_u,'user',false,'recruiter'),(other_u,'user',true,'recruiter'),(admin_u,'admin',false,'free');
 INSERT INTO public.history(user_id,analysis_id) VALUES(locked_u,'lock-fixture');
 INSERT INTO public.saved_jds(user_id,jd_id) VALUES(locked_u,'lock-fixture');
 INSERT INTO public.saved_cvs(user_id,cv_id,file_path) VALUES(locked_u,'lock-fixture',locked_u||'/fixture.pdf');
 INSERT INTO public.recruitment_campaigns(id,user_id) VALUES(camp,locked_u);
 INSERT INTO public.candidate_cvs(id,campaign_id,file_path) VALUES(cand,camp,locked_u||'/candidate.pdf');
 INSERT INTO storage.buckets(id,name,public) VALUES('account-lock-other','account-lock-other',false);
 CREATE POLICY account_lock_other ON storage.objects FOR ALL TO authenticated USING (bucket_id='account-lock-other') WITH CHECK (bucket_id='account-lock-other');
 INSERT INTO storage.objects(bucket_id,name) VALUES('account-lock-other',locked_u||'/other.pdf');
 INSERT INTO storage.objects(bucket_id,name) VALUES('cv-files',locked_u||'/fixture.pdf'),('cv-analyze-tmp',locked_u||'/fixture.pdf');
 -- Vanilla Postgres stubs do not reproduce the platform's storage ACLs.
 GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated,service_role;

 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.set_user(locked_u);
 ASSERT (SELECT count(*) FROM public.profiles WHERE id=locked_u)=1, 'lock broke profile read / UI lock screen';
 ASSERT (SELECT count(*) FROM public.history WHERE user_id=locked_u)=0, 'locked user still reads history';
 ASSERT (SELECT count(*) FROM public.candidate_cvs WHERE id=cand)=0, 'locked user still reads candidate data';
 ASSERT (SELECT count(*) FROM storage.objects WHERE bucket_id IN ('cv-files','cv-analyze-tmp'))=0, 'locked user still reads CV objects / signs URLs';
 FOR target IN SELECT * FROM (VALUES
  ('history',format('INSERT INTO public.history(user_id,analysis_id) VALUES(%L,%L)',locked_u,'new-run'),format('user_id=%L',locked_u),'cv_name'),
  ('saved_jds',format('INSERT INTO public.saved_jds(user_id,jd_id) VALUES(%L,%L)',locked_u,'new-jd'),format('user_id=%L',locked_u),'title'),
  ('saved_cvs',format('INSERT INTO public.saved_cvs(user_id,cv_id,file_path) VALUES(%L,%L,%L)',locked_u,'new-cv',locked_u||'/new.pdf'),format('user_id=%L',locked_u),'file_name'),
  ('recruitment_campaigns',format('INSERT INTO public.recruitment_campaigns(user_id) VALUES(%L)',locked_u),format('id=%L',camp),'title'),
  ('candidate_cvs',format('INSERT INTO public.candidate_cvs(campaign_id,file_path) VALUES(%L,%L)',camp,locked_u||'/new-candidate.pdf'),format('id=%L',cand),'file_name')
 ) AS cases(tbl,ins,predicate,col) LOOP
  PERFORM pg_temp.blocked(target.ins);
  PERFORM pg_temp.blocked(format('UPDATE public.%I SET %I=%L WHERE %s',target.tbl,target.col,'changed',target.predicate));
  PERFORM pg_temp.blocked(format('DELETE FROM public.%I WHERE %s',target.tbl,target.predicate));
 END LOOP;
 FOR bucket IN SELECT unnest(ARRAY['cv-files','cv-analyze-tmp']) LOOP
  PERFORM pg_temp.blocked(format('INSERT INTO storage.objects(bucket_id,name) VALUES(%L,%L)',bucket,locked_u||'/new.pdf'));
  PERFORM pg_temp.blocked(format('UPDATE storage.objects SET name=%L WHERE bucket_id=%L AND name=%L',locked_u||'/changed.pdf',bucket,locked_u||'/fixture.pdf'));
  PERFORM pg_temp.blocked(format('DELETE FROM storage.objects WHERE bucket_id=%L AND name=%L',bucket,locked_u||'/fixture.pdf'));
 END LOOP;
 -- Unrelated buckets retain their own policy; moves into/out of CV buckets are gated.
 INSERT INTO storage.objects(bucket_id,name) VALUES('account-lock-other',locked_u||'/new-other.pdf');
 PERFORM pg_temp.blocked(format('UPDATE storage.objects SET bucket_id=%L WHERE bucket_id=%L AND name=%L','cv-files','account-lock-other',locked_u||'/other.pdf'));
 PERFORM pg_temp.blocked(format('UPDATE storage.objects SET bucket_id=%L WHERE bucket_id=%L AND name=%L','account-lock-other','cv-files',locked_u||'/fixture.pdf'));
 -- SECURITY DEFINER runs as owner, but the original JWT still identifies the locked caller.
 BEGIN
  PERFORM public.update_candidate_hr_status(cand,'shortlisted','locked-write');
  RAISE EXCEPTION 'locked caller wrote through SECURITY DEFINER';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;

 -- Existing ownership policies must still stop an unlocked user changing someone else's rows.
 PERFORM pg_temp.set_user(other_u);
 UPDATE public.history SET cv_name='other' WHERE user_id=locked_u;
 GET DIAGNOSTICS n=ROW_COUNT; ASSERT n=0, 'cross-owner history write allowed';

 -- A locked admin retains recovery access, consistent with the UI and API rule.
 PERFORM pg_temp.set_user(admin_u);
 INSERT INTO public.history(user_id,analysis_id) VALUES(admin_u,'admin-run');
 UPDATE public.profiles SET has_permission=true WHERE id=locked_u;
 GET DIAGNOSTICS n=ROW_COUNT; ASSERT n=1, 'admin could not unlock user';

 -- Same JWT, no token refresh: unlocking takes effect immediately, including definer RPC.
 PERFORM pg_temp.set_user(locked_u);
 INSERT INTO public.history(user_id,analysis_id) VALUES(locked_u,'unlocked-run');
 PERFORM public.update_candidate_hr_status(cand,'shortlisted','unlocked-write');
 ASSERT (SELECT hr_status FROM public.candidate_cvs WHERE id=cand)='shortlisted', 'unlocked RPC blocked';
 ASSERT (SELECT shortlisted_count FROM public.recruitment_campaigns WHERE id=camp)=1, 'counter sync broke';

 RESET ROLE;
 UPDATE public.profiles SET has_permission=false WHERE id=locked_u;
 SET LOCAL ROLE service_role;
 PERFORM pg_temp.set_user(NULL,'service_role');
 UPDATE public.history SET cv_name='maintenance' WHERE user_id=locked_u;
 GET DIAGNOSTICS n=ROW_COUNT; ASSERT n=2, 'service_role cleanup blocked';
 RESET ROLE;
 ASSERT (SELECT count(*) FROM public.saved_jds WHERE user_id=locked_u)=1, 'locked JD mutated';
 ASSERT (SELECT count(*) FROM public.saved_cvs WHERE user_id=locked_u)=1, 'locked CV mutated';
END $$;
ROLLBACK;
