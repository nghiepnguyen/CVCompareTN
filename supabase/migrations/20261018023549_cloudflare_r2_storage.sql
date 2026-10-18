-- Additive migration: apply before enabling STORAGE_WRITE_PROVIDER=r2.
BEGIN;
CREATE SCHEMA IF NOT EXISTS storage_internal;
REVOKE ALL ON SCHEMA storage_internal FROM PUBLIC, anon, authenticated;
ALTER TABLE public.saved_cvs ADD COLUMN storage_provider text NOT NULL DEFAULT 'supabase' CHECK (storage_provider IN ('supabase','r2'));
ALTER TABLE public.saved_cvs ADD COLUMN storage_status text NOT NULL DEFAULT 'ready' CHECK (storage_status IN ('ready','delete_pending'));
ALTER TABLE public.candidate_cvs ADD COLUMN storage_provider text NOT NULL DEFAULT 'supabase' CHECK (storage_provider IN ('supabase','r2'));
ALTER TABLE public.candidate_cvs ADD COLUMN storage_status text NOT NULL DEFAULT 'ready' CHECK (storage_status IN ('ready','delete_pending'));
CREATE TABLE public.storage_blocked_users (user_id uuid PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.storage_uploads (
 id uuid PRIMARY KEY, user_id uuid NOT NULL, purpose text NOT NULL CHECK (purpose IN ('temp','saved','candidate')),
 campaign_id uuid, file_name text NOT NULL, mime_type text NOT NULL, file_size bigint NOT NULL CHECK (file_size > 0 AND file_size <= 52428800),
 staging_key text NOT NULL UNIQUE, final_key text, status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ready','failed','deleted')),
 lease_token uuid, lease_until timestamptz, result_id text,
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now() + interval '1 day'
);
CREATE INDEX storage_uploads_owner_idx ON public.storage_uploads(user_id, created_at);
CREATE TABLE public.storage_cleanup_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider text NOT NULL CHECK(provider IN ('supabase','r2')),
 bucket_kind text NOT NULL CHECK(bucket_kind IN ('temp','saved')), object_key text NOT NULL,
 scope text NOT NULL DEFAULT 'object' CHECK(scope IN ('object','prefix')),
 attempts integer NOT NULL DEFAULT 0, not_before timestamptz NOT NULL DEFAULT now(), lease_token uuid, lease_until timestamptz,
 last_error text, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(provider,bucket_kind,object_key,scope)
);
CREATE INDEX storage_cleanup_due_idx ON public.storage_cleanup_jobs(not_before);
ALTER TABLE public.storage_blocked_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storage_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storage_cleanup_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.storage_blocked_users, public.storage_uploads, public.storage_cleanup_jobs FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.storage_blocked_users, public.storage_uploads, public.storage_cleanup_jobs TO service_role;

CREATE FUNCTION public.storage_reserve_upload(p_user uuid, p_id uuid, p_purpose text, p_campaign uuid, p_name text, p_mime text, p_size bigint)
RETURNS public.storage_uploads LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE r public.storage_uploads; n integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user) OR EXISTS(SELECT 1 FROM public.storage_blocked_users WHERE user_id=p_user) THEN RAISE EXCEPTION 'Account unavailable'; END IF;
 IF p_purpose='candidate' AND NOT EXISTS(SELECT 1 FROM public.recruitment_campaigns WHERE id=p_campaign AND user_id=p_user) THEN RAISE EXCEPTION 'Campaign unavailable'; END IF;
 SELECT count(*) INTO n FROM public.storage_uploads WHERE user_id=p_user AND created_at>now()-interval '15 minutes';
 IF n>=100 THEN RAISE EXCEPTION 'Upload rate limit'; END IF;
 SELECT count(*) INTO n FROM public.storage_uploads WHERE user_id=p_user AND status='pending' AND expires_at>now();
 IF n>=50 THEN RAISE EXCEPTION 'Too many pending uploads'; END IF;
 INSERT INTO public.storage_uploads(id,user_id,purpose,campaign_id,file_name,mime_type,file_size,staging_key)
 VALUES(p_id,p_user,p_purpose,p_campaign,p_name,p_mime,p_size,'staging/'||p_user||'/'||p_id) RETURNING * INTO r;
 -- Persist cleanup before signing: a lost response or replayed PUT still gets swept.
 INSERT INTO public.storage_cleanup_jobs(provider,bucket_kind,object_key,not_before)
 VALUES('r2',CASE WHEN p_purpose='temp' THEN 'temp' ELSE 'saved' END,r.staging_key,now()+interval '1 day');
 RETURN r;
END $$;

