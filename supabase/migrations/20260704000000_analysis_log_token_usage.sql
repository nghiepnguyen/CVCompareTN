-- Track Gemini token usage per AI call for the Admin > Report tab (token &
-- cost stats). One "analysis" run in the app fires 3 independent Gemini
-- calls: /api/analyze (kind='analyze', synchronous), then /api/parse-cv and
-- /api/rewrite-cv fire-and-forget right after (see
-- src/context/analysis/AnalysisRunContext.tsx). `kind` lets the report query
-- keep counting only 'analyze' rows as "analyses" (unchanged behavior) while
-- summing tokens across all three kinds for cost reporting.

ALTER TABLE public.analysis_log
  ADD COLUMN kind text NOT NULL DEFAULT 'analyze'
    CHECK (kind IN ('analyze', 'parse_cv', 'rewrite')),
  ADD COLUMN input_tokens integer NOT NULL DEFAULT 0,
  ADD COLUMN output_tokens integer NOT NULL DEFAULT 0,
  ADD COLUMN total_tokens integer GENERATED ALWAYS AS (input_tokens + output_tokens) STORED;

CREATE INDEX analysis_log_kind_idx ON public.analysis_log (kind);

COMMENT ON COLUMN public.analysis_log.kind IS
  'Which Gemini call this row logs: analyze (main match), parse_cv, or rewrite (both auto-triggered after a successful analyze).';
COMMENT ON COLUMN public.analysis_log.input_tokens IS 'Gemini usageMetadata.promptTokenCount for this call.';
COMMENT ON COLUMN public.analysis_log.output_tokens IS 'Gemini usageMetadata.candidatesTokenCount + thoughtsTokenCount for this call.';
