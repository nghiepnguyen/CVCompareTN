-- M2-Q Q-1 retention preflight. SELECT-only, no PII (counts, sizes, ages).
-- Run in the Dashboard SQL Editor before any ledger purge is designed for real.
-- Design: docs/audits/2026-11-18-m2q-quota-ledger-reliability-audit.md
SELECT 'ledger_rows' AS check, count(*)::text AS value FROM public.analytics_quota_reservations
UNION ALL
SELECT 'ledger_total_bytes', pg_total_relation_size('public.analytics_quota_reservations')::text
UNION ALL
SELECT 'rows_by_state', coalesce(string_agg(state || '=' || n, ',' ORDER BY state), '')
  FROM (SELECT state, count(*) AS n FROM public.analytics_quota_reservations GROUP BY state) s
UNION ALL
SELECT 'uncertain_by_settlement', coalesce(string_agg(o || '=' || n, ',' ORDER BY o), '')
  FROM (SELECT split_part(coalesce(outcome, ''), ':', 2) AS o, count(*) AS n
          FROM public.analytics_quota_reservations WHERE state = 'uncertain' GROUP BY 1) s
UNION ALL
-- Derived "expired": still reserved after TTL; settled only by that user's next reserve.
SELECT 'reserved_expired_unswept', count(*)::text FROM public.analytics_quota_reservations
 WHERE state = 'reserved' AND expires_at <= now()
UNION ALL
SELECT 'reserved_live', count(*)::text FROM public.analytics_quota_reservations
 WHERE state = 'reserved' AND expires_at > now()
UNION ALL
SELECT 'oldest_row_age_days', coalesce(extract(day FROM now() - min(created_at))::text, 'none')
  FROM public.analytics_quota_reservations
UNION ALL
SELECT 'oldest_expired_reserved_age_days', coalesce(extract(day FROM now() - min(created_at))::text, 'none')
  FROM public.analytics_quota_reservations WHERE state = 'reserved' AND expires_at <= now()
UNION ALL
-- Protected by the M2-Q invariant: referenced by a candidate that is not done.
SELECT 'rows_protected_by_open_candidate', count(*)::text FROM public.analytics_quota_reservations r
 WHERE EXISTS (SELECT 1 FROM public.candidate_cvs cc
                WHERE cc.analysis_attempt_id = r.request_key AND cc.status <> 'done')
UNION ALL
SELECT 'open_candidates_by_ledger_state', coalesce(string_agg(st || '=' || n, ',' ORDER BY st), '')
  FROM (SELECT coalesce(r.state, 'no_row') AS st, count(*) AS n
          FROM public.candidate_cvs cc
          LEFT JOIN public.analytics_quota_reservations r ON r.request_key = cc.analysis_attempt_id
         WHERE cc.analysis_attempt_id IS NOT NULL AND cc.status <> 'done'
         GROUP BY 1) s
UNION ALL
SELECT 'rows_last_30_days', count(*)::text FROM public.analytics_quota_reservations
 WHERE created_at > now() - interval '30 days'
UNION ALL
SELECT 'attempt_id_index_present', (count(*) > 0)::text FROM pg_indexes
 WHERE schemaname = 'public' AND tablename = 'candidate_cvs' AND indexdef ILIKE '%analysis_attempt_id%'
UNION ALL
SELECT 'database_bytes', pg_database_size(current_database())::text;
