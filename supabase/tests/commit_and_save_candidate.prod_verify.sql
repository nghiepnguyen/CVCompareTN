-- M2-Q 2C production before/after snapshot. SELECT-only, no PII.
-- Run before and after applying 20261118000000; diff the two outputs.
-- Expected diff: m2q2c_recorded_times 0 -> 1, new_fn absent -> present with
-- definer=true config=search_path="" anon=false authenticated=false service_role=true.
-- Everything else (existing function bodies, grants, ledger shape) must be identical.
SELECT 'latest_migrations' AS check, string_agg(version, ',' ORDER BY version DESC) AS value
  FROM (SELECT version FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 3) v
UNION ALL SELECT 'm2q2c_recorded_times', count(*)::text FROM supabase_migrations.schema_migrations WHERE version = '20261118000000'
UNION ALL SELECT 'new_fn',
       coalesce((SELECT p.oid::regprocedure::text || ' definer=' || p.prosecdef || ' config=' || coalesce(array_to_string(p.proconfig, ';'), '-')
         || ' md5=' || md5(p.prosrc)
         || ' anon=' || has_function_privilege('anon', p.oid, 'EXECUTE')
         || ' authenticated=' || has_function_privilege('authenticated', p.oid, 'EXECUTE')
         || ' service_role=' || has_function_privilege('service_role', p.oid, 'EXECUTE')
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'commit_analytics_quota_and_save_candidate'), 'absent')
UNION ALL SELECT 'existing_fn_md5', md5(string_agg(p.oid::regprocedure::text || '=' || md5(p.prosrc) || ':' || p.prosecdef || ':' || coalesce(array_to_string(p.proacl, ' '), '-'), ',' ORDER BY p.oid::regprocedure::text))
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname <> 'commit_analytics_quota_and_save_candidate'
UNION ALL SELECT 'building_blocks', string_agg(p.proname || '=' || md5(p.prosrc) || ' service_role=' || has_function_privilege('service_role', p.oid, 'EXECUTE')
         || ' authenticated=' || has_function_privilege('authenticated', p.oid, 'EXECUTE'), ',' ORDER BY p.proname)
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname IN ('commit_analytics_quota','save_candidate_analysis_attempt','release_analytics_quota','reserve_analytics_quota')
UNION ALL SELECT 'ledger_columns', md5(string_agg(column_name || ':' || data_type, ',' ORDER BY column_name))
  FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'analytics_quota_reservations'
UNION ALL SELECT 'ledger_grants', coalesce(string_agg(grantee || ':' || privilege_type, ',' ORDER BY grantee, privilege_type), 'none')
  FROM information_schema.role_table_grants WHERE table_schema = 'public' AND table_name = 'analytics_quota_reservations'
UNION ALL SELECT 'ledger_rows', count(*)::text FROM public.analytics_quota_reservations;
