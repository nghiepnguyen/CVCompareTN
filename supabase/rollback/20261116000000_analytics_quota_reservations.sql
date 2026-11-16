-- ROLLBACK ONLY (not a migration; never auto-applied). Removes the M2-C2 monthly
-- quota ledger (20261116000000_analytics_quota_reservations.sql).
-- Order: FIRST redeploy an app version whose /api/analyze uses the legacy
-- check_analytics_quota + increment_usage_count (unchanged by M2-C2), THEN run this.
-- profiles.usage_count is the committed counter in both designs and is not touched.
-- In-flight reservations at rollback time are discarded (never charged).
-- The schema_migrations row for 20261116000000 is NOT removed by this script;
-- before re-applying later run: supabase migration repair --status reverted 20261116000000
BEGIN;
DROP FUNCTION IF EXISTS public.release_analytics_quota(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.commit_analytics_quota(uuid, uuid);
DROP FUNCTION IF EXISTS public.reserve_analytics_quota(uuid, uuid, integer);
DROP FUNCTION IF EXISTS public.analytics_quota_expire(uuid, integer, text);
DROP FUNCTION IF EXISTS public.analytics_quota_mark_uncertain(uuid, text, integer, integer, text);
DROP FUNCTION IF EXISTS public.analytics_quota_lock_state(uuid);
DROP FUNCTION IF EXISTS public.analytics_quota_forgiven_per_cycle();
DROP TABLE IF EXISTS public.analytics_quota_reservations;
COMMIT;
