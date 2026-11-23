-- Daily at 03:20 Asia/Ho_Chi_Minh (20:20 UTC), after purge-free-history (20:00)
-- and purge-api-rate-limits (20:10). cron.schedule upserts by name: one job.
SELECT cron.schedule('purge-fit-shadow', '20 20 * * *', 'SELECT public.purge_expired_fit_shadow()');
