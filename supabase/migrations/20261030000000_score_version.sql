-- Stage 3.7: canonical (UI-language-independent) MatchScore. New analyses are
-- scored by one canonical judge and carry a scoreVersion (currently
-- 'canonical-en-v1'). NULL = legacy analysis scored with the UI-language prompt
-- (before 2026-10-30); those scores are not comparable 1:1 and are never
-- rescored. No default, no backfill, no index.
--
-- DEPLOY ORDER: apply this migration and verify the columns BEFORE deploying the
-- app that writes history.score_version, otherwise new history inserts fail.

ALTER TABLE public.history
  ADD COLUMN IF NOT EXISTS score_version text;

ALTER TABLE public.candidate_cvs
  ADD COLUMN IF NOT EXISTS score_version text;

COMMENT ON COLUMN public.history.score_version IS
  'MatchScore scoring version (e.g. canonical-en-v1). NULL = legacy UI-language-coupled scoring.';
COMMENT ON COLUMN public.candidate_cvs.score_version IS
  'MatchScore scoring version of match_score (e.g. canonical-en-v1). NULL = legacy UI-language-coupled scoring.';

-- Same signature, grants and behavior as before; additionally records the
-- scoreVersion carried inside the analysis result (NULL for legacy clients).
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
