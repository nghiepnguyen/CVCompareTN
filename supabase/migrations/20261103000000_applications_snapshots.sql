-- P2A: Save Application + immutable document snapshots.
--
-- applications          = mutable workflow record (P2B adds status changes).
-- application_documents = immutable evidence of the CV / JD / cover letter as
--                         they were when the user clicked "Save application".
--
-- Single write path: public.save_application() (SECURITY DEFINER). Clients get
-- no INSERT/UPDATE on either table, so an application can never exist without
-- its required snapshots and a snapshot can never be edited. Owners may read
-- their rows and delete an application (documents cascade).
-- source_analysis_id is provenance only (history rows are purged/deleted and
-- history.id differs on production); snapshots never re-read history.
BEGIN;

CREATE TABLE public.applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  source_analysis_id text NOT NULL CHECK (char_length(source_analysis_id) BETWEEN 1 AND 100),
  company_name text CHECK (char_length(company_name) BETWEEN 1 AND 200),
  role_title text CHECK (char_length(role_title) BETWEEN 1 AND 200),
  language text NOT NULL CHECK (language IN ('vi', 'en')),
  -- Roadmap P2B status authority; 'drafted' = open, not submitted. P2B widens this.
  status text NOT NULL DEFAULT 'drafted' CHECK (status IN ('drafted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- One application per analysis: retries / double clicks are idempotent.
  CONSTRAINT applications_user_analysis_unique UNIQUE (user_id, source_analysis_id),
  -- Target of the composite FK below (keeps documents.user_id consistent).
  CONSTRAINT applications_id_user_unique UNIQUE (id, user_id)
);

CREATE INDEX applications_user_created_idx ON public.applications (user_id, created_at DESC);

CREATE TABLE public.application_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL,
  user_id uuid NOT NULL,
  document_type text NOT NULL CHECK (document_type IN ('cv', 'jd', 'cover_letter')),
  content jsonb NOT NULL CHECK (jsonb_typeof(content) = 'object' AND octet_length(content::text) <= 262144),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object' AND octet_length(metadata::text) <= 65536),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT application_documents_owner_fk FOREIGN KEY (application_id, user_id)
    REFERENCES public.applications (id, user_id) ON DELETE CASCADE,
  -- P2A: one snapshot per type (also serves as the application_id index).
  CONSTRAINT application_documents_type_unique UNIQUE (application_id, document_type)
);

COMMENT ON TABLE public.applications IS
  'P2A candidate application (mutable workflow state). Written only via save_application().';
COMMENT ON COLUMN public.applications.source_analysis_id IS
  'AnalysisResult.id the application was saved from. Provenance only, not an FK: history rows may be purged.';
COMMENT ON TABLE public.application_documents IS
  'P2A immutable CV/JD/cover-letter snapshots. No UPDATE for anyone; deleted only with the application.';

-- Snapshots are evidence: reject UPDATE for every role, service_role included.
CREATE FUNCTION public.application_documents_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'application_document_immutable' USING ERRCODE = '42501';
END;
$$;
REVOKE ALL ON FUNCTION public.application_documents_immutable() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER application_documents_immutable BEFORE UPDATE ON public.application_documents
  FOR EACH ROW EXECUTE FUNCTION public.application_documents_immutable();

-- Account lock (same guard as every other user table, see 20261101090000).
CREATE TRIGGER account_unlocked BEFORE INSERT OR UPDATE OR DELETE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.enforce_account_unlocked();
CREATE TRIGGER account_unlocked BEFORE INSERT OR UPDATE OR DELETE ON public.application_documents
  FOR EACH ROW EXECUTE FUNCTION public.enforce_account_unlocked();

ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY applications_select_own ON public.applications FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY applications_delete_own ON public.applications FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY application_documents_select_own ON public.application_documents FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY account_unlocked_read ON public.applications AS RESTRICTIVE FOR SELECT TO authenticated
  USING ((SELECT p.has_permission OR p.role='admin' FROM public.profiles AS p WHERE p.id=(SELECT auth.uid())));
CREATE POLICY account_unlocked_read ON public.application_documents AS RESTRICTIVE FOR SELECT TO authenticated
  USING ((SELECT p.has_permission OR p.role='admin' FROM public.profiles AS p WHERE p.id=(SELECT auth.uid())));

-- Supabase default privileges grant ALL to anon/authenticated: narrow them.
REVOKE ALL ON public.applications, public.application_documents FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.applications TO authenticated;
GRANT SELECT ON public.application_documents TO authenticated;
GRANT ALL ON public.applications, public.application_documents TO service_role;

-- Atomic save. Returns {id, created}; created=false means this analysis was
-- already saved and nothing was written (the earlier snapshots stay as they are).
CREATE FUNCTION public.save_application(
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

  IF p_source_analysis_id IS NULL OR char_length(p_source_analysis_id) NOT BETWEEN 1 AND 100
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

  -- The id may not belong to another user's analysis. Not required to exist:
  -- the client's history insert is fire-and-forget and may not have landed.
  IF EXISTS (
    SELECT 1 FROM public.history AS h
    WHERE h.analysis_id = p_source_analysis_id AND h.user_id <> v_uid
  ) THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;

  SELECT a.id INTO v_id FROM public.applications AS a
  WHERE a.user_id = v_uid AND a.source_analysis_id = p_source_analysis_id;
  IF v_id IS NOT NULL THEN
    RETURN jsonb_build_object('id', v_id, 'created', false);
  END IF;

  -- source_analysis_id is client-asserted, so bound what one account can store
  -- (~750 KB max per application). Abuse ceiling, not a plan limit: equals the
  -- paid history retention (500). Lock so concurrent saves cannot overshoot.
  PERFORM pg_advisory_xact_lock(hashtextextended('applications:' || v_uid::text, 0));
  IF (SELECT count(*) FROM public.applications AS a WHERE a.user_id = v_uid) >= 500 THEN
    RAISE EXCEPTION 'application_limit_reached' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.applications (user_id, source_analysis_id, company_name, role_title, language)
  VALUES (v_uid, p_source_analysis_id, v_company, v_role, p_language)
  ON CONFLICT ON CONSTRAINT applications_user_analysis_unique DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT a.id INTO v_id FROM public.applications AS a
    WHERE a.user_id = v_uid AND a.source_analysis_id = p_source_analysis_id;
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

REVOKE ALL ON FUNCTION public.save_application(text, text, text, text, jsonb, text, text, jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_application(text, text, text, text, jsonb, text, text, jsonb, text, text) TO authenticated;

COMMIT;
