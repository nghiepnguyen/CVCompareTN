-- Run after migration 20261101160000; fixtures rollback.
-- B1: admin_list_profiles pagination/filter/search + admin-only guard.
BEGIN;
DO $$
DECLARE
  admin_id uuid := gen_random_uuid();
  alice_id uuid := gen_random_uuid();
  bob_id uuid := gen_random_uuid();
  carol_id uuid := gen_random_uuid();
  r jsonb;
BEGIN
  INSERT INTO auth.users(id) VALUES (admin_id), (alice_id), (bob_id), (carol_id);

  INSERT INTO public.profiles
    (id, email, display_name, role, has_permission, created_at, is_new, plan, plan_expires_at)
  VALUES
    (admin_id, 'admin@example.test', 'Admin', 'admin', true,  '2026-10-01T00:00:00Z', false, 'free', NULL),
    (alice_id, 'alice@example.test', 'Alice', 'user',  true,  '2026-10-02T00:00:00Z', true,  'free', NULL),
    (bob_id,   'bob@example.test',   'Bob',   'user',  true,  '2026-10-03T00:00:00Z', false, 'pro',  now() + interval '3 days'),
    (carol_id, 'carol@example.test', 'Carol', 'user',  false, '2026-10-04T00:00:00Z', false, 'free', NULL);

  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', admin_id::text, true);

  r := public.admin_list_profiles(NULL, 'all', 'all', 'all', 'created_desc', 10, 0);
  ASSERT (r->>'total')::int = 4, format('total %s', r->>'total');
  ASSERT jsonb_array_length(r->'rows') = 4, 'rows length';
  ASSERT (r->>'new_users_count')::int = 1, format('new users %s', r->>'new_users_count');
  ASSERT jsonb_array_length(r->'new_users') = 1, 'new users preview';

  r := public.admin_list_profiles('bob', 'all', 'all', 'all', 'created_desc', 10, 0);
  ASSERT (r->>'total')::int = 1, 'search total';
  ASSERT r->'rows'->0->>'email' = 'bob@example.test', 'search email';

  r := public.admin_list_profiles(NULL, 'pro', 'all', 'all', 'created_desc', 10, 0);
  ASSERT (r->>'total')::int = 2, 'admin+pro plan filter';

  r := public.admin_list_profiles(NULL, 'all', 'user', 'locked', 'created_desc', 10, 0);
  ASSERT (r->>'total')::int = 1, 'locked filter';
  ASSERT r->'rows'->0->>'email' = 'carol@example.test', 'locked user';

  r := public.admin_list_profiles(NULL, 'all', 'all', 'all', 'created_asc', 2, 1);
  ASSERT jsonb_array_length(r->'rows') = 2, 'page size';
  ASSERT r->'rows'->0->>'email' = 'alice@example.test', 'offset/sort';

  r := public.admin_list_profiles_v2(NULL, 'all', 'all', 'all', 'new', 'created_desc', 10, 0);
  ASSERT (r->>'total')::int = 1, 'quick new filter';
  ASSERT r->'rows'->0->>'email' = 'alice@example.test', 'quick new user';

  r := public.admin_list_profiles_v2(NULL, 'all', 'all', 'all', 'expiring', 'created_desc', 10, 0);
  ASSERT (r->>'total')::int = 1, 'quick expiring filter';
  ASSERT r->'rows'->0->>'email' = 'bob@example.test', 'quick expiring user';

  ASSERT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'idx_profiles_created_at'
  ), 'profiles created_at index missing';
  ASSERT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'idx_profiles_is_new'
  ), 'profiles is_new partial index missing';
  ASSERT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'idx_analysis_log_kind_created_status'
  ), 'analysis_log composite index missing';

  -- Non-admin cannot call it even though the function is SECURITY INVOKER.
  PERFORM set_config('request.jwt.claim.sub', carol_id::text, true);
  BEGIN
    PERFORM public.admin_list_profiles(NULL, 'all', 'all', 'all', 'created_desc', 10, 0);
    RAISE EXCEPTION 'non-admin list call succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
ROLLBACK;
