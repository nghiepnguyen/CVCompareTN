-- P2B: Application Tracker + append-only application_events.
--
-- applications        = mutable workflow record. Status, company/role and deadline
--                       change only through the RPCs below (no client UPDATE grant).
-- application_events  = append-only timeline: created | status_changed | note |
--                       details_updated. No UPDATE for anyone, no client INSERT/DELETE.
-- application_documents (P2A) stay untouched and immutable.
--
-- Status transition authority: public.application_status_transition_allowed(),
-- which must equal supabase/application_status_transitions.json (the client reads
-- that file; supabase/tests/application_tracker.test.sql checks all 81 pairs).
-- Every P2B mutation bumps applications.updated_at, so it is the "last activity".
--
-- Rollback: app-first. Once users have non-drafted statuses or events, the P2A
-- status CHECK cannot be restored; leave this schema dormant (docs/15_applications.md).
BEGIN;

-- ---- applications: nine canonical statuses, deadline, first applied date ----
ALTER TABLE public.applications DROP CONSTRAINT applications_status_check;
ALTER TABLE public.applications ADD CONSTRAINT applications_status_check CHECK (status IN (
  'drafted', 'applied', 'interview', 'offer', 'hired', 'rejected', 'no_response', 'offer_declined', 'withdrawn'));
ALTER TABLE public.applications
  ADD COLUMN deadline date CHECK (deadline BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'),
  ADD COLUMN applied_at timestamptz;

COMMENT ON COLUMN public.applications.applied_at IS
  'occurred_at of the first recorded transition to applied. Set once by transition_application_status(); never rewritten by later corrections, so it is historical, not a "currently submitted" signal.';
COMMENT ON COLUMN public.applications.updated_at IS
  'Bumped by every P2B mutation (status, note, details): the tracker''s "last activity".';

-- Tracker list default order (updated_at DESC, id DESC).
CREATE INDEX applications_user_updated_idx ON public.applications (user_id, updated_at DESC, id DESC);

-- ---- status transition authority (mirrors supabase/application_status_transitions.json) ----
CREATE FUNCTION public.application_status_transition_allowed(p_from text, p_to text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM (VALUES
      ('drafted', 'applied'), ('drafted', 'withdrawn'),
      ('applied', 'drafted'), ('applied', 'interview'), ('applied', 'rejected'), ('applied', 'no_response'), ('applied', 'withdrawn'),
      ('interview', 'applied'), ('interview', 'offer'), ('interview', 'rejected'), ('interview', 'no_response'), ('interview', 'withdrawn'),
      ('offer', 'interview'), ('offer', 'hired'), ('offer', 'rejected'), ('offer', 'offer_declined'), ('offer', 'withdrawn'),
      ('hired', 'offer'),
      ('rejected', 'applied'), ('rejected', 'interview'), ('rejected', 'offer'),
      ('no_response', 'applied'), ('no_response', 'interview'), ('no_response', 'rejected'),
      ('offer_declined', 'offer'),
      ('withdrawn', 'drafted'), ('withdrawn', 'applied'), ('withdrawn', 'interview'), ('withdrawn', 'offer')
    ) AS t (from_status, to_status)
    WHERE t.from_status = p_from AND t.to_status = p_to
  );
$$;
REVOKE ALL ON FUNCTION public.application_status_transition_allowed(text, text) FROM PUBLIC, anon, authenticated;

-- ---- application_events ----
CREATE TABLE public.application_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL,
  user_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('created', 'status_changed', 'note', 'details_updated')),
  from_status text CHECK (from_status IN ('drafted', 'applied', 'interview', 'offer', 'hired', 'rejected', 'no_response', 'offer_declined', 'withdrawn')),
  to_status text CHECK (to_status IN ('drafted', 'applied', 'interview', 'offer', 'hired', 'rejected', 'no_response', 'offer_declined', 'withdrawn')),
  note text CHECK (char_length(note) BETWEEN 1 AND 2000),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object' AND octet_length(metadata::text) <= 4096),
  occurred_at timestamptz NOT NULL,
  idempotency_key uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT application_events_owner_fk FOREIGN KEY (application_id, user_id)
    REFERENCES public.applications (id, user_id) ON DELETE CASCADE,
  -- One event per user intent: retries of that intent reuse the key.
  CONSTRAINT application_events_user_idempotency_unique UNIQUE (user_id, idempotency_key),
  CONSTRAINT application_events_shape CHECK (CASE event_type
    WHEN 'status_changed' THEN from_status IS NOT NULL AND to_status IS NOT NULL AND from_status <> to_status
    WHEN 'note' THEN note IS NOT NULL AND from_status IS NULL AND to_status IS NULL
    WHEN 'details_updated' THEN note IS NULL AND from_status IS NULL AND to_status IS NULL
      AND jsonb_typeof(metadata -> 'changedFields') = 'array'
    ELSE note IS NULL AND from_status IS NULL AND to_status IS NULL END)
);

