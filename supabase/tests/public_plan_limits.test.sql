-- Run after migration 20261101260000; fixtures rollback.
BEGIN;
DO $$
DECLARE r jsonb;
BEGIN
  UPDATE public.app_settings
  SET value = '7'::jsonb
  WHERE key = 'default_monthly_analytics_limit';

  EXECUTE 'SET LOCAL ROLE anon';
  r := public.get_public_plan_limits();
  ASSERT (r->>'free')::int = 7, format('free %s', r->>'free');
  ASSERT (r->>'pro')::int = 100, format('pro %s', r->>'pro');
  ASSERT (r->>'recruiter')::int = 500, format('recruiter %s', r->>'recruiter');
  EXECUTE 'RESET ROLE';
END $$;
ROLLBACK;