CREATE FUNCTION public.storage_claim_upload(p_user uuid, p_id uuid, p_token uuid)
RETURNS SETOF public.storage_uploads LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.storage_blocked_users WHERE user_id=p_user) THEN RETURN; END IF;
 RETURN QUERY UPDATE public.storage_uploads SET lease_token=p_token,lease_until=now()+interval '2 minutes',final_key=p_user||'/r2/'||p_id||'/'||p_token
 WHERE id=p_id AND user_id=p_user AND status='pending' AND expires_at>now() AND (lease_until IS NULL OR lease_until<now()) RETURNING *;
END $$;

CREATE FUNCTION public.storage_publish_upload(p_user uuid,p_id uuid,p_token uuid)
RETURNS public.storage_uploads LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE r public.storage_uploads; plan_name text; user_role text; max_count integer; n integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 SELECT * INTO r FROM public.storage_uploads WHERE id=p_id AND user_id=p_user FOR UPDATE;
 IF r.status='ready' THEN RETURN r; END IF;
 IF r.id IS NULL OR r.lease_token IS DISTINCT FROM p_token OR r.lease_until<now() OR r.status<>'pending' THEN RAISE EXCEPTION 'Finalize lease expired'; END IF;
 IF EXISTS(SELECT 1 FROM public.storage_blocked_users WHERE user_id=p_user) THEN RAISE EXCEPTION 'Account unavailable'; END IF;
 SELECT CASE WHEN role='admin' THEN 'pro' WHEN plan_expires_at IS NOT NULL AND plan_expires_at<now() THEN 'free' ELSE plan END,role INTO plan_name,user_role FROM public.profiles WHERE id=p_user;
 IF plan_name IS NULL THEN RAISE EXCEPTION 'Account unavailable'; END IF;
 IF r.purpose='saved' THEN
  max_count:=CASE plan_name WHEN 'recruiter' THEN 50 WHEN 'pro' THEN 10 ELSE 1 END;
  SELECT count(*) INTO n FROM public.saved_cvs WHERE user_id=p_user;
  IF n>=max_count THEN RAISE EXCEPTION 'Saved CV limit reached'; END IF;
  INSERT INTO public.saved_cvs(user_id,cv_id,file_name,file_path,file_type,file_size,storage_provider) VALUES(p_user,r.id::text,r.file_name,r.final_key,r.mime_type,r.file_size,'r2');
  r.result_id:=r.id::text;
 ELSIF r.purpose='candidate' THEN
  PERFORM 1 FROM public.recruitment_campaigns WHERE id=r.campaign_id AND user_id=p_user FOR UPDATE;
  IF NOT FOUND OR (plan_name<>'recruiter' AND user_role<>'admin') THEN RAISE EXCEPTION 'Campaign unavailable'; END IF;
  SELECT count(*) INTO n FROM public.candidate_cvs WHERE campaign_id=r.campaign_id;
  IF n>=50 THEN RAISE EXCEPTION 'Campaign CV limit reached'; END IF;
  INSERT INTO public.candidate_cvs(id,campaign_id,candidate_name,file_name,file_path,file_size,storage_provider)
  VALUES(r.id,r.campaign_id,regexp_replace(r.file_name,'\.[^.]+$',''),r.file_name,r.final_key,r.file_size,'r2');
  r.result_id:=r.id::text;
 END IF;
 UPDATE public.storage_uploads SET status='ready',result_id=r.result_id,lease_until=NULL,expires_at=CASE WHEN purpose='temp' THEN now()+interval '1 day' ELSE 'infinity'::timestamptz END WHERE id=p_id RETURNING * INTO r;
 RETURN r;
END $$;

CREATE FUNCTION storage_internal.storage_queue_deleted_file() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF OLD.file_path<>'' THEN
 INSERT INTO public.storage_cleanup_jobs(provider,bucket_kind,object_key) VALUES(OLD.storage_provider,'saved',OLD.file_path) ON CONFLICT(provider,bucket_kind,object_key,scope) DO UPDATE SET not_before=least(public.storage_cleanup_jobs.not_before,EXCLUDED.not_before);
 -- Also remove retained migration copies; missing objects are harmless.
 IF OLD.storage_provider='r2' THEN
 INSERT INTO public.storage_cleanup_jobs(provider,bucket_kind,object_key) VALUES('supabase','saved',OLD.file_path) ON CONFLICT DO NOTHING;
 END IF;
 UPDATE public.storage_uploads SET status='deleted',expires_at=now() WHERE final_key=OLD.file_path;
 END IF;
 IF TG_OP='UPDATE' THEN RETURN NEW; END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER storage_saved_deleted BEFORE DELETE ON public.saved_cvs FOR EACH ROW EXECUTE FUNCTION storage_internal.storage_queue_deleted_file();
