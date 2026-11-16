-- M2-D3: recruiter candidate analysis ownership + stale-analyzing recovery.
-- Design: docs/audits/2026-11-16-m2d3-stale-analysis-recovery.md
--
-- analysis_attempt_id is the same UUID the client sends to /api/analyze as
-- its idempotencyKey, so analytics_quota_reservations (user_id, request_key)
-- is the durable evidence of whether that attempt reached Gemini and was
-- charged. No lease/state columns: lease = analysis_started_at + lease
-- seconds; outcome = the ledger row. Quota RPCs and the ledger are untouched
-- (read only, no profiles lock, no expiry sweep).
--
-- DEPLOY ORDER: this migration -> app. Purely additive: the deployed app
-- keeps using direct status writes and the 5-arg save_candidate_analysis.

ALTER TABLE public.candidate_cvs
  ADD COLUMN analysis_started_at timestamptz,
  ADD COLUMN analysis_attempt_id uuid;

COMMENT ON COLUMN public.candidate_cvs.analysis_started_at IS
  'M2-D3: when the current/last attempt claimed the row (server clock). Lease = this + candidate_analysis_lease_seconds().';
COMMENT ON COLUMN public.candidate_cvs.analysis_attempt_id IS
  'M2-D3: owner token of the current/last attempt; equals the /api/analyze idempotency key (ledger request_key).';

-- Lease length. Change it with a new migration; the client mirrors it only as a UI hint.
CREATE FUNCTION public.candidate_analysis_lease_seconds()
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = '' AS $$ SELECT 600 $$;

