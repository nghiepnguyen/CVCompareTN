-- Rollback for 20261123100000_analysis_log_least_privilege.sql (P0-H).
-- Restores the pre-P0-H grants exactly (arwdDxtm for anon, authenticated and
-- service_role). No data change. WARNING: this reopens the hole (anon and
-- authenticated regain TRUNCATE/MAINTAIN, which RLS does not cover) — use only
-- if a legitimate workflow broke, and re-harden once it is fixed.
-- Apply as a NEW forward migration (copy into supabase/migrations with a new
-- timestamp) so migration history stays linear; never edit the original.
BEGIN;
GRANT ALL ON public.analysis_log TO anon, authenticated, service_role;
COMMIT;
