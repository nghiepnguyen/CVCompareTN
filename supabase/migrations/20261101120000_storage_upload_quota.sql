-- §4.6: bound direct Supabase Storage uploads. `cv-files` and
-- `cv-analyze-tmp` already cap each file (50 MB / 15 MB) and restrict the
-- folder to the caller, but a client could still upload unlimited objects
-- through the Storage API (bypassing /api/storage and the R2 registry), so
-- storage grew without bound and stale temp objects were never swept.
--
-- This trigger caps per user:
--   cv-files saved  `${uid}/${cvId}/${file}`            -> MAX_SAVED_CV_BY_PLAN (1/10/50)
--   cv-files candidate `${uid}/campaigns/${cid}/${file}` -> 50 per campaign, 500 per user
--   cv-analyze-tmp `${uid}/${file}`                      -> 6/12/60 depending on plan
-- Total bytes stay bounded by these counts times the bucket file_size_limit.
-- Paths that do not match these shapes are rejected so a caller cannot open
-- an uncounted folder. Admin counts as pro (same rule as enforce_plan_caps);
-- service_role and SECURITY DEFINER maintenance keep bypassing.

CREATE OR REPLACE FUNCTION public.enforce_storage_quota()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user uuid;
  v_plan text;
  v_role text;
  v_folders text[];
  v_max integer;
  v_count integer;
BEGIN
  -- SECURITY DEFINER so the count queries bypass storage.objects RLS (the
  -- temp bucket has no SELECT policy); auth.role() still identifies the
  -- original caller while service_role/maintenance paths skip the cap.
  IF current_user NOT IN ('authenticated', 'anon')
     AND auth.role() NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  v_user := auth.uid();
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Account required' USING ERRCODE = '42501';
  END IF;

  v_folders := storage.foldername(NEW.name);
  IF coalesce(v_folders[1], '') <> v_user::text THEN
    RAISE EXCEPTION 'Invalid storage path' USING ERRCODE = '42501';
  END IF;

  -- Serialize concurrent uploads for the same user and bucket.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text || ':' || NEW.bucket_id, 0));

  SELECT CASE WHEN p.role = 'admin' THEN 'pro'
              WHEN p.plan_expires_at IS NOT NULL AND p.plan_expires_at < now() THEN 'free'
              ELSE p.plan END,
         p.role
    INTO v_plan, v_role
    FROM public.profiles AS p WHERE p.id = v_user;
  v_plan := coalesce(v_plan, 'free');

  IF NEW.bucket_id = 'cv-files' THEN
    IF array_length(v_folders, 1) <= 2
       AND (array_length(v_folders, 1) = 1 OR v_folders[2] IS DISTINCT FROM 'campaigns') THEN
      -- Saved CV library.
      v_max := CASE v_plan WHEN 'recruiter' THEN 50 WHEN 'pro' THEN 10 ELSE 1 END;
      SELECT count(*) INTO v_count FROM storage.objects
        WHERE bucket_id = 'cv-files'
          AND (storage.foldername(name))[1] = v_user::text
          AND (storage.foldername(name))[2] IS DISTINCT FROM 'campaigns';
      IF v_count >= v_max THEN
        RAISE EXCEPTION 'Saved CV file limit reached' USING ERRCODE = '42501';
      END IF;
    ELSIF array_length(v_folders, 1) = 3 AND v_folders[2] = 'campaigns' THEN
      -- Recruiter candidate CVs, one folder per campaign.
      IF v_plan <> 'recruiter' AND v_role IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Recruiter plan required' USING ERRCODE = '42501';
      END IF;
      SELECT count(*) INTO v_count FROM storage.objects
        WHERE bucket_id = 'cv-files'
          AND (storage.foldername(name))[1] = v_user::text
          AND (storage.foldername(name))[2] = 'campaigns'
          AND (storage.foldername(name))[3] = v_folders[3];
      IF v_count >= 50 THEN
        RAISE EXCEPTION 'Campaign CV file limit reached' USING ERRCODE = '42501';
      END IF;
      SELECT count(*) INTO v_count FROM storage.objects
        WHERE bucket_id = 'cv-files'
          AND (storage.foldername(name))[1] = v_user::text
          AND (storage.foldername(name))[2] = 'campaigns';
      IF v_count >= 500 THEN
        RAISE EXCEPTION 'Campaign storage limit reached' USING ERRCODE = '42501';
      END IF;
    ELSE
      RAISE EXCEPTION 'Invalid storage path' USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.bucket_id = 'cv-analyze-tmp' THEN
    IF array_length(v_folders, 1) <> 1 THEN
      RAISE EXCEPTION 'Invalid storage path' USING ERRCODE = '42501';
    END IF;
    v_max := CASE v_plan WHEN 'recruiter' THEN 60 WHEN 'pro' THEN 12 ELSE 6 END;
    SELECT count(*) INTO v_count FROM storage.objects
      WHERE bucket_id = 'cv-analyze-tmp'
        AND (storage.foldername(name))[1] = v_user::text;
    IF v_count >= v_max THEN
      RAISE EXCEPTION 'Temp upload limit reached' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_storage_quota() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS storage_quota ON storage.objects;
CREATE TRIGGER storage_quota BEFORE INSERT ON storage.objects
  FOR EACH ROW WHEN (NEW.bucket_id IN ('cv-files', 'cv-analyze-tmp'))
  EXECUTE FUNCTION public.enforce_storage_quota();

-- Legacy temp objects have no storage_uploads row, so runStorageCleanup never
-- saw them. This service-only listing lets the cleanup job remove objects
-- older than 24h, freeing slots and bounding accumulation.
CREATE OR REPLACE FUNCTION public.list_expired_temp_objects(p_limit integer DEFAULT 100)
RETURNS TABLE (name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT o.name
  FROM storage.objects AS o
  WHERE o.bucket_id = 'cv-analyze-tmp'
    AND o.created_at < now() - interval '24 hours'
  ORDER BY o.created_at
  LIMIT least(greatest(coalesce(p_limit, 100), 1), 200);
$$;

REVOKE ALL ON FUNCTION public.list_expired_temp_objects(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_expired_temp_objects(integer) TO service_role;

COMMENT ON FUNCTION public.enforce_storage_quota() IS
  'Caps direct Storage API inserts per user/plan for cv-files and cv-analyze-tmp.';
