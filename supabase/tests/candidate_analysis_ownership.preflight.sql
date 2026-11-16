-- M2-D3 production preflight. SELECT-only, no PII (counts, names, md5).
-- Run before 20261117000000 is applied; compare md5 rows with the local replay.
SELECT 'latest_migrations' AS check, string_agg(version, ',' ORDER BY version DESC) AS value
  FROM (SELECT version FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 3) v
UNION ALL
SELECT 'migration_count', count(*)::text FROM supabase_migrations.schema_migrations
UNION ALL
SELECT 'm2c2_ledger_recorded', (count(*) = 1)::text FROM supabase_migrations.schema_migrations WHERE version = '20261116000000'
UNION ALL
SELECT 'm2d3_not_recorded', (count(*) = 0)::text FROM supabase_migrations.schema_migrations WHERE version = '20261117000000'
UNION ALL
SELECT 'new_columns_absent', (count(*) = 0)::text FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'candidate_cvs' AND column_name IN ('analysis_started_at', 'analysis_attempt_id')
UNION ALL
SELECT 'new_functions_absent', (count(*) = 0)::text FROM pg_proc
 WHERE proname IN ('claim_candidate_analysis', 'save_candidate_analysis_attempt', 'candidate_analysis_lease_seconds')
UNION ALL
SELECT 'save_overloads', string_agg(p.oid::regprocedure::text || ' md5=' || md5(p.prosrc), ' | ' ORDER BY p.pronargs)
  FROM pg_proc p WHERE p.proname = 'save_candidate_analysis'
UNION ALL
SELECT 'dep_md5_' || p.proname, md5(p.prosrc) FROM pg_proc p
 WHERE p.proname IN ('sync_campaign_counters', 'storage_protect_metadata', 'enforce_account_unlocked', 'reserve_analytics_quota')
UNION ALL
SELECT 'candidate_triggers', string_agg(tgname, ',' ORDER BY tgname) FROM pg_trigger
 WHERE tgrelid = 'public.candidate_cvs'::regclass AND NOT tgisinternal
UNION ALL
SELECT 'candidate_rls_policies', string_agg(polname || ':' || polcmd::text, ',' ORDER BY polname) FROM pg_policy
 WHERE polrelid = 'public.candidate_cvs'::regclass
UNION ALL
SELECT 'authenticated_update_candidate_cvs', has_table_privilege('authenticated', 'public.candidate_cvs', 'UPDATE')::text
UNION ALL
SELECT 'candidate_status_counts', string_agg(status || '=' || n, ',' ORDER BY status)
  FROM (SELECT status, count(*) AS n FROM public.candidate_cvs GROUP BY status) s
UNION ALL
SELECT 'analyzing_rows_age_buckets', string_agg(b || '=' || n, ',' ORDER BY b)
  FROM (SELECT CASE WHEN created_at > now() - interval '1 day' THEN '<1d' WHEN created_at > now() - interval '30 days' THEN '<30d' ELSE '>=30d' END AS b,
               count(*) AS n
          FROM public.candidate_cvs WHERE status = 'analyzing' GROUP BY 1) a
UNION ALL
SELECT 'ledger_rows', count(*)::text FROM public.analytics_quota_reservations
UNION ALL
SELECT 'ledger_key_unique', (count(*) = 1)::text FROM pg_constraint WHERE conname = 'analytics_quota_reservations_user_key_unique'
UNION ALL
SELECT 'default_acl_functions', string_agg(pg_get_userbyid(defaclrole) || ':' || array_to_string(defaclacl, ' '), ' | ')
  FROM pg_default_acl WHERE defaclobjtype = 'f' AND defaclnamespace = 'public'::regnamespace
UNION ALL
SELECT 'pg_version', current_setting('server_version');
