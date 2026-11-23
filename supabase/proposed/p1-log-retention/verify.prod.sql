-- PROPOSED (P1) production POST-APPLY verify — READ-ONLY. Run once after
-- `db push`, and again the morning after the first 20:30 UTC cron run.
-- Expected: every *_ok true. expired_rows_remaining = 0 only after the first
-- purge. ledger/history/payment/audit/usage numbers must equal the preflight
-- values (± legitimate new activity since; usage_count_sum can only grow).
-- Window = the live setting, through the same helper the purge uses.
SELECT
  (SELECT value FROM public.app_settings WHERE key = 'analysis_log_retention_days')              AS retention_days,
  public.analysis_log_retention_cutoff()                                                         AS cutoff,  -- raises if setting invalid
  to_regprocedure('public.purge_expired_analysis_log()') IS NOT NULL                             AS fn_exists_ok,
  coalesce((SELECT prosecdef AND proconfig = ARRAY['search_path=""'] FROM pg_proc WHERE oid = to_regprocedure('public.purge_expired_analysis_log()')), false) AS fn_definer_fixed_path_ok,
  NOT has_function_privilege('anon', 'public.purge_expired_analysis_log()', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.purge_expired_analysis_log()', 'EXECUTE')
    AND has_function_privilege('service_role', 'public.purge_expired_analysis_log()', 'EXECUTE') AS fn_exec_service_role_only_ok,
  NOT has_function_privilege('anon', 'public.analysis_log_retention_cutoff()', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.analysis_log_retention_cutoff()', 'EXECUTE')
    AND NOT has_function_privilege('service_role', 'public.analysis_log_retention_cutoff()', 'EXECUTE') AS helper_private_ok,
  (SELECT count(*) FROM cron.job WHERE jobname = 'purge-analysis-log') = 1                       AS job_count_ok,
  EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-analysis-log' AND schedule = '30 20 * * *' AND active AND username = 'postgres') AS job_definition_ok,
  (SELECT count(*) FROM cron.job WHERE jobname IN ('purge-free-history','purge-api-rate-limits','storage-cleanup','purge-fit-shadow') AND active) = 4 AS existing_jobs_ok,
  (SELECT relacl::text FROM pg_class WHERE oid = 'public.analysis_log'::regclass)
    = '{postgres=arwdDxtm/postgres,authenticated=r/postgres,service_role=ar/postgres}'           AS analysis_log_acl_unchanged_ok,
  (SELECT count(*) FROM public.analysis_log WHERE created_at < public.analysis_log_retention_cutoff()) AS expired_rows_remaining,
  (SELECT count(*) FROM public.analysis_log)                                                     AS rows_total,
  (SELECT count(*) FROM public.analytics_quota_reservations)                                     AS ledger_rows,
  (SELECT count(*) FROM public.history)                                                          AS history_rows,
  (SELECT count(*) FROM public.payments)                                                         AS payment_rows,
  (SELECT count(*) FROM public.admin_audit_log)                                                  AS audit_rows,
  (SELECT coalesce(sum(usage_count), 0) FROM public.profiles)                                    AS usage_count_sum,
  (SELECT d.status || ' ' || coalesce(d.return_message, '') FROM cron.job_run_details d JOIN cron.job j ON j.jobid = d.jobid
    WHERE j.jobname = 'purge-analysis-log' ORDER BY d.start_time DESC LIMIT 1)                   AS last_cron_run;
