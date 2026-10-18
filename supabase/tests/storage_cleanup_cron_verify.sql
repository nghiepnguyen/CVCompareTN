-- Read-only checks after applying 20261018230000_storage_cleanup_pg_cron.sql. Prints no secret values.
DO $$
BEGIN
 ASSERT EXISTS(SELECT 1 FROM cron.job WHERE jobname='storage-cleanup' AND schedule='*/15 * * * *' AND active), 'storage-cleanup cron job missing or inactive';
 ASSERT NOT has_function_privilege('anon','storage_internal.invoke_storage_cleanup()','EXECUTE'), 'Cleanup trigger exposed to anon';
 ASSERT NOT has_function_privilege('authenticated','storage_internal.invoke_storage_cleanup()','EXECUTE'), 'Cleanup trigger exposed to authenticated';
END $$;
SELECT jsonb_build_object(
 'cron_job_active',(SELECT active FROM cron.job WHERE jobname='storage-cleanup'),
 'vault_secrets_present',(SELECT count(*) FROM vault.decrypted_secrets WHERE name IN ('storage_cleanup_url','storage_cleanup_secret')),
 'last_runs',(SELECT jsonb_agg(jsonb_build_object('start',start_time,'status',status) ORDER BY start_time DESC) FROM (SELECT d.start_time,d.status FROM cron.job_run_details d JOIN cron.job j USING (jobid) WHERE j.jobname='storage-cleanup' ORDER BY d.start_time DESC LIMIT 5) r),
 'last_http',(SELECT jsonb_agg(jsonb_build_object('status',status_code,'timed_out',timed_out,'created',created) ORDER BY created DESC) FROM (SELECT status_code,timed_out,created FROM net._http_response ORDER BY created DESC LIMIT 5) h)
) AS storage_cleanup_cron;
