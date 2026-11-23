-- PROPOSED (P1) production PREFLIGHT — READ-ONLY, counts only (no ids, no
-- user ids). Run right before apply inside BEGIN READ ONLY; record the numbers.
-- Before apply the setting does not exist yet, so the window is the value the
-- migration will seed (:days, default 90). Pass -v days=365 for option C.
-- expired_id_fingerprint identifies the exact set; re-run verify.prod.sql's
-- check after the first purge (first purge count must equal rows_to_delete_first_run).
\if :{?days} \else \set days 90 \endif
WITH c AS (SELECT now() AS at, now() - make_interval(days => :days) AS cutoff),
     e AS (SELECT l.* FROM public.analysis_log l, c WHERE l.created_at < c.cutoff)
SELECT
  (SELECT at FROM c)                                                                             AS snapshot_at,
  (SELECT cutoff FROM c)                                                                         AS cutoff,
  (SELECT count(*) FROM public.analysis_log)                                                     AS rows_total,
  (SELECT count(*) FROM e)                                                                       AS rows_to_delete_first_run,
  (SELECT count(*) FROM e WHERE user_id IS NOT NULL)                                             AS linked_rows_to_delete,
  (SELECT count(DISTINCT user_id) FROM e)                                                        AS users_affected,
  (SELECT jsonb_object_agg(kind, n) FROM (SELECT kind, count(*) n FROM e GROUP BY kind) k)       AS by_kind,
  (SELECT min(created_at) FROM e)                                                                AS expired_min,
  (SELECT max(created_at) FROM e)                                                                AS expired_max,
  (SELECT md5(string_agg(id::text, ',' ORDER BY id)) FROM e)                                     AS expired_id_fingerprint,
  (SELECT count(*) FROM public.analysis_log, c WHERE created_at >= c.cutoff AND created_at < c.cutoff + interval '7 days') AS rows_expiring_next_7d,
  (SELECT count(*) FROM public.analytics_quota_reservations)                                     AS ledger_rows,
  (SELECT count(*) FROM public.history)                                                          AS history_rows,
  (SELECT count(*) FROM public.payments)                                                         AS payment_rows,
  (SELECT count(*) FROM public.admin_audit_log)                                                  AS audit_rows,
  (SELECT coalesce(sum(usage_count), 0) FROM public.profiles)                                    AS usage_count_sum,
  NOT EXISTS (SELECT 1 FROM public.app_settings WHERE key = 'analysis_log_retention_days')       AS setting_absent_ok,
  to_regprocedure('public.purge_expired_analysis_log()') IS NULL                                 AS fn_absent_ok,
  (SELECT count(*) FROM cron.job WHERE jobname = 'purge-analysis-log') = 0                       AS job_absent_ok,
  (SELECT array_agg(proname::text ORDER BY proname) FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace AND prosrc ILIKE '%analysis_log%')               AS sql_functions_reading_log,
  (SELECT count(*) FROM pg_constraint WHERE confrelid = 'public.analysis_log'::regclass)         AS inbound_fks,
  (SELECT relacl::text FROM pg_class WHERE oid = 'public.analysis_log'::regclass)                AS analysis_log_acl;
