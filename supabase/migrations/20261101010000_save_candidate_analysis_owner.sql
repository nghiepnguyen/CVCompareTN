-- P1-1: save_candidate_analysis was callable for any candidate id (service_role handlers
-- only checked authentication). Add p_user_id and enforce campaign ownership.
-- DEPLOY ORDER: this migration -> deploy app (passes p_user_id) -> follow-up migration (new timestamp, created after the app is deployed) drops the 4-arg v1.
-- The 4-arg version is intentionally kept here so the currently deployed app keeps working.
-- auth.uid() is NULL under service_role, so ownership is checked against p_user_id.
CREATE OR REPLACE FUNCTION public.save_candidate_analysis(
  p_user_id uuid,
  p_candidate_id uuid,
  p_analysis_result jsonb,
  p_match_score integer,
  p_status text DEFAULT 'done'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign_id uuid;
BEGIN
  IF p_match_score < 0 OR p_match_score > 100 THEN
    RAISE EXCEPTION 'invalid_match_score' USING ERRCODE = '22023';
  END IF;

  IF p_status NOT IN ('done', 'error') THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '22023';
  END IF;

  SELECT cc.campaign_id INTO v_campaign_id
  FROM public.candidate_cvs AS cc WHERE cc.id = p_candidate_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'candidate_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.recruitment_campaigns AS c
    WHERE c.id = v_campaign_id AND c.user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;

  UPDATE public.candidate_cvs SET
    analysis_result = p_analysis_result,
    match_score = p_match_score,
    score_version = CASE WHEN p_status = 'done' THEN p_analysis_result->>'scoreVersion' ELSE score_version END,
    probability_version = CASE WHEN p_status = 'done' THEN p_analysis_result->>'probabilityVersion' ELSE probability_version END,
    status = p_status,
    analyzed_at = CASE WHEN p_status = 'done' THEN now() ELSE analyzed_at END,
    error_message = CASE WHEN p_status = 'error' THEN p_analysis_result->>'error' ELSE NULL END
  WHERE id = p_candidate_id;

  PERFORM public.sync_campaign_counters(v_campaign_id);
END;
$$;

REVOKE ALL ON FUNCTION public.save_candidate_analysis(uuid, uuid, jsonb, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_candidate_analysis(uuid, uuid, jsonb, integer, text) TO service_role;
