-- P2C: follow_up_sent / contact_received timeline events + log_application_contact().
--
-- Mutation authority only: two append-only event types written by one DEFINER RPC.
-- No columns on applications, no derived follow-up state here (read model is later).
-- Allowed statuses: applied / interview / offer. drafted and the final statuses in
-- supabase/application_status_transitions.json are rejected (contact_not_allowed);
-- supabase/tests/application_follow_up.test.sql checks every JSON status.
--
-- Rollback: app-first. Once contact events exist the P2B CHECKs cannot be restored;
-- leave the RPC dormant (REVOKE EXECUTE) instead.
BEGIN;

-- ---- event types: inline P2B CHECK (auto-named application_events_event_type_check) ----
ALTER TABLE public.application_events DROP CONSTRAINT application_events_event_type_check;
ALTER TABLE public.application_events ADD CONSTRAINT application_events_event_type_check CHECK (event_type IN (
  'created', 'status_changed', 'note', 'details_updated', 'follow_up_sent', 'contact_received'));

-- ---- shape: P2B branches unchanged ('created' = the old ELSE); unknown types fail closed ----
ALTER TABLE public.application_events DROP CONSTRAINT application_events_shape;
ALTER TABLE public.application_events ADD CONSTRAINT application_events_shape CHECK (CASE event_type
  WHEN 'created' THEN note IS NULL AND from_status IS NULL AND to_status IS NULL
  WHEN 'status_changed' THEN from_status IS NOT NULL AND to_status IS NOT NULL AND from_status <> to_status
  WHEN 'note' THEN note IS NOT NULL AND from_status IS NULL AND to_status IS NULL
  WHEN 'details_updated' THEN note IS NULL AND from_status IS NULL AND to_status IS NULL
    AND jsonb_typeof(metadata -> 'changedFields') = 'array'
  WHEN 'follow_up_sent' THEN from_status IS NULL AND to_status IS NULL
  WHEN 'contact_received' THEN from_status IS NULL AND to_status IS NULL
  ELSE false END);

COMMENT ON TABLE public.application_events IS
  'P2B append-only application timeline. Written only by save_application / transition_application_status / add_application_note / update_application_details / log_application_contact.';

-- ---- contact log ----
-- Order mirrors add_application_note + transition_application_status: caller -> input
-- -> serialize on (user, key) (same namespace: replay shared with P2B intents) -> replay
-- -> lock row -> status gate -> bump updated_at -> insert.
CREATE FUNCTION public.log_application_contact(
  p_application_id uuid,
  p_event_type text,
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
     OR p_event_type IS NULL OR p_event_type NOT IN ('follow_up_sent', 'contact_received') THEN
    RAISE EXCEPTION 'invalid_contact' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_note) > 2000 THEN
    RAISE EXCEPTION 'invalid_note' USING ERRCODE = '22023';
  END IF;
  -- Same bounds as transition_application_status: past allowed, 5 min clock skew.
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
  -- Allow-list: drafted and every final status are rejected; a new status fails closed.
  IF v_status NOT IN ('applied', 'interview', 'offer') THEN
    RAISE EXCEPTION 'contact_not_allowed' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.applications AS a SET updated_at = now()
  WHERE a.id = p_application_id;

  INSERT INTO public.application_events (application_id, user_id, event_type, note, occurred_at, idempotency_key)
  VALUES (p_application_id, v_uid, p_event_type, v_note, v_at, p_idempotency_key)
  RETURNING id INTO v_event;

  RETURN jsonb_build_object('event_id', v_event, 'replayed', false);
END;
$$;

REVOKE ALL ON FUNCTION public.log_application_contact(uuid, text, timestamptz, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_application_contact(uuid, text, timestamptz, text, uuid) TO authenticated;

COMMIT;
