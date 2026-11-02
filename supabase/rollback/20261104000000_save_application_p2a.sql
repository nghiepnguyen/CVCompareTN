-- ROLLBACK ONLY (not a migration; never auto-applied). Restores the P2A save_application
-- (20261103000000_applications_snapshots.sql, verbatim) without the P2B created event.
-- Use only if the P2B save integration itself must be reverted while the rest of the
-- P2B schema stays. Saves made afterwards will have no created event in their timeline.
BEGIN;
CREATE OR REPLACE FUNCTION public.save_application(
  p_idempotency_key uuid,
  p_source_analysis_id text,
  p_language text,
  p_role_title text,
  p_company_name text,
  p_cv_parsed jsonb,
  p_cv_file_name text,
  p_jd_text text,
  p_analysis jsonb,
  p_cover_letter_text text DEFAULT NULL,
  p_cover_letter_language text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
  v_role text := nullif(btrim(coalesce(p_role_title, '')), '');
  v_company text := nullif(btrim(coalesce(p_company_name, '')), '');
  v_letter text := nullif(btrim(coalesce(p_cover_letter_text, '')), '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_idempotency_key IS NULL
     OR char_length(p_source_analysis_id) NOT BETWEEN 1 AND 100
     OR p_language IS NULL OR p_language NOT IN ('vi', 'en')
     OR char_length(v_role) > 200 OR char_length(v_company) > 200
     OR p_cv_parsed IS NULL OR jsonb_typeof(p_cv_parsed) <> 'object' OR p_cv_parsed = '{}'::jsonb
     OR octet_length(p_cv_parsed::text) > 200000
     OR char_length(p_cv_file_name) > 255
     OR p_jd_text IS NULL OR btrim(p_jd_text) = '' OR char_length(p_jd_text) > 50000
     OR p_analysis IS NULL OR jsonb_typeof(p_analysis) <> 'object' OR octet_length(p_analysis::text) > 60000
     OR jsonb_typeof(p_analysis -> 'matchScore') IS DISTINCT FROM 'number'
     OR jsonb_typeof(p_analysis -> 'requirements') IS DISTINCT FROM 'array'
     OR char_length(v_letter) > 10000
     OR (v_letter IS NOT NULL AND coalesce(p_cover_letter_language, '') NOT IN ('vi', 'en')) THEN
    RAISE EXCEPTION 'invalid_application' USING ERRCODE = '22023';
  END IF;

  -- A concurrent call with the same key waits on the unique index, then lands here.
  INSERT INTO public.applications (user_id, idempotency_key, source_analysis_id, company_name, role_title, language)
  VALUES (v_uid, p_idempotency_key, p_source_analysis_id, v_company, v_role, p_language)
  ON CONFLICT ON CONSTRAINT applications_user_idempotency_unique DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT a.id INTO v_id FROM public.applications AS a
    WHERE a.user_id = v_uid AND a.idempotency_key = p_idempotency_key;
    RETURN jsonb_build_object('id', v_id, 'created', false);
  END IF;

  INSERT INTO public.application_documents (application_id, user_id, document_type, content, metadata)
  VALUES
    (v_id, v_uid, 'cv', jsonb_build_object('parsedCV', p_cv_parsed),
      jsonb_strip_nulls(jsonb_build_object('snapshotVersion', 1, 'fileName', nullif(btrim(coalesce(p_cv_file_name, '')), '')))),
    (v_id, v_uid, 'jd', jsonb_build_object('text', p_jd_text),
      jsonb_build_object('snapshotVersion', 1, 'analysis', p_analysis));

  IF v_letter IS NOT NULL THEN
    INSERT INTO public.application_documents (application_id, user_id, document_type, content, metadata)
    VALUES (v_id, v_uid, 'cover_letter', jsonb_build_object('text', v_letter),
      jsonb_build_object('snapshotVersion', 1, 'language', p_cover_letter_language));
  END IF;

  RETURN jsonb_build_object('id', v_id, 'created', true);
END;
$$;

REVOKE ALL ON FUNCTION public.save_application(uuid, text, text, text, text, jsonb, text, text, jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_application(uuid, text, text, text, text, jsonb, text, text, jsonb, text, text) TO authenticated;
COMMIT;
