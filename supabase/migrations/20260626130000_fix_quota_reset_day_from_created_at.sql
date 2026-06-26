-- Fix: existing users were all backfilled to quota_reset_day = 1 in the
-- previous migration. Correct them to their actual registration day from created_at.
--
-- Only updates users where:
--   quota_reset_day = 1 (backfilled default)
--   AND the actual registration day-of-month (VN time) != 1
--
-- Also recalculates usage_month to the new cycle start, and resets usage_count
-- so the free-tier counter starts from 0 in the new cycle.
-- ---------------------------------------------------------------------------

UPDATE public.profiles AS p
SET
  quota_reset_day = LEAST(
    EXTRACT(DAY FROM p.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::int,
    28
  )::smallint,
  usage_month = public.current_quota_cycle(
    LEAST(
      EXTRACT(DAY FROM p.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::int,
      28
    )::smallint
  ),
  usage_count = 0
WHERE p.quota_reset_day = 1
  AND EXTRACT(DAY FROM p.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::int <> 1;
