-- profiles.usage_month still defaulted to the pre-cycle format from
-- 20260520120000 (UTC 'YYYY-MM'). Since 20260626110000 the cycle key is
-- current_quota_cycle(quota_reset_day): ICT 'YYYY-MM-DD'. Align the default
-- with quota_reset_day's default (1) so a row inserted without usage_month
-- starts in the current ICT cycle instead of being reset on first sync.
ALTER TABLE public.profiles
  ALTER COLUMN usage_month SET DEFAULT public.current_quota_cycle(1::smallint);
