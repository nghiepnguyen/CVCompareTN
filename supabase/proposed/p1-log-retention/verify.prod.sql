-- P1-D1 production POST-APPLY verify — READ-ONLY. Phase A (right after applying
-- 20261126000000): expect retention_enabled = false, phase_a_no_job_ok = true,
-- purge_job_ok = false, rows_total unchanged from the preflight. Phase B: run
-- again after the owner enables retention and 02 ships, and the morning after
-- the first 20:40 UTC cron run. Expected: every *_ok true;
-- expired_rows_remaining = 0 once the backlog has drained. ledger/history/
-- payment/audit/usage numbers must equal the preflight values (± legitimate
-- new activity; usage_count_sum can only grow). The window is the live
-- setting, through the same helper the purge uses (raises if invalid).
SELECT
  (SELECT value FROM public.app_settings WHERE key = 'analysis_log_retention_days')              AS row_days,
  (SELECT value FROM public.app_settings WHERE key = 'analysis_log_retention_enabled')           AS retention_enabled,
  NOT EXISTS (SELECT 1 FROM cron.job WHERE command ILIKE '%purge_expired_analysis_log%')         AS phase_a_no_job_ok,
  (SELECT 'enabled=' || p.enabled || ' ' || p.cutoff || ' eligible=' || p.eligible_rows || ' next=' || p.next_call_rows FROM public.preview_expired_analysis_log() p) AS dry_run,
  coalesce((SELECT bool_and(prosecdef AND proconfig IS NOT DISTINCT FROM ARRAY['search_path=""']) FROM pg_proc
    WHERE oid IN (to_regprocedure('public.purge_expired_analysis_log()'), to_regprocedure('public.preview_expired_analysis_log()'))), false)
    AND (SELECT count(*) FROM pg_proc WHERE oid IN (to_regprocedure('public.purge_expired_analysis_log()'), to_regprocedure('public.preview_expired_analysis_log()'),
                                                    to_regprocedure('public.analysis_log_retention_cutoff()'))
           AND pg_get_userbyid(proowner) = 'postgres') = 3                                       AS fns_definer_fixed_path_ok,
  NOT has_function_privilege('anon', 'public.purge_expired_analysis_log()', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.purge_expired_analysis_log()', 'EXECUTE')
    AND NOT has_function_privilege('service_role', 'public.purge_expired_analysis_log()', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.preview_expired_analysis_log()', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.preview_expired_analysis_log()', 'EXECUTE')
    AND NOT has_function_privilege('service_role', 'public.preview_expired_analysis_log()', 'EXECUTE') AS fns_exec_owner_only_ok,
  NOT has_function_privilege('anon', 'public.analysis_log_retention_cutoff()', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.analysis_log_retention_cutoff()', 'EXECUTE')
    AND NOT has_function_privilege('service_role', 'public.analysis_log_retention_cutoff()', 'EXECUTE') AS helper_private_ok,
  to_regprocedure('public.scrub_expired_analysis_log_detail()') IS NULL
    AND to_regprocedure('public.analysis_log_retention_cutoffs()') IS NULL                       AS option_b_absent_ok,
  EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-analysis-log' AND schedule = '40 20 * * *' AND active AND username = 'postgres')
    AND (SELECT count(*) FROM cron.job WHERE jobname = 'purge-analysis-log') = 1
    AND (SELECT command FROM cron.job WHERE jobname = 'purge-analysis-log') = 'SELECT public.purge_expired_analysis_log()' AS purge_job_ok,
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
    WHERE j.jobname = 'purge-analysis-log' ORDER BY d.start_time DESC LIMIT 1)                   AS last_purge_run;
