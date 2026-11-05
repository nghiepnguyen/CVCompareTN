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

-- ---- follow-up read model (derived; nothing stored on applications) ----
-- Stage anchor: the event that put the app in its current status = newest INSERTED
-- status_changed with to_status = status (transition RPC is the only status writer;
-- CAS serializes transitions per app). Its occurred_at is the anchor value, so a
-- backdated re-apply still anchors on the new episode.
-- Episode scope: contact events count only when inserted at/after the anchor (created_at >=),
-- so an old-episode reply/follow-up cannot control a backdated re-apply.
-- Follow-ups count only when occurring strictly after the reset point; a reply wins a tie.
-- security_invoker: base-table RLS (owner + RESTRICTIVE account_unlocked_read) applies to the caller.
CREATE VIEW public.application_follow_up_state WITH (security_invoker = true) AS
SELECT a.id AS application_id, s.stage_entered_at, c.last_contact_at, n.follow_ups_since_reset,
       c.last_contact_at + interval '7 days' AS follow_up_due_at,
       CASE WHEN n.follow_ups_since_reset >= 2 THEN 'limit_reached'
            WHEN now() >= c.last_contact_at + interval '7 days' THEN 'due'
            ELSE 'waiting' END AS follow_up_state
FROM public.applications a
CROSS JOIN LATERAL (SELECT e.occurred_at AS stage_entered_at, e.created_at AS stage_created_at FROM public.application_events e
  WHERE e.application_id = a.id AND e.event_type = 'status_changed' AND e.to_status = a.status
  ORDER BY e.created_at DESC, e.id DESC LIMIT 1) s
CROSS JOIN LATERAL (SELECT
    max(e.occurred_at) FILTER (WHERE e.event_type = 'contact_received') AS last_reply,
    greatest(s.stage_entered_at, max(e.occurred_at)) AS last_contact_at
  FROM public.application_events e
  WHERE e.application_id = a.id AND e.event_type IN ('follow_up_sent', 'contact_received')
    AND e.created_at >= s.stage_created_at) c  -- current episode only (inserted at/after the anchor)
CROSS JOIN LATERAL (SELECT count(*)::int AS follow_ups_since_reset FROM public.application_events e
  WHERE e.application_id = a.id AND e.event_type = 'follow_up_sent'
    AND e.created_at >= s.stage_created_at
    AND e.occurred_at > greatest(s.stage_entered_at, c.last_reply)) n
WHERE a.status = 'applied';

COMMENT ON VIEW public.application_follow_up_state IS
  'P2C derived follow-up state, one row per applied application: waiting | due (7 days after last contact) | limit_reached (>= 2 unanswered follow-ups). Read-only; never mutation validation.';

-- Supabase default privileges would otherwise grant anon.
REVOKE ALL ON public.application_follow_up_state FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.application_follow_up_state TO authenticated, service_role;

COMMIT;
