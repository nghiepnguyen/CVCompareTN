-- Daily at 03:10 Asia/Ho_Chi_Minh (20:10 UTC), 10 minutes after the history
-- purge. cron.schedule upserts by name.
SELECT cron.schedule('purge-api-rate-limits', '10 20 * * *', 'SELECT public.purge_expired_api_rate_limits()');
