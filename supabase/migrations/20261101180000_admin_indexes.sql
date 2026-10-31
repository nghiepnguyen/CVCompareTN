-- B2: indexes backing the Admin Users list and Report aggregates.
-- Keep these additive and idempotent; production profiles/analysis_log are far
-- below the size where a plain CREATE INDEX needs CONCURRENTLY (migrations run
-- in a transaction, so CONCURRENTLY is not available here).

CREATE INDEX IF NOT EXISTS idx_profiles_created_at
  ON public.profiles (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_profiles_is_new
  ON public.profiles (is_new)
  WHERE is_new;

CREATE INDEX IF NOT EXISTS idx_analysis_log_kind_created_status
  ON public.analysis_log (kind, created_at DESC, status);
