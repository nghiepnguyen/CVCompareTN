-- Per-workload Gemini routing (analyze/rewrite on gemini-3-flash-preview,
-- parse_cv on gemini-3.5-flash-lite) means one price pair no longer fits all
-- rows. Record which model served each call so the Admin > Report tab can
-- price tokens per model, plus the Gemini request latency.
--
-- No backfill: historical rows keep model = NULL. The report treats NULL as
-- gemini-3-flash-preview (the only production model since 2026-07-02, before
-- token tracking began on 2026-07-04) — see src/lib/geminiModels.ts.
--
-- Must be applied BEFORE deploying the code that writes these columns:
-- inserts naming an unknown column fail (silently, by design of
-- logAnalysisAttempt), and the report's select would error.

ALTER TABLE public.analysis_log
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS latency_ms integer;

COMMENT ON COLUMN public.analysis_log.model IS
  'Gemini model id that served this call. NULL for rows before 2026-10-28 (all gemini-3-flash-preview) and for preflight failures where no model ran.';
COMMENT ON COLUMN public.analysis_log.latency_ms IS
  'Wall time of the Gemini generateContent request in ms (excludes auth/quota/PDF extraction). NULL when the call did not complete.';
