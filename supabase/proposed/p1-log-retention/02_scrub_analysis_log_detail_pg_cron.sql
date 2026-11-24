-- PROPOSED (P1-B) — see 01_purge_expired_analysis_log.sql. Detail scrub daily
-- at 03:30 Asia/Ho_Chi_Minh (20:30 UTC), after purge-fit-shadow (20:20).
-- cron.schedule upserts by name: one job. Row deletion is scheduled separately
-- by 04_purge_expired_analysis_log_pg_cron.sql (own approval).
SELECT cron.schedule('scrub-analysis-log-detail', '30 20 * * *', 'SELECT public.scrub_expired_analysis_log_detail()');
