-- P1-D1 Phase B: daily retention jobs. Apply only AFTER the owner's first
-- production purge has enabled retention (app_settings
-- analysis_log_retention_enabled = true); while the flag is false the purge
-- job fails every run with SQLSTATE 55000 and deletes nothing, by design.
--
-- purge-analysis-log: daily 03:40 Asia/Ho_Chi_Minh (20:40 UTC), after
--   purge-fit-shadow (20:20). Deletes up to 10000 analysis_log rows older than
--   app_settings.analysis_log_retention_days (90), oldest first.
-- purge-cron-run-details: daily 03:50 Asia/Ho_Chi_Minh (20:50 UTC). Keeps 90
--   days of pg_cron run history (cron.job_run_details is never pruned by
--   pg_cron itself).
-- cron.schedule upserts by name: re-running leaves one job each.
SELECT cron.schedule('purge-analysis-log', '40 20 * * *', 'SELECT public.purge_expired_analysis_log()');
SELECT cron.schedule('purge-cron-run-details', '50 20 * * *',
  $$DELETE FROM cron.job_run_details WHERE end_time < now() - interval '90 days'$$);
