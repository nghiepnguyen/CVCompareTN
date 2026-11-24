-- PROPOSED (P1-B) — row deletion schedule. Apply ONLY with separate production
-- approval for deleting analysis_log rows older than analysis_log_retention_days
-- (seed 400). Until then rows are never deleted (scrub-only). Daily at 03:40
-- Asia/Ho_Chi_Minh (20:40 UTC), after the detail scrub. Upserts by name.
SELECT cron.schedule('purge-analysis-log', '40 20 * * *', 'SELECT public.purge_expired_analysis_log()');
