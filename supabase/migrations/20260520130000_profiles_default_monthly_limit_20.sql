-- Default monthly analytics limit: 20 analyses per user per UTC month

ALTER TABLE public.profiles
  ALTER COLUMN monthly_analytics_limit SET DEFAULT 20;

UPDATE public.profiles
SET monthly_analytics_limit = 20
WHERE monthly_analytics_limit IS NULL;

COMMENT ON COLUMN public.profiles.monthly_analytics_limit IS
  'Max analyses per calendar month (UTC YYYY-MM). NULL = unlimited. Default 20 for new profiles.';
