-- PROPOSED (P1-D) — NOT A MIGRATION; separate owner approval. RETENTION 30 DAYS
-- IS A PROPOSAL (P1-C), NOT YET APPROVED — change the literal if the owner picks
-- another period. Must stay > the health check lookback (7 days for runs_7d,
-- 26 hours for staleness). cron.job_run_details holds only job status and
-- messages (no user data) and is never purged today (~96 rows/day from
-- storage-cleanup alone). Runs still in progress (end_time IS NULL) are kept.
-- Daily 03:50 Asia/Ho_Chi_Minh (20:50 UTC), after the other nightly jobs.
-- cron.schedule upserts by name.
SELECT cron.schedule('purge-cron-run-details', '50 20 * * *', $$DELETE FROM cron.job_run_details WHERE end_time < now() - interval '30 days'$$);
