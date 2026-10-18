-- Run against a disposable database after the R2 migration; rollback fixtures.
BEGIN;
DO $$
DECLARE owner_id uuid:=gen_random_uuid(); other_id uuid:=gen_random_uuid(); upload_id uuid:=gen_random_uuid(); token uuid:=gen_random_uuid(); stale uuid:=gen_random_uuid(); r public.storage_uploads; n integer;
BEGIN
 INSERT INTO auth.users(id) VALUES(owner_id),(other_id);
 INSERT INTO public.profiles(id,plan) VALUES(owner_id,'pro'),(other_id,'free') ON CONFLICT(id) DO UPDATE SET plan=EXCLUDED.plan;
 SELECT * INTO r FROM public.storage_reserve_upload(owner_id,upload_id,'saved',null,'CV.pdf','application/pdf',100);
 ASSERT r.user_id=owner_id AND r.status='pending';
 SELECT count(*) INTO n FROM public.storage_claim_upload(other_id,upload_id,token);
 ASSERT n=0, 'another user claimed upload';
 SELECT * INTO r FROM public.storage_claim_upload(owner_id,upload_id,token);
 ASSERT r.lease_token=token;
 SELECT count(*) INTO n FROM public.storage_claim_upload(owner_id,upload_id,stale);
 ASSERT n=0, 'concurrent finalize acquired same upload';
 BEGIN
  PERFORM public.storage_publish_upload(owner_id,upload_id,stale);
  RAISE EXCEPTION 'stale finalize published';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='stale finalize published' THEN RAISE; END IF;
 END;
 SELECT * INTO r FROM public.storage_publish_upload(owner_id,upload_id,token);
 ASSERT r.status='ready' AND r.result_id=upload_id::text;
 PERFORM public.storage_publish_upload(owner_id,upload_id,token);
 SELECT count(*) INTO n FROM public.saved_cvs WHERE user_id=owner_id AND cv_id=upload_id::text;
 ASSERT n=1, 'finalize was not idempotent';
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
 PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
 BEGIN
  UPDATE public.saved_cvs SET storage_provider='supabase' WHERE user_id=owner_id;
  RAISE EXCEPTION 'client changed storage identity';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='client changed storage identity' THEN RAISE; END IF;
 END;
 PERFORM set_config('request.jwt.claim.role','service_role',true);
 UPDATE public.saved_cvs SET storage_status='delete_pending' WHERE user_id=owner_id;
 ASSERT EXISTS(SELECT 1 FROM public.storage_cleanup_jobs WHERE object_key=r.final_key), 'pending deletion lost cleanup inventory';
 DELETE FROM public.saved_cvs WHERE user_id=owner_id;
 SELECT count(*) INTO n FROM public.storage_cleanup_jobs WHERE object_key=r.final_key;
 ASSERT n>=1, 'metadata deletion lost cleanup inventory';
 DELETE FROM auth.users WHERE id=owner_id;
 ASSERT EXISTS(SELECT 1 FROM public.storage_blocked_users WHERE user_id=owner_id);
 ASSERT EXISTS(SELECT 1 FROM public.storage_cleanup_jobs WHERE scope='prefix' AND object_key=owner_id||'/');
 ASSERT EXISTS(SELECT 1 FROM public.storage_uploads WHERE id=upload_id), 'cascade lost registry';
 BEGIN
  PERFORM public.storage_reserve_upload(owner_id,gen_random_uuid(),'temp',null,'CV.pdf','application/pdf',100);
  RAISE EXCEPTION 'deleted owner reserved upload';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='deleted owner reserved upload' THEN RAISE; END IF;
 END;
END $$;
DO $$
BEGIN
 ASSERT NOT has_function_privilege('authenticated','public.storage_reserve_upload(uuid,uuid,text,uuid,text,text,bigint)','EXECUTE');
 ASSERT NOT has_table_privilege('authenticated','public.storage_uploads','SELECT');
 ASSERT NOT has_table_privilege('anon','public.storage_cleanup_jobs','SELECT');
 ASSERT has_function_privilege('service_role','public.storage_publish_upload(uuid,uuid,uuid)','EXECUTE');
END $$;
ROLLBACK;
