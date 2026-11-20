-- Rollback for 20261120000000_ledger_revoke_destructive_grants.sql (M2-Q H1).
-- Restores the pre-H1 grants exactly. No data change.
GRANT DELETE, TRUNCATE, TRIGGER, REFERENCES
  ON public.analytics_quota_reservations TO service_role;