CREATE TRIGGER storage_candidate_deleted BEFORE DELETE ON public.candidate_cvs FOR EACH ROW EXECUTE FUNCTION storage_internal.storage_queue_deleted_file();

CREATE TRIGGER storage_saved_delete_pending BEFORE UPDATE OF storage_status ON public.saved_cvs FOR EACH ROW WHEN (NEW.storage_status='delete_pending' AND OLD.storage_status IS DISTINCT FROM NEW.storage_status) EXECUTE FUNCTION storage_internal.storage_queue_deleted_file();
CREATE TRIGGER storage_candidate_delete_pending BEFORE UPDATE OF storage_status ON public.candidate_cvs FOR EACH ROW WHEN (NEW.storage_status='delete_pending' AND OLD.storage_status IS DISTINCT FROM NEW.storage_status) EXECUTE FUNCTION storage_internal.storage_queue_deleted_file();

CREATE FUNCTION storage_internal.storage_queue_deleted_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 INSERT INTO public.storage_blocked_users(user_id) VALUES(OLD.id) ON CONFLICT DO NOTHING;
 UPDATE public.storage_uploads SET status='deleted',expires_at=now() WHERE user_id=OLD.id;
 INSERT INTO public.storage_cleanup_jobs(provider,bucket_kind,object_key,scope,not_before)
 SELECT p,b,OLD.id::text||'/', 'prefix',now()+interval '20 minutes' FROM unnest(ARRAY['r2','supabase']) p CROSS JOIN unnest(ARRAY['temp','saved']) b ON CONFLICT DO NOTHING;
 INSERT INTO public.storage_cleanup_jobs(provider,bucket_kind,object_key,scope,not_before)
 SELECT 'r2',b,'staging/'||OLD.id||'/', 'prefix',now()+interval '20 minutes' FROM unnest(ARRAY['temp','saved']) b ON CONFLICT DO NOTHING;
 RETURN OLD;
END $$;
CREATE TRIGGER storage_user_deleted BEFORE DELETE ON auth.users FOR EACH ROW EXECUTE FUNCTION storage_internal.storage_queue_deleted_user();

-- Clients may still create legacy Supabase records, but cannot forge R2 references or change storage identity.
CREATE FUNCTION public.storage_protect_metadata() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 IF auth.role()='service_role' THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.storage_provider<>'supabase' OR NEW.storage_status<>'ready' OR split_part(NEW.file_path,'/',1) IS DISTINCT FROM auth.uid()::text THEN RAISE EXCEPTION 'Invalid storage identity'; END IF;
 ELSIF (NEW.file_path,NEW.storage_provider,NEW.storage_status) IS DISTINCT FROM (OLD.file_path,OLD.storage_provider,OLD.storage_status) THEN RAISE EXCEPTION 'Storage identity is immutable';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER storage_saved_protect BEFORE INSERT OR UPDATE ON public.saved_cvs FOR EACH ROW EXECUTE FUNCTION public.storage_protect_metadata();
CREATE TRIGGER storage_candidate_protect BEFORE INSERT OR UPDATE ON public.candidate_cvs FOR EACH ROW EXECUTE FUNCTION public.storage_protect_metadata();

REVOKE ALL ON FUNCTION public.storage_reserve_upload(uuid,uuid,text,uuid,text,text,bigint), public.storage_claim_upload(uuid,uuid,uuid), public.storage_publish_upload(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.storage_reserve_upload(uuid,uuid,text,uuid,text,text,bigint), public.storage_claim_upload(uuid,uuid,uuid), public.storage_publish_upload(uuid,uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION storage_internal.storage_queue_deleted_file(), storage_internal.storage_queue_deleted_user(), public.storage_protect_metadata() FROM PUBLIC,anon,authenticated;

-- Restrict legacy mutations too; SELECT/private-bucket rollout is coordinated with deployment.
DROP POLICY IF EXISTS "cv_files_insert_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "cv_files_update_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "cv_files_delete_authenticated" ON storage.objects;
CREATE POLICY "cv_files_insert_authenticated" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id='cv-files' AND (storage.foldername(name))[1]=auth.uid()::text);
CREATE POLICY "cv_files_update_authenticated" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id='cv-files' AND (storage.foldername(name))[1]=auth.uid()::text)
WITH CHECK (bucket_id='cv-files' AND (storage.foldername(name))[1]=auth.uid()::text);
CREATE POLICY "cv_files_delete_authenticated" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id='cv-files' AND (storage.foldername(name))[1]=auth.uid()::text);

COMMIT;
