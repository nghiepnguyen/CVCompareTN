-- Idempotent patch: add parsed_cv to history if your database predates structured Parsed CV storage.
-- Safe to run after `20260516120000_cv_matcher_core_schema.sql` (no-op if column exists).
-- Run alone ONLY if table `public.history` already exists.

ALTER TABLE public.history
  ADD COLUMN IF NOT EXISTS parsed_cv jsonb;

COMMENT ON COLUMN public.history.parsed_cv IS 'Structured ParsedCV JSON from Gemini (see src/services/ai/types.ts ParsedCV)';
