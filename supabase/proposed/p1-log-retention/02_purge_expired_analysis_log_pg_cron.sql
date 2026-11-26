-- PROPOSED (P1-D1 Phase B) — row deletion schedule. NOT part of Phase A.
-- Ship only as its own migration after: the Phase A migration is applied,
-- the owner has set analysis_log_retention_enabled = true and run the counted
-- first purge, and the privacy-policy update is ready for the same release.
-- While the flag is false the job would fail every run (55000), by design.
-- Daily at 03:40 Asia/Ho_Chi_Minh (20:40 UTC), after purge-fit-shadow (20:20).
-- Upserts by name.
SELECT cron.schedule('purge-analysis-log', '40 20 * * *', 'SELECT public.purge_expired_analysis_log()');
