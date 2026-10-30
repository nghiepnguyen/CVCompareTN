-- NV-4: retain ownership RLS and also gate writes made inside SECURITY DEFINER
-- RPCs. auth.role() retains the original JWT role when current_user is the owner.
BEGIN;
CREATE FUNCTION public.enforce_account_unlocked()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
 IF (current_user IN ('anon','authenticated') OR auth.role() IN ('anon','authenticated'))
    AND NOT EXISTS (
      SELECT 1 FROM public.profiles AS p
      WHERE p.id = auth.uid() AND (p.has_permission OR p.role = 'admin')
    ) THEN
   RAISE EXCEPTION 'account_locked' USING ERRCODE = '42501';
 END IF;
 IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_account_unlocked() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER account_unlocked BEFORE INSERT OR UPDATE OR DELETE ON public.history
 FOR EACH ROW EXECUTE FUNCTION public.enforce_account_unlocked();
CREATE TRIGGER account_unlocked BEFORE INSERT OR UPDATE OR DELETE ON public.saved_jds
 FOR EACH ROW EXECUTE FUNCTION public.enforce_account_unlocked();
CREATE TRIGGER account_unlocked BEFORE INSERT OR UPDATE OR DELETE ON public.saved_cvs
 FOR EACH ROW EXECUTE FUNCTION public.enforce_account_unlocked();
CREATE TRIGGER account_unlocked BEFORE INSERT OR UPDATE OR DELETE ON public.recruitment_campaigns
 FOR EACH ROW EXECUTE FUNCTION public.enforce_account_unlocked();
CREATE TRIGGER account_unlocked BEFORE INSERT OR UPDATE OR DELETE ON public.candidate_cvs
 FOR EACH ROW EXECUTE FUNCTION public.enforce_account_unlocked();

-- Scope this guard to the CV buckets, including moves into or out of them.
CREATE TRIGGER account_unlocked_insert BEFORE INSERT ON storage.objects
 FOR EACH ROW WHEN (NEW.bucket_id IN ('cv-files','cv-analyze-tmp'))
 EXECUTE FUNCTION public.enforce_account_unlocked();
CREATE TRIGGER account_unlocked_update BEFORE UPDATE ON storage.objects
 FOR EACH ROW WHEN (OLD.bucket_id IN ('cv-files','cv-analyze-tmp') OR NEW.bucket_id IN ('cv-files','cv-analyze-tmp'))
 EXECUTE FUNCTION public.enforce_account_unlocked();
CREATE TRIGGER account_unlocked_delete BEFORE DELETE ON storage.objects
 FOR EACH ROW WHEN (OLD.bucket_id IN ('cv-files','cv-analyze-tmp'))
 EXECUTE FUNCTION public.enforce_account_unlocked();

-- Restrictive SELECT policies also protect direct reads and Storage signed-URL
-- creation. profiles stays readable for the lock screen and admin recovery.
CREATE POLICY account_unlocked_read ON public.history AS RESTRICTIVE FOR SELECT TO authenticated
 USING ((SELECT p.has_permission OR p.role='admin' FROM public.profiles AS p WHERE p.id=(SELECT auth.uid())));
CREATE POLICY account_unlocked_read ON public.saved_jds AS RESTRICTIVE FOR SELECT TO authenticated
 USING ((SELECT p.has_permission OR p.role='admin' FROM public.profiles AS p WHERE p.id=(SELECT auth.uid())));
CREATE POLICY account_unlocked_read ON public.saved_cvs AS RESTRICTIVE FOR SELECT TO authenticated
 USING ((SELECT p.has_permission OR p.role='admin' FROM public.profiles AS p WHERE p.id=(SELECT auth.uid())));
CREATE POLICY account_unlocked_read ON public.recruitment_campaigns AS RESTRICTIVE FOR SELECT TO authenticated
 USING ((SELECT p.has_permission OR p.role='admin' FROM public.profiles AS p WHERE p.id=(SELECT auth.uid())));
CREATE POLICY account_unlocked_read ON public.candidate_cvs AS RESTRICTIVE FOR SELECT TO authenticated
 USING ((SELECT p.has_permission OR p.role='admin' FROM public.profiles AS p WHERE p.id=(SELECT auth.uid())));
CREATE POLICY account_unlocked_read ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated
 USING (bucket_id NOT IN ('cv-files','cv-analyze-tmp') OR
   (SELECT p.has_permission OR p.role='admin' FROM public.profiles AS p WHERE p.id=(SELECT auth.uid())));
COMMIT;
