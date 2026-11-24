-- PROPOSED (P1-B) production PREFLIGHT — READ-ONLY, counts only (no ids, no
-- user ids). Run right before apply inside BEGIN READ ONLY; record the numbers.
-- Before apply the settings do not exist yet, so the windows are the values the
-- migration will seed (:detail_days default 90, :row_days default 400).
-- First scrub must change exactly rows_to_scrub_first_run; first purge (only
-- after its own approval) must delete exactly rows_to_delete_first_run.
\if :{?detail_days} \else \set detail_days 90 \endif
\if :{?row_days} \else \set row_days 400 \endif
WITH c AS (SELECT now() AS at,
                  now() - make_interval(days => :detail_days) AS detail_cutoff,
                  now() - make_interval(days => :row_days) AS row_cutoff),
     s AS (SELECT l.* FROM public.analysis_log l, c
            WHERE l.created_at < c.detail_cutoff AND (l.error_message IS NOT NULL OR l.guard_metrics IS NOT NULL)),
     e AS (SELECT l.* FROM public.analysis_log l, c WHERE l.created_at < c.row_cutoff)
SELECT
  (SELECT at FROM c)                                                                             AS snapshot_at,
  (SELECT detail_cutoff FROM c)                                                                  AS detail_cutoff,
  (SELECT row_cutoff FROM c)                                                                     AS row_cutoff,
  (SELECT count(*) FROM public.analysis_log)                                                     AS rows_total,
  (SELECT min(created_at) FROM public.analysis_log)                                              AS oldest_row,
  (SELECT count(*) FROM s)                                                                       AS rows_to_scrub_first_run,
  (SELECT count(*) FROM s WHERE error_message IS NOT NULL)                                       AS scrub_error_message,
  (SELECT count(*) FROM s WHERE guard_metrics IS NOT NULL)                                       AS scrub_guard_metrics,
  (SELECT md5(coalesce(string_agg(id::text, ',' ORDER BY id), '')) FROM s)                       AS scrub_id_fingerprint,
  (SELECT count(*) FROM e)                                                                       AS rows_to_delete_first_run,
  (SELECT md5(coalesce(string_agg(id::text, ',' ORDER BY id), '')) FROM e)                       AS delete_id_fingerprint,
  (SELECT count(*) FROM public.analysis_log, c WHERE created_at >= c.detail_cutoff AND created_at < c.detail_cutoff + interval '7 days'
      AND (error_message IS NOT NULL OR guard_metrics IS NOT NULL))                              AS rows_scrubbed_next_7d,
  (SELECT count(*) FROM public.analysis_log, c WHERE created_at >= c.row_cutoff AND created_at < c.row_cutoff + interval '7 days') AS rows_deleted_next_7d,
  (SELECT count(*) FROM public.analytics_quota_reservations)                                     AS ledger_rows,
  (SELECT count(*) FROM public.history)                                                          AS history_rows,
  (SELECT count(*) FROM public.payments)                                                         AS payment_rows,
  (SELECT count(*) FROM public.admin_audit_log)                                                  AS audit_rows,
  (SELECT coalesce(sum(usage_count), 0) FROM public.profiles)                                    AS usage_count_sum,
  NOT EXISTS (SELECT 1 FROM public.app_settings WHERE key IN ('analysis_log_retention_days','analysis_log_detail_retention_days')) AS settings_absent_ok,
  to_regprocedure('public.purge_expired_analysis_log()') IS NULL
    AND to_regprocedure('public.scrub_expired_analysis_log_detail()') IS NULL                    AS fns_absent_ok,
  (SELECT count(*) FROM cron.job WHERE jobname IN ('purge-analysis-log','scrub-analysis-log-detail')) = 0 AS jobs_absent_ok,
  (SELECT array_agg(proname::text ORDER BY proname) FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace AND prosrc ILIKE '%analysis_log%')               AS sql_functions_reading_log,
  (SELECT count(*) FROM pg_constraint WHERE confrelid = 'public.analysis_log'::regclass)         AS inbound_fks,
  (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.analysis_log'::regclass AND NOT tgisinternal) AS triggers,
  (SELECT relacl::text FROM pg_class WHERE oid = 'public.analysis_log'::regclass)                AS analysis_log_acl;
