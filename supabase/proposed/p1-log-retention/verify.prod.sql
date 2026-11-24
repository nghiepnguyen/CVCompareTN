-- PROPOSED (P1-B) production POST-APPLY verify — READ-ONLY. Run once after
-- `db push` of 01 (scrub_job_ok is false by design until 02 ships in its own
-- migration after the owner-run first scrub), again after 02, and the morning after the first
-- 20:30 UTC cron run. Expected: every *_ok true; detail_rows_remaining = 0
-- after the first scrub; expired_rows_remaining = 0 only once row deletion
-- (04) has been separately approved and has run. ledger/history/payment/audit/
-- usage numbers must equal the preflight values (± legitimate new activity;
-- usage_count_sum can only grow). Windows = live settings, through the same
-- helper the stages use (raises if a setting is invalid).
SELECT
  (SELECT value FROM public.app_settings WHERE key = 'analysis_log_detail_retention_days')       AS detail_days,
  (SELECT value FROM public.app_settings WHERE key = 'analysis_log_retention_days')              AS row_days,
  (SELECT detail_cutoff FROM public.analysis_log_retention_cutoffs())                            AS detail_cutoff,
  (SELECT row_cutoff FROM public.analysis_log_retention_cutoffs())                               AS row_cutoff,
  coalesce((SELECT bool_and(prosecdef AND proconfig = ARRAY['search_path=""']) FROM pg_proc
    WHERE oid IN (to_regprocedure('public.purge_expired_analysis_log()'), to_regprocedure('public.scrub_expired_analysis_log_detail()'))), false)
    AND (SELECT count(*) FROM pg_proc WHERE oid IN (to_regprocedure('public.purge_expired_analysis_log()'), to_regprocedure('public.scrub_expired_analysis_log_detail()'))) = 2
                                                                                                 AS fns_definer_fixed_path_ok,
  NOT has_function_privilege('anon', 'public.purge_expired_analysis_log()', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.purge_expired_analysis_log()', 'EXECUTE')
    AND has_function_privilege('service_role', 'public.purge_expired_analysis_log()', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.scrub_expired_analysis_log_detail()', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.scrub_expired_analysis_log_detail()', 'EXECUTE')
    AND has_function_privilege('service_role', 'public.scrub_expired_analysis_log_detail()', 'EXECUTE') AS fns_exec_service_role_only_ok,
  NOT has_function_privilege('anon', 'public.analysis_log_retention_cutoffs()', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.analysis_log_retention_cutoffs()', 'EXECUTE')
    AND NOT has_function_privilege('service_role', 'public.analysis_log_retention_cutoffs()', 'EXECUTE') AS helper_private_ok,
  to_regprocedure('public.analysis_log_retention_cutoff()') IS NULL                              AS option_a_helper_absent_ok,
  EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'scrub-analysis-log-detail' AND schedule = '30 20 * * *' AND active AND username = 'postgres')
    AND (SELECT count(*) FROM cron.job WHERE jobname = 'scrub-analysis-log-detail') = 1          AS scrub_job_ok,
  (SELECT count(*) FROM cron.job WHERE jobname = 'purge-analysis-log')                           AS purge_jobs,  -- 0 until 04 is approved; then 1
  (SELECT count(*) FROM cron.job WHERE jobname IN ('purge-free-history','purge-api-rate-limits','storage-cleanup','purge-fit-shadow') AND active) = 4 AS existing_jobs_ok,
  (SELECT relacl::text FROM pg_class WHERE oid = 'public.analysis_log'::regclass)
    = '{postgres=arwdDxtm/postgres,authenticated=r/postgres,service_role=ar/postgres}'           AS analysis_log_acl_unchanged_ok,
  (SELECT count(*) FROM public.analysis_log, public.analysis_log_retention_cutoffs() c
    WHERE created_at < c.detail_cutoff AND (error_message IS NOT NULL OR guard_metrics IS NOT NULL)) AS detail_rows_remaining,
  (SELECT count(*) FROM public.analysis_log, public.analysis_log_retention_cutoffs() c
    WHERE created_at < c.row_cutoff)                                                             AS expired_rows_remaining,
  (SELECT count(*) FROM public.analysis_log)                                                     AS rows_total,
  (SELECT count(*) FROM public.analytics_quota_reservations)                                     AS ledger_rows,
  (SELECT count(*) FROM public.history)                                                          AS history_rows,
  (SELECT count(*) FROM public.payments)                                                         AS payment_rows,
  (SELECT count(*) FROM public.admin_audit_log)                                                  AS audit_rows,
  (SELECT coalesce(sum(usage_count), 0) FROM public.profiles)                                    AS usage_count_sum,
  (SELECT d.status || ' ' || coalesce(d.return_message, '') FROM cron.job_run_details d JOIN cron.job j ON j.jobid = d.jobid
    WHERE j.jobname = 'scrub-analysis-log-detail' ORDER BY d.start_time DESC LIMIT 1)            AS last_scrub_run,
  (SELECT d.status || ' ' || coalesce(d.return_message, '') FROM cron.job_run_details d JOIN cron.job j ON j.jobid = d.jobid
    WHERE j.jobname = 'purge-analysis-log' ORDER BY d.start_time DESC LIMIT 1)                   AS last_purge_run;