-- Atomically take ownership of one candidate for a new analysis attempt.
-- result: claimed | active | needs_confirm | done | not_found
-- needs_confirm.reason: paid_result_lost (ledger committed: Gemini delivered,
-- result never saved) | outcome_unknown (uncertain / expired reservation /
-- legacy analyzing row without attempt id). Only p_confirm_charge = true
-- claims those, so a possibly charged attempt is never re-run silently.
CREATE FUNCTION public.claim_candidate_analysis(
  p_candidate_id uuid,
  p_attempt_id uuid,
  p_confirm_charge boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_lease integer := public.candidate_analysis_lease_seconds();
  v_row record;
  v_ledger record;
  v_reason text;
  v_started timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_candidate_id IS NULL OR p_attempt_id IS NULL OR p_confirm_charge IS NULL THEN
    RAISE EXCEPTION 'invalid_arguments' USING ERRCODE = '22023';
  END IF;

  -- Row lock serializes claims for this candidate (two tabs, double clicks).
  SELECT cc.status, cc.analysis_attempt_id, cc.analysis_started_at INTO v_row
    FROM public.candidate_cvs AS cc
    JOIN public.recruitment_campaigns AS c ON c.id = cc.campaign_id
   WHERE cc.id = p_candidate_id AND c.user_id = v_uid AND cc.storage_status = 'ready'
     FOR UPDATE OF cc;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('result', 'not_found');
  END IF;

  IF v_row.status = 'done' THEN
    RETURN jsonb_build_object('result', 'done');
  END IF;
  IF v_row.analysis_attempt_id = p_attempt_id THEN
    RAISE EXCEPTION 'attempt_reused' USING ERRCODE = '22023';
  END IF;

  IF v_row.status = 'analyzing' AND v_row.analysis_started_at > now() - make_interval(secs => v_lease) THEN
    RETURN jsonb_build_object('result', 'active', 'started_at', v_row.analysis_started_at);
  END IF;

  IF v_row.status IN ('analyzing', 'error') THEN
    IF v_row.analysis_attempt_id IS NULL THEN
      -- Legacy rows (written before M2-D3). error keeps the M2-D2 behaviour
      -- (retry on click); analyzing has no evidence at all.
      v_reason := CASE WHEN v_row.status = 'analyzing' THEN 'outcome_unknown' END;
    ELSE
      SELECT r.state, r.expires_at INTO v_ledger
        FROM public.analytics_quota_reservations AS r
       WHERE r.user_id = v_uid AND r.request_key = v_row.analysis_attempt_id;
      IF NOT FOUND OR v_ledger.state = 'refunded' THEN
        -- Reservation precedes Gemini and fails closed: no row = never ran;
        -- refunded = no result can exist and nothing was charged.
        v_reason := NULL;
      ELSIF v_ledger.state = 'committed' THEN
        v_reason := 'paid_result_lost';
      ELSIF v_ledger.state = 'reserved' AND v_ledger.expires_at > now() THEN
        -- The server may still be running this attempt.
        RETURN jsonb_build_object('result', 'active', 'started_at', v_row.analysis_started_at);
      ELSE
        v_reason := 'outcome_unknown';
      END IF;
    END IF;
  END IF;

  IF v_reason IS NOT NULL AND NOT p_confirm_charge THEN
    RETURN jsonb_build_object('result', 'needs_confirm', 'reason', v_reason);
  END IF;

  UPDATE public.candidate_cvs
     SET status = 'analyzing',
         analysis_attempt_id = p_attempt_id,
         analysis_started_at = now(),
         error_message = NULL
   WHERE id = p_candidate_id
  RETURNING analysis_started_at INTO v_started;

  RETURN jsonb_build_object(
    'result', 'claimed',
    'started_at', v_started,
    'lease_seconds', v_lease,
    'recovered', v_reason);
END;
$$;

-- Fenced save (service_role, called by /api/recruiter/save-analysis with the
-- verified user id). A paid result is kept whenever possible: it is written
-- unless the row is already 'done' under a different attempt (rule 8: never
-- overwrite a newer saved result). Same attempt already done = idempotent replay.
CREATE FUNCTION public.save_candidate_analysis_attempt(
  p_user_id uuid,
  p_candidate_id uuid,
  p_attempt_id uuid,
  p_analysis_result jsonb,
  p_match_score integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row record;
BEGIN
  IF p_user_id IS NULL OR p_candidate_id IS NULL OR p_attempt_id IS NULL OR p_analysis_result IS NULL THEN
    RAISE EXCEPTION 'invalid_arguments' USING ERRCODE = '22023';
  END IF;
  IF p_match_score IS NULL OR p_match_score < 0 OR p_match_score > 100 THEN
    RAISE EXCEPTION 'invalid_match_score' USING ERRCODE = '22023';
  END IF;

  SELECT cc.campaign_id, cc.status, cc.analysis_attempt_id INTO v_row
    FROM public.candidate_cvs AS cc WHERE cc.id = p_candidate_id
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'candidate_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.recruitment_campaigns AS c
     WHERE c.id = v_row.campaign_id AND c.user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;

  IF v_row.status = 'done' THEN
    IF v_row.analysis_attempt_id IS NOT DISTINCT FROM p_attempt_id THEN
      RETURN jsonb_build_object('result', 'saved', 'replay', true);
    END IF;
    RETURN jsonb_build_object('result', 'superseded');
  END IF;

  UPDATE public.candidate_cvs SET
    analysis_result = p_analysis_result,
    match_score = p_match_score,
    score_version = p_analysis_result->>'scoreVersion',
    probability_version = p_analysis_result->>'probabilityVersion',
    status = 'done',
    analyzed_at = now(),
    error_message = NULL,
    analysis_attempt_id = p_attempt_id
  WHERE id = p_candidate_id;

  PERFORM public.sync_campaign_counters(v_row.campaign_id);
  RETURN jsonb_build_object('result', 'saved', 'replay', false);
END;
$$;

-- Supabase default privileges grant EXECUTE to PUBLIC/anon/authenticated on
-- new functions: revoke explicitly, then grant only the intended caller.
REVOKE ALL ON FUNCTION public.candidate_analysis_lease_seconds() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.claim_candidate_analysis(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.save_candidate_analysis_attempt(uuid, uuid, uuid, jsonb, integer) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.claim_candidate_analysis(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_candidate_analysis_attempt(uuid, uuid, uuid, jsonb, integer) TO service_role;
