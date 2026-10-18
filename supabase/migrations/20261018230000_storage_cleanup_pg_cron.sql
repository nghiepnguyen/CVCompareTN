-- Storage cleanup scheduler: GitHub Actions schedule drops most events, Vercel Hobby cron is daily only.
-- pg_cron calls /api/storage?action=cleanup every 15 minutes through pg_net.
-- No-op until Vault secrets `storage_cleanup_url` and `storage_cleanup_secret` exist (docs/10_storage_r2.md).
BEGIN;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE OR REPLACE FUNCTION storage_internal.invoke_storage_cleanup() RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE target_url text; cleanup_secret text;
BEGIN
 SELECT decrypted_secret INTO target_url FROM vault.decrypted_secrets WHERE name='storage_cleanup_url';
 SELECT decrypted_secret INTO cleanup_secret FROM vault.decrypted_secrets WHERE name='storage_cleanup_secret';
 IF target_url IS NULL OR cleanup_secret IS NULL THEN RETURN NULL; END IF;
 -- pg_net default timeout is 5s; endpoint runs ~20s budget under a 60s function limit.
 RETURN net.http_get(url := target_url, headers := jsonb_build_object('Authorization','Bearer '||cleanup_secret), timeout_milliseconds := 60000);
END $$;
REVOKE ALL ON FUNCTION storage_internal.invoke_storage_cleanup() FROM PUBLIC, anon, authenticated, service_role;
-- cron.schedule upserts by job name, so re-running keeps one job.
SELECT cron.schedule('storage-cleanup', '*/15 * * * *', 'SELECT storage_internal.invoke_storage_cleanup()');
COMMIT;