CREATE UNIQUE INDEX application_events_one_created ON public.application_events (application_id) WHERE event_type = 'created';
CREATE INDEX application_events_timeline_idx ON public.application_events (application_id, occurred_at DESC, created_at DESC);

COMMENT ON TABLE public.application_events IS
  'P2B append-only application timeline. Written only by save_application / transition_application_status / add_application_note / update_application_details.';

-- Same strict invariant as application_documents: no UPDATE for any role.
CREATE FUNCTION public.application_events_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'application_event_immutable' USING ERRCODE = '42501';
END;
$$;
REVOKE ALL ON FUNCTION public.application_events_immutable() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER application_events_immutable BEFORE UPDATE ON public.application_events
  FOR EACH ROW EXECUTE FUNCTION public.application_events_immutable();
CREATE TRIGGER account_unlocked BEFORE INSERT OR UPDATE OR DELETE ON public.application_events
  FOR EACH ROW EXECUTE FUNCTION public.enforce_account_unlocked();

ALTER TABLE public.application_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY application_events_select_own ON public.application_events FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY account_unlocked_read ON public.application_events AS RESTRICTIVE FOR SELECT TO authenticated
  USING ((SELECT p.has_permission OR p.role='admin' FROM public.profiles AS p WHERE p.id=(SELECT auth.uid())));

REVOKE ALL ON public.application_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.application_events TO authenticated;
GRANT ALL ON public.application_events TO service_role;

-- ---- backfill: one created event per existing (P2A) application; idempotent ----
INSERT INTO public.application_events (application_id, user_id, event_type, occurred_at, idempotency_key, created_at)
SELECT a.id, a.user_id, 'created', a.created_at, a.idempotency_key, a.created_at
FROM public.applications AS a
ON CONFLICT (application_id) WHERE event_type = 'created' DO NOTHING;

-- ---- save_application: P2A contract unchanged, plus the created event ----
-- Previous body: 20261103000000_applications_snapshots.sql (rollback: re-run that
-- CREATE FUNCTION as CREATE OR REPLACE; see docs/15_applications.md).
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

  -- P2B: the timeline starts in the same transaction (occurred_at = applications.created_at).
  INSERT INTO public.application_events (application_id, user_id, event_type, occurred_at, idempotency_key)
  VALUES (v_id, v_uid, 'created', now(), p_idempotency_key);

  RETURN jsonb_build_object('id', v_id, 'created', true);
END;
$$;

REVOKE ALL ON FUNCTION public.save_application(uuid, text, text, text, text, jsonb, text, text, jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_application(uuid, text, text, text, text, jsonb, text, text, jsonb, text, text) TO authenticated;

-- ---- shared guard for the tracker RPCs ----
-- Explicit (not only the table triggers) so a locked caller never learns whether an
-- application exists or an intent was already recorded. Invoker: only called from
-- the DEFINER RPCs below (clients have no EXECUTE).
CREATE FUNCTION public.application_tracker_caller()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = v_uid AND (p.has_permission OR p.role = 'admin')) THEN
    RAISE EXCEPTION 'account_locked' USING ERRCODE = '42501';
  END IF;
  RETURN v_uid;
