-- M3-B OD-M2 post-apply: READ-ONLY production check of the fitShadow retention
-- (migrations 20261123000000 + 20261123000001). SELECT only; returns booleans
-- and counts, never row content. Run by the owner (`supabase db query --linked`
-- or SQL Editor). Expected AFTER apply: every column below is true, except
-- fit_shadow_rows, which is 0 while FIT_SCORE_SHADOW is off.
-- BEFORE apply: fn_exists = false and job_count = 0.
SELECT
  to_regprocedure('public.purge_expired_fit_shadow()') IS NOT NULL                                  AS fn_exists,
  coalesce((SELECT prosecdef FROM pg_proc WHERE oid = to_regprocedure('public.purge_expired_fit_shadow()')), false) AS fn_security_definer,
  coalesce((SELECT proconfig = ARRAY['search_path=""'] FROM pg_proc WHERE oid = to_regprocedure('public.purge_expired_fit_shadow()')), false) AS fn_fixed_search_path,
  to_regprocedure('public.purge_expired_fit_shadow()') IS NOT NULL
    AND NOT has_function_privilege('anon', 'public.purge_expired_fit_shadow()', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.purge_expired_fit_shadow()', 'EXECUTE')
    AND has_function_privilege('service_role', 'public.purge_expired_fit_shadow()', 'EXECUTE')     AS fn_exec_service_role_only,
  (SELECT count(*) FROM cron.job WHERE jobname = 'purge-fit-shadow') = 1                           AS job_count_is_1,
  EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-fit-shadow' AND schedule = '20 20 * * *'
            AND command = 'SELECT public.purge_expired_fit_shadow()' AND active)                   AS job_definition_ok,
  (SELECT count(*) FROM cron.job WHERE jobname IN ('purge-free-history', 'purge-api-rate-limits', 'storage-cleanup') AND active) = 3
                                                                                                    AS existing_jobs_intact,
  col_description('public.analysis_log'::regclass,
    (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.analysis_log'::regclass AND attname = 'guard_metrics'))
    LIKE '%removed after 30 days by purge_expired_fit_shadow()%'                                   AS column_comment_updated,
  (SELECT count(*) FROM public.analysis_log WHERE guard_metrics ? 'fitShadow')                     AS fit_shadow_rows;
