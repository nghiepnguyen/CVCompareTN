-- Daily at 03:00 Asia/Ho_Chi_Minh (20:00 UTC). cron.schedule upserts by name.
SELECT cron.schedule('purge-free-history', '0 20 * * *', 'SELECT public.purge_expired_free_history()');
