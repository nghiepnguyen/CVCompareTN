-- Stage 3.13C: canonical probability contract (CONTRACT A — score only).
-- New analyses derive passProbability from the canonical matchScore
-- (>=80 High, >=60 Medium, else Low) and carry probabilityVersion
-- 'canonical-score-v1'. NULL = legacy row with model-authored probability;
-- legacy rows are never recomputed, rescored or silently upgraded on read.
-- No default, no backfill, no index.
--
-- DEPLOY ORDER: apply this migration and verify both columns BEFORE deploying
-- the app that writes probability_version (history inserts and the recruiter
-- RPC would otherwise fail).
--
-- See docs/audits/stage-3.13b-canonical-probability-contract.md.

ALTER TABLE public.history
  ADD COLUMN IF NOT EXISTS probability_version text;

ALTER TABLE public.candidate_cvs
  ADD COLUMN IF NOT EXISTS probability_version text;

COMMENT ON COLUMN public.history.probability_version IS
  'Canonical probability contract version (e.g. canonical-score-v1). NULL = legacy model-authored probability.';
COMMENT ON COLUMN public.candidate_cvs.probability_version IS
  'Canonical probability contract version of passProbability (e.g. canonical-score-v1). NULL = legacy model-authored probability.';

-- Same signature, grants and behavior as before; additionally records the
-- probabilityVersion carried inside the analysis result (NULL for legacy
-- clients/results). Error saves keep the previous version.
CREATE OR REPLACE FUNCTION public.save_candidate_analysis(
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

  UPDATE public.candidate_cvs SET
    analysis_result = p_analysis_result,
    match_score = p_match_score,
    score_version = CASE WHEN p_status = 'done' THEN p_analysis_result->>'scoreVersion' ELSE score_version END,
    probability_version = CASE WHEN p_status = 'done' THEN p_analysis_result->>'probabilityVersion' ELSE probability_version END,
    status = p_status,
    analyzed_at = CASE WHEN p_status = 'done' THEN now() ELSE analyzed_at END,
    error_message = CASE WHEN p_status = 'error' THEN p_analysis_result->>'error' ELSE NULL END
  WHERE id = p_candidate_id
  RETURNING campaign_id INTO v_campaign_id;

  IF FOUND THEN
    PERFORM public.sync_campaign_counters(v_campaign_id);
  END IF;
END;
$$;