END;
$$;
REVOKE ALL ON FUNCTION public.application_tracker_caller() FROM PUBLIC, anon, authenticated;

-- ---- status transition ----
-- Order: caller -> input -> serialize on (user, key) -> replay -> lock row -> CAS
-- -> matrix -> write. Serializing before the replay lookup makes a retry of a
-- committed intent (or a parallel duplicate) replay instead of hitting stale_status.
CREATE FUNCTION public.transition_application_status(
  p_application_id uuid,
  p_expected_status text,
  p_to_status text,
  p_occurred_at timestamptz,
  p_note text,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := public.application_tracker_caller();
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_at timestamptz := coalesce(p_occurred_at, now());
  v_status text;
  v_event uuid;
BEGIN
  IF p_application_id IS NULL OR p_idempotency_key IS NULL
     OR p_expected_status IS NULL OR p_to_status IS NULL
     OR p_expected_status NOT IN ('drafted', 'applied', 'interview', 'offer', 'hired', 'rejected', 'no_response', 'offer_declined', 'withdrawn')
     OR p_to_status NOT IN ('drafted', 'applied', 'interview', 'offer', 'hired', 'rejected', 'no_response', 'offer_declined', 'withdrawn') THEN
    RAISE EXCEPTION 'invalid_transition' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_note) > 2000 THEN
    RAISE EXCEPTION 'invalid_note' USING ERRCODE = '22023';
  END IF;
  -- Past dates are allowed (tracker updated after the fact); 5 min clock-skew tolerance.
  IF v_at > now() + interval '5 minutes' OR v_at < now() - interval '10 years' THEN
    RAISE EXCEPTION 'invalid_occurred_at' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('application_events:' || v_uid::text || ':' || p_idempotency_key::text, 0));
  SELECT e.id INTO v_event FROM public.application_events AS e
  WHERE e.user_id = v_uid AND e.idempotency_key = p_idempotency_key;
  IF v_event IS NOT NULL THEN
    RETURN jsonb_build_object('event_id', v_event, 'replayed', true);
  END IF;

  SELECT a.status INTO v_status FROM public.applications AS a
  WHERE a.id = p_application_id AND a.user_id = v_uid
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'application_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_status <> p_expected_status THEN
    RAISE EXCEPTION 'stale_status' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.application_status_transition_allowed(v_status, p_to_status) THEN
    RAISE EXCEPTION 'invalid_transition' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.applications AS a
  SET status = p_to_status,
      updated_at = now(),
      applied_at = CASE WHEN p_to_status = 'applied' AND a.applied_at IS NULL THEN v_at ELSE a.applied_at END
  WHERE a.id = p_application_id;

  INSERT INTO public.application_events (application_id, user_id, event_type, from_status, to_status, note, occurred_at, idempotency_key)
  VALUES (p_application_id, v_uid, 'status_changed', v_status, p_to_status, v_note, v_at, p_idempotency_key)
  RETURNING id INTO v_event;

  RETURN jsonb_build_object('event_id', v_event, 'replayed', false);
END;
$$;

-- ---- note ----
CREATE FUNCTION public.add_application_note(
  p_application_id uuid,
  p_note text,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := public.application_tracker_caller();
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_event uuid;
BEGIN
  IF p_application_id IS NULL OR p_idempotency_key IS NULL OR v_note IS NULL OR char_length(v_note) > 2000 THEN
    RAISE EXCEPTION 'invalid_note' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('application_events:' || v_uid::text || ':' || p_idempotency_key::text, 0));
  SELECT e.id INTO v_event FROM public.application_events AS e
  WHERE e.user_id = v_uid AND e.idempotency_key = p_idempotency_key;
  IF v_event IS NOT NULL THEN
    RETURN jsonb_build_object('event_id', v_event, 'replayed', true);
  END IF;

  UPDATE public.applications AS a SET updated_at = now()
  WHERE a.id = p_application_id AND a.user_id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'application_not_found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.application_events (application_id, user_id, event_type, note, occurred_at, idempotency_key)
  VALUES (p_application_id, v_uid, 'note', v_note, now(), p_idempotency_key)
  RETURNING id INTO v_event;

  RETURN jsonb_build_object('event_id', v_event, 'replayed', false);
