-- PROPOSED (P1) production PREFLIGHT — READ-ONLY, counts only. Run right
-- before apply; record the numbers in the release report.
SELECT
  (SELECT count(*) FROM public.analysis_log)                                                    AS rows_total,
  (SELECT count(*) FROM public.analysis_log WHERE created_at < now() - interval '90 days')     AS rows_to_delete_first_run,
  (SELECT count(*) FROM public.analysis_log WHERE created_at < now() - interval '90 days' AND user_id IS NOT NULL) AS linked_rows_to_delete,
  (SELECT count(DISTINCT user_id) FROM public.analysis_log WHERE created_at < now() - interval '90 days') AS users_affected,
  (SELECT min(created_at)::date FROM public.analysis_log)                                       AS oldest_row,
  (SELECT count(*) FROM public.analytics_quota_reservations)                                    AS ledger_rows,
  (SELECT count(*) FROM public.history)                                                         AS history_rows,
  (SELECT count(*) FROM public.payments)                                                        AS payment_rows,
  (SELECT count(*) FROM public.admin_audit_log)                                                 AS audit_rows,
  to_regprocedure('public.purge_expired_analysis_log()') IS NULL                                AS fn_absent_ok,
  (SELECT count(*) FROM cron.job WHERE jobname = 'purge-analysis-log') = 0                      AS job_absent_ok,
  (SELECT relacl::text FROM pg_class WHERE oid = 'public.analysis_log'::regclass)               AS analysis_log_acl;
