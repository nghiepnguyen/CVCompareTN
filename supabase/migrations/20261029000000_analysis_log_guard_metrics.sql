-- Factual-guard telemetry (Stage 3.4): aggregate counters/state of the
-- rewriteSuggestions guard (kind='analyze') and the Full CV validation /
-- retry / fallback flow (kind='rewrite'), written in the same single insert as
-- the rest of the row. Shape (v1) and example queries: docs/11_guard_metrics.md.
--
-- Contains no CV/JD/suggestion/rewrite text, no guard concept or number, no
-- PII — counts, booleans and an enum only. Read access follows the table's
-- existing admin-only RLS.
--
-- No default, no backfill, no index: NULL = telemetry unavailable or not
-- applicable (rows before this migration, parse_cv rows, error rows).
--
-- DEPLOY ORDER: apply this migration and verify the column exists BEFORE
-- deploying the code that writes guard_metrics. An insert naming an unknown
-- column fails, and logAnalysisAttempt swallows the error, so every successful
-- analyze/rewrite row (tokens and cost included) would be silently lost.

ALTER TABLE public.analysis_log
  ADD COLUMN IF NOT EXISTS guard_metrics jsonb;

COMMENT ON COLUMN public.analysis_log.guard_metrics IS
  'Factual-guard telemetry v1, aggregate only (no CV/JD/rewrite content, concepts, numbers or PII). '
  'kind=analyze: {v:1, suggestionGuard:{suggestionsIn, droppedTotal, skills, numeric, rawJd, factualChecks}}. '
  'kind=rewrite: {v:1, fullCv:{validationAttempted, validationSkipped, firstPassValid, firstPassViolations?, '
  'retryOutcome, retryViolations?, fidelityFallback, geminiCalls}}. '
  'NULL = unavailable/not applicable (pre-2026-10-29 rows, parse_cv, errors). See docs/11_guard_metrics.md.';
