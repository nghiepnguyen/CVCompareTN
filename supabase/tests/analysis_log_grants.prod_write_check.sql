-- P0-H post-apply FUNCTIONAL check (migration 20261123100000). Run once, by
-- the owner, only AFTER prod_verify passes. No Gemini call, no quota, no user.
--
-- Inserts ONE synthetic row as service_role — exactly the columns
-- _server-lib/analysisLog.ts writes — reads it back the way the hourly cap
-- does, and ALWAYS rolls back: nothing is committed, no other session can see
-- the row, no trigger/replication exists on the table.
-- user_id is NULL: no FK lookup, never counted by the per-user caps, and no
-- SECURITY DEFINER call happens in the transaction (avoids F-CRASH, see the
-- P0-H report §7).
-- Expected output: inserted = 1, cap_query_ok = true; then after ROLLBACK
-- leftover = 0. Any "permission denied" = service_role lost INSERT/SELECT →
-- apply the rollback migration and stop.
BEGIN;
SET LOCAL ROLE service_role;
WITH ins AS (
  INSERT INTO public.analysis_log(user_id, status, kind, error_message, input_tokens, output_tokens, model, latency_ms, guard_metrics)
  VALUES (NULL, 'success', 'analyze', '[p0h_verify]', 0, 0, 'p0h-verify', 0, '{"v":1}')
  RETURNING 1
)
SELECT (SELECT count(*) FROM ins) AS inserted;
SELECT count(*) >= 1 AS cap_query_ok
  FROM public.analysis_log
 WHERE kind = 'analyze' AND created_at >= now() - interval '1 hour' AND model = 'p0h-verify';
ROLLBACK;
SELECT count(*) AS leftover FROM public.analysis_log WHERE model = 'p0h-verify';
