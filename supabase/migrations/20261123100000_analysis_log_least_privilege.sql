-- P0-H: least privilege on public.analysis_log (scope: this table only).
--
-- Before: Supabase default privileges gave anon, authenticated and
-- service_role every table privilege (arwdDxtm: SELECT, INSERT, UPDATE, DELETE,
-- TRUNCATE, REFERENCES, TRIGGER, MAINTAIN). RLS (one admin-only SELECT policy)
-- was the only control; TRUNCATE and MAINTAIN (LOCK TABLE, VACUUM, …) are not
-- subject to RLS.
--
-- After — exactly what the app uses:
--   anon           nothing
--   authenticated  SELECT   admin Report RPCs admin_report_stats / admin_report_ops
--                           are SECURITY INVOKER; rows still gated by RLS is_admin()
--   service_role   SELECT   hourly / document AI cap head count (_server-lib/accountLock.ts)
--                  INSERT   one row per AI call (_server-lib/analysisLog.ts)
--   postgres       unchanged (owner): the DEFINER purge_expired_fit_shadow() and
--                  FK ON DELETE SET NULL from auth.users run as the owner.
-- TRUNCATE, TRIGGER, REFERENCES, MAINTAIN, UPDATE and DELETE are removed from
-- all three API roles. REVOKE ALL (not a list) also removes MAINTAIN on PG 17
-- without naming it (the stub test harness runs PG 16).
--
-- One transaction: service_role never loses INSERT mid-migration
-- (logAnalysisAttempt swallows insert errors; a gap would silently drop rows
-- and let the hourly cap fail open). Idempotent: REVOKE/GRANT can be replayed.
-- Does not touch RLS, policies, other tables or default privileges (a table
-- re-created later would get the defaults back).
-- Rollback: supabase/rollback/20261123100000_analysis_log_least_privilege.sql
BEGIN;
REVOKE ALL ON public.analysis_log FROM anon, authenticated, service_role;
GRANT SELECT ON public.analysis_log TO authenticated;
GRANT SELECT, INSERT ON public.analysis_log TO service_role;
COMMIT;
