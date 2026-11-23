-- PROPOSED (P1) production POST-APPLY verify — READ-ONLY. Run once after
-- `db push`, and again the morning after the first 20:30 UTC cron run.
-- Expected: every *_ok true. expired_rows_remaining = 0 only after the first
-- cron run (or a deliberate owner-run `SELECT public.purge_expired_analysis_log()`).
-- ledger/history/payment/audit counts must equal the preflight numbers
-- (± legitimate new activity since).
SELECT
  to_regprocedure('public.purge_expired_analysis_log()') IS NOT NULL                            AS fn_exists_ok,
  coalesce((SELECT prosecdef AND proconfig = ARRAY['search_path=""'] FROM pg_proc WHERE oid = to_regprocedure('public.purge_expired_analysis_log()')), false) AS fn_definer_fixed_path_ok,
  to_regprocedure('public.purge_expired_analysis_log()') IS NOT NULL
    AND NOT has_function_privilege('anon', 'public.purge_expired_analysis_log()', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.purge_expired_analysis_log()', 'EXECUTE')
    AND has_function_privilege('service_role', 'public.purge_expired_analysis_log()', 'EXECUTE') AS fn_exec_service_role_only_ok,
  (SELECT count(*) FROM cron.job WHERE jobname = 'purge-analysis-log') = 1                      AS job_count_ok,
  EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-analysis-log' AND schedule = '30 20 * * *' AND active AND username = 'postgres') AS job_definition_ok,
  (SELECT count(*) FROM cron.job WHERE jobname IN ('purge-free-history','purge-api-rate-limits','storage-cleanup','purge-fit-shadow') AND active) = 4 AS existing_jobs_ok,
  (SELECT relacl::text FROM pg_class WHERE oid = 'public.analysis_log'::regclass)
    = '{postgres=arwdDxtm/postgres,authenticated=r/postgres,service_role=ar/postgres}'           AS analysis_log_acl_unchanged_ok,
  (SELECT count(*) FROM public.analysis_log WHERE created_at < now() - interval '90 days')      AS expired_rows_remaining,
  (SELECT count(*) FROM public.analytics_quota_reservations)                                     AS ledger_rows,
  (SELECT count(*) FROM public.history)                                                          AS history_rows,
  (SELECT count(*) FROM public.payments)                                                         AS payment_rows,
  (SELECT count(*) FROM public.admin_audit_log)                                                  AS audit_rows,
  (SELECT status FROM cron.job_run_details d JOIN cron.job j ON j.jobid = d.jobid
    WHERE j.jobname = 'purge-analysis-log' ORDER BY d.start_time DESC LIMIT 1)                   AS last_cron_status;