END;
$$;

-- ---- details (company / role / deadline) ----
-- Full replacement of the three fields; NULL / blank clears. A no-op writes nothing.
-- Event metadata holds only the changed fields: {"changedFields":[...], "<field>":{"from","to"}}.
CREATE FUNCTION public.update_application_details(
  p_application_id uuid,
  p_company_name text,
  p_role_title text,
  p_deadline date,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := public.application_tracker_caller();
  v_company text := nullif(btrim(coalesce(p_company_name, '')), '');
  v_role text := nullif(btrim(coalesce(p_role_title, '')), '');
  v_app public.applications%ROWTYPE;
  v_changed text[] := ARRAY[]::text[];
  v_meta jsonb := '{}'::jsonb;
  v_event uuid;
BEGIN
  IF p_application_id IS NULL OR p_idempotency_key IS NULL
     OR char_length(v_company) > 200 OR char_length(v_role) > 200
     OR p_deadline NOT BETWEEN DATE '2000-01-01' AND DATE '2100-12-31' THEN
    RAISE EXCEPTION 'invalid_details' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('application_events:' || v_uid::text || ':' || p_idempotency_key::text, 0));
  SELECT e.id INTO v_event FROM public.application_events AS e
  WHERE e.user_id = v_uid AND e.idempotency_key = p_idempotency_key;
  IF v_event IS NOT NULL THEN
    RETURN jsonb_build_object('event_id', v_event, 'changed', true, 'replayed', true);
  END IF;

  SELECT * INTO v_app FROM public.applications AS a
  WHERE a.id = p_application_id AND a.user_id = v_uid
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'application_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_app.company_name IS DISTINCT FROM v_company THEN
    v_changed := array_append(v_changed, 'company_name');
    v_meta := v_meta || jsonb_build_object('company_name', jsonb_build_object('from', v_app.company_name, 'to', v_company));
  END IF;
  IF v_app.role_title IS DISTINCT FROM v_role THEN
    v_changed := array_append(v_changed, 'role_title');
    v_meta := v_meta || jsonb_build_object('role_title', jsonb_build_object('from', v_app.role_title, 'to', v_role));
  END IF;
  IF v_app.deadline IS DISTINCT FROM p_deadline THEN
    v_changed := array_append(v_changed, 'deadline');
    v_meta := v_meta || jsonb_build_object('deadline', jsonb_build_object('from', v_app.deadline, 'to', p_deadline));
  END IF;
  IF cardinality(v_changed) = 0 THEN
    RETURN jsonb_build_object('event_id', NULL, 'changed', false, 'replayed', false);
  END IF;

  UPDATE public.applications AS a
  SET company_name = v_company, role_title = v_role, deadline = p_deadline, updated_at = now()
  WHERE a.id = p_application_id;

  INSERT INTO public.application_events (application_id, user_id, event_type, metadata, occurred_at, idempotency_key)
  VALUES (p_application_id, v_uid, 'details_updated', v_meta || jsonb_build_object('changedFields', to_jsonb(v_changed)), now(), p_idempotency_key)
  RETURNING id INTO v_event;

  RETURN jsonb_build_object('event_id', v_event, 'changed', true, 'replayed', false);
END;
$$;

REVOKE ALL ON FUNCTION public.transition_application_status(uuid, text, text, timestamptz, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.add_application_note(uuid, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_application_details(uuid, text, text, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_application_status(uuid, text, text, timestamptz, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_application_note(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_application_details(uuid, text, text, date, uuid) TO authenticated;

COMMIT;
