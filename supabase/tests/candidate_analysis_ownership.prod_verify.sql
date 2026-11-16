-- M2-D3 production before/after snapshot. SELECT-only, no PII (counts, names, md5 fingerprints).
-- Run before and after applying 20261117000000; diff the two outputs.
SELECT 'latest_migrations' AS check, string_agg(version, ',' ORDER BY version DESC) AS value
  FROM (SELECT version FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 3) v
UNION ALL SELECT 'migration_count', count(*)::text FROM supabase_migrations.schema_migrations
UNION ALL SELECT 'm2d3_recorded_times', count(*)::text FROM supabase_migrations.schema_migrations WHERE version = '20261117000000'
UNION ALL SELECT 'migration_versions_md5', md5(string_agg(version, ',' ORDER BY version)) FROM supabase_migrations.schema_migrations WHERE version <> '20261117000000'
-- New objects (expected absent before, present after).
UNION ALL SELECT 'new_columns', coalesce(string_agg(column_name || ':' || data_type || ':' || is_nullable || ':' || coalesce(column_default,'-'), ',' ORDER BY column_name), 'none')
  FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'candidate_cvs' AND column_name IN ('analysis_started_at','analysis_attempt_id')
UNION ALL SELECT 'new_fn_' || p.proname,
       p.oid::regprocedure::text || ' definer=' || p.prosecdef || ' config=' || coalesce(array_to_string(p.proconfig, ';'), '-')
       || ' md5=' || md5(p.prosrc)
       || ' anon=' || has_function_privilege('anon', p.oid, 'EXECUTE')
       || ' authenticated=' || has_function_privilege('authenticated', p.oid, 'EXECUTE')
       || ' service_role=' || has_function_privilege('service_role', p.oid, 'EXECUTE')
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname IN ('candidate_analysis_lease_seconds','claim_candidate_analysis','save_candidate_analysis_attempt')
UNION ALL SELECT 'new_fn_count', count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname IN ('candidate_analysis_lease_seconds','claim_candidate_analysis','save_candidate_analysis_attempt')
-- Existing objects (expected unchanged).
UNION ALL SELECT 'existing_fn_md5', md5(string_agg(p.oid::regprocedure::text || '=' || md5(p.prosrc) || ':' || p.prosecdef || ':' || coalesce(array_to_string(p.proacl, ' '), '-'), ',' ORDER BY p.oid::regprocedure::text))
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname NOT IN ('candidate_analysis_lease_seconds','claim_candidate_analysis','save_candidate_analysis_attempt')
UNION ALL SELECT 'existing_fn_count', count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname NOT IN ('candidate_analysis_lease_seconds','claim_candidate_analysis','save_candidate_analysis_attempt')
UNION ALL SELECT 'save_5arg', p.oid::regprocedure::text || ' md5=' || md5(p.prosrc) || ' service_role=' || has_function_privilege('service_role', p.oid, 'EXECUTE')
       || ' authenticated=' || has_function_privilege('authenticated', p.oid, 'EXECUTE')
  FROM pg_proc p WHERE p.proname = 'save_candidate_analysis'
UNION ALL SELECT 'quota_fn_md5', string_agg(p.proname || '=' || md5(p.prosrc), ',' ORDER BY p.proname)
  FROM pg_proc p WHERE p.proname IN ('reserve_analytics_quota','commit_analytics_quota','release_analytics_quota','check_analytics_quota','increment_usage_count')
UNION ALL SELECT 'existing_candidate_columns_md5', md5(string_agg(column_name || ':' || data_type || ':' || is_nullable || ':' || coalesce(column_default,''), ',' ORDER BY column_name))
  FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'candidate_cvs' AND column_name NOT IN ('analysis_started_at','analysis_attempt_id')
UNION ALL SELECT 'candidate_triggers', string_agg(tgname, ',' ORDER BY tgname) FROM pg_trigger WHERE tgrelid = 'public.candidate_cvs'::regclass AND NOT tgisinternal
UNION ALL SELECT 'candidate_policies_md5', md5(string_agg(polname || ':' || polcmd::text || ':' || coalesce(pg_get_expr(polqual, polrelid),'') || ':' || coalesce(pg_get_expr(polwithcheck, polrelid),''), ',' ORDER BY polname))
  FROM pg_policy WHERE polrelid = 'public.candidate_cvs'::regclass
UNION ALL SELECT 'candidate_table_acl', coalesce(array_to_string(relacl, ' '), '-') FROM pg_class WHERE oid = 'public.candidate_cvs'::regclass
UNION ALL SELECT 'candidate_indexes', string_agg(indexrelid::regclass::text, ',' ORDER BY indexrelid::regclass::text) FROM pg_index WHERE indrelid = 'public.candidate_cvs'::regclass
UNION ALL SELECT 'default_acl_md5', md5(string_agg(pg_get_userbyid(defaclrole) || ':' || defaclobjtype::text || ':' || array_to_string(defaclacl, ' '), ',' ORDER BY pg_get_userbyid(defaclrole), defaclobjtype::text, defaclnamespace)) FROM pg_default_acl
-- Data fingerprints (expected unchanged).
UNION ALL SELECT 'candidate_status_counts', coalesce(string_agg(status || '=' || n, ',' ORDER BY status), 'none')
  FROM (SELECT status, count(*) AS n FROM public.candidate_cvs GROUP BY status) s
UNION ALL SELECT 'candidate_results_md5', md5(coalesce(string_agg(id::text || ':' || status || ':' || coalesce(match_score::text,'') || ':' || md5(coalesce(analysis_result::text,'')) || ':' || coalesce(analyzed_at::text,''), ',' ORDER BY id), ''))
  FROM public.candidate_cvs
UNION ALL SELECT 'campaign_counters_md5', md5(coalesce(string_agg(id::text || ':' || candidate_count || ':' || analyzed_count || ':' || shortlisted_count, ',' ORDER BY id), ''))
  FROM public.recruitment_campaigns
UNION ALL SELECT 'ledger_state_counts', coalesce(string_agg(state || '=' || n, ',' ORDER BY state), 'none')
  FROM (SELECT state, count(*) AS n FROM public.analytics_quota_reservations GROUP BY state) l
UNION ALL SELECT 'ledger_md5', md5(coalesce(string_agg(id::text || ':' || state || ':' || charged || ':' || forgiven || ':' || coalesce(settled_at::text,''), ',' ORDER BY id), ''))
  FROM public.analytics_quota_reservations
UNION ALL SELECT 'usage_md5', md5(coalesce(string_agg(id::text || ':' || coalesce(usage_count,0) || ':' || coalesce(usage_month,''), ',' ORDER BY id), ''))
  FROM public.profiles
UNION ALL SELECT 'usage_sum', coalesce(sum(usage_count),0)::text FROM public.profiles
UNION ALL SELECT 'now', now()::text;
