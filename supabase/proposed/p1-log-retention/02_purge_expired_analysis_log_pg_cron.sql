-- PROPOSED (P1) — see 01_purge_expired_analysis_log.sql. Daily at 03:30
-- Asia/Ho_Chi_Minh (20:30 UTC), after purge-fit-shadow (20:20). cron.schedule
-- upserts by name: one job.
SELECT cron.schedule('purge-analysis-log', '30 20 * * *', 'SELECT public.purge_expired_analysis_log()');
