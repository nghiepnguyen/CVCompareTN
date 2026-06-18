-- Switch usage month tracking from UTC to GMT+7 (Asia/Ho_Chi_Minh).
-- current_usage_month() was IMMUTABLE + UTC; now STABLE + GMT+7.
-- STABLE is correct: now() changes across transactions.

CREATE OR REPLACE FUNCTION public.current_usage_month()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT to_char((now() AT TIME ZONE 'Asia/Ho_Chi_Minh'), 'YYYY-MM');
$$;
