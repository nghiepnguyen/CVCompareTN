-- M2-Q Phase 2C: atomic recruiter settlement (audit option D).
-- Design: docs/audits/2026-11-18-m2q-phase2c-quota-commit-recovery.md (audit c49919e)
--         docs/audits/2026-11-18-m2q-phase2c-implementation.md
--
-- /api/analyze used to commit the quota charge and then save the recruiter
-- result in a SECOND transaction. A commit that finished in Postgres after the
-- API had given up (client timeout, lost response) charged the user and lost
-- the result. This RPC does both in ONE transaction, so whenever the charge
-- lands, the result lands with it (or the fence explains why it may not).
--
-- Purely additive: it reuses commit_analytics_quota (charge rules unchanged)
-- and save_candidate_analysis_attempt (fence unchanged) as-is. Both keep their
-- grants and stay callable for the personal path and for app rollback.
--
-- DEPLOY ORDER: this migration -> app. Rollback = previous app; this function
-- is then simply unused.

CREATE FUNCTION public.commit_analytics_quota_and_save_candidate(
  p_user_id uuid,
  p_reservation_id uuid,
  p_candidate_id uuid,
  p_attempt_id uuid,
  p_analysis_result jsonb,
  p_match_score numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_commit jsonb;
  v_save jsonb;
  v_sqlstate text;
BEGIN
  -- 1. Charge exactly as commit_analytics_quota does (same argument checks,
  --    profiles lock first, idempotent by reservation). Not conditional on the
  --    candidate: Gemini already ran for this reservation.
  v_commit := public.commit_analytics_quota(p_user_id, p_reservation_id);
  IF v_commit->>'status' IS DISTINCT FROM 'committed' THEN
    RETURN v_commit || jsonb_build_object('save', 'skipped');
  END IF;

  -- 2. Fenced save in a subtransaction: any error here (row gone, other
  --    account, bad score, ...) rolls back ONLY the save and keeps the charge.
  --    query_canceled (statement timeout) is not caught by OTHERS and still
  --    rolls back the whole call, charge included (nothing half-done).
  BEGIN
    IF p_candidate_id IS NULL OR p_attempt_id IS NULL THEN
      -- A NULL attempt would match legacy unowned rows in the fenced save.
      RAISE EXCEPTION 'invalid_arguments' USING ERRCODE = '22023';
    END IF;
    v_save := public.save_candidate_analysis_attempt(
      p_user_id, p_candidate_id, p_attempt_id, p_analysis_result,
      -- match_score is an integer column; the result JSON keeps the exact value.
      round(p_match_score)::integer);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    RETURN v_commit || jsonb_build_object('save', 'failed', 'save_error', v_sqlstate);
  END;

  RETURN v_commit || jsonb_build_object(
    'save', v_save->>'result',
    'save_replay', COALESCE((v_save->>'replay')::boolean, false));
END;
$$;

COMMENT ON FUNCTION public.commit_analytics_quota_and_save_candidate(uuid, uuid, uuid, uuid, jsonb, numeric) IS
  'M2-Q 2C: commit_analytics_quota + fenced save_candidate_analysis_attempt in one transaction (save in a subtransaction). service_role only; p_user_id must come from the verified JWT.';

-- Supabase default privileges grant EXECUTE to PUBLIC/anon/authenticated on
-- new functions: revoke explicitly, then grant only the server.
REVOKE ALL ON FUNCTION public.commit_analytics_quota_and_save_candidate(uuid, uuid, uuid, uuid, jsonb, numeric)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.commit_analytics_quota_and_save_candidate(uuid, uuid, uuid, uuid, jsonb, numeric)
  TO service_role;
