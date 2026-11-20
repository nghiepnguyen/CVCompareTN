-- M2-Q H1 (backlog Q-6): service_role keeps only what the app needs on the
-- quota ledger. No workflow deletes, truncates, triggers or references it as
-- service_role: every write goes through SECURITY DEFINER RPCs (run as the
-- owner), and the account-delete cascade (auth.users -> profiles -> ledger)
-- runs as the referencing table's owner, so it is unaffected.
-- SELECT/INSERT/UPDATE stay: local DB-test fixtures use them as service_role.
-- Rollback: supabase/rollback/20261120000000_ledger_revoke_destructive_grants.sql
REVOKE DELETE, TRUNCATE, TRIGGER, REFERENCES
  ON public.analytics_quota_reservations FROM service_role;
