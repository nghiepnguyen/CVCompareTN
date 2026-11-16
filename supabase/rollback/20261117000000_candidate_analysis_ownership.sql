-- Rollback for 20261117000000_candidate_analysis_ownership.sql (M2-D3).
--
-- ORDER: roll back the app FIRST (the M2-D3 client calls
-- claim_candidate_analysis and sends attemptId to save-analysis; without the
-- functions every claim fails and the client skips the candidate: no analysis,
-- no charge, but recruiter analysis stops). Then run this file, then:
--   supabase migration repair --status reverted 20261117000000
-- before any re-apply.
--
-- Data effect: drops the attempt evidence. Rows left 'analyzing' stay
-- 'analyzing' (pre-M2-D3 behaviour: not retryable from the UI). Saved results
-- (analysis_result, match_score, status 'done') are untouched. Quota ledger
-- and profiles.usage_count are untouched.

BEGIN;
DROP FUNCTION IF EXISTS public.claim_candidate_analysis(uuid, uuid, boolean);
DROP FUNCTION IF EXISTS public.save_candidate_analysis_attempt(uuid, uuid, uuid, jsonb, integer);
DROP FUNCTION IF EXISTS public.candidate_analysis_lease_seconds();
ALTER TABLE public.candidate_cvs
  DROP COLUMN IF EXISTS analysis_attempt_id,
  DROP COLUMN IF EXISTS analysis_started_at;
COMMIT;
