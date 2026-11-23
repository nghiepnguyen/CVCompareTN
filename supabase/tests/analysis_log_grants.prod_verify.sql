-- P0-H post-apply: READ-ONLY production check of public.analysis_log privileges
-- (migration 20261123100000). SELECT only; privileges and counts, no row data.
-- Expected AFTER apply: acl_exact = true and every *_ok column = true.
-- BEFORE apply: acl = {postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,
--   authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}, *_ok = false.
-- Functional proof after apply: a new analysis_log row appears after the next
-- real analysis (service_role INSERT still works; the insert error is swallowed
-- by logAnalysisAttempt, so absence of new rows would be the only symptom).
WITH m AS (
  SELECT r AS role, p AS priv, has_table_privilege(r, 'public.analysis_log', p) AS has
    FROM unnest(ARRAY['anon','authenticated','service_role']) r,
         unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p
)
SELECT
  (SELECT relacl::text FROM pg_class WHERE oid = 'public.analysis_log'::regclass)              AS acl,
  (SELECT relacl::text FROM pg_class WHERE oid = 'public.analysis_log'::regclass)
    = '{postgres=arwdDxtm/postgres,authenticated=r/postgres,service_role=ar/postgres}'          AS acl_exact,
  NOT EXISTS (SELECT 1 FROM m WHERE role = 'anon' AND has)                                     AS anon_ok,
  (SELECT bool_and(has = (priv = 'SELECT')) FROM m WHERE role = 'authenticated')               AS authenticated_ok,
  (SELECT bool_and(has = (priv IN ('SELECT','INSERT'))) FROM m WHERE role = 'service_role')    AS service_role_ok,
  NOT has_table_privilege('public', 'public.analysis_log', 'TRUNCATE')                         AS public_no_truncate,
  (SELECT count(*) FROM pg_attribute WHERE attrelid = 'public.analysis_log'::regclass
     AND attnum > 0 AND attacl IS NOT NULL) = 0                                                AS no_column_grants_ok,
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.analysis_log'::regclass)            AS rls_still_on_ok,
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'analysis_log') = 1
    AND EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'analysis_log'
                  AND policyname = 'admins_can_read_analysis_log' AND cmd = 'SELECT')          AS policy_unchanged_ok,
  EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-fit-shadow' AND active AND username = 'postgres') AS purge_job_ok,
  has_function_privilege('service_role', 'public.purge_expired_fit_shadow()', 'EXECUTE')       AS purge_exec_ok;
