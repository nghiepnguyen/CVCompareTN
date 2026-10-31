-- Run after migration 20261101280000; fixtures rollback.
BEGIN;
DO $$
DECLARE
  admin_id uuid := gen_random_uuid();
  user_id uuid := gen_random_uuid();
  request_id uuid := gen_random_uuid();
  other_request uuid := gen_random_uuid();
  p public.profiles;
  n integer;
  first_expiry timestamptz;
BEGIN
  INSERT INTO auth.users(id) VALUES (admin_id), (user_id);
  INSERT INTO public.profiles(id, email, display_name, role)
  VALUES
    (admin_id, 'admin@example.test', 'Admin', 'admin'),
    (user_id,  'user@example.test',  'User',  'user');

  EXECUTE 'SET LOCAL ROLE service_role';

  PERFORM public.admin_update_user_v2(admin_id, user_id, 'pro', 30, 'custom', 20, request_id);
  SELECT plan_expires_at INTO first_expiry FROM public.profiles WHERE id = user_id;
  SELECT count(*) INTO n FROM public.admin_audit_log WHERE target_user_id = user_id;
  ASSERT n = 2, format('first call audit rows %s', n);

  -- Same request id: must be a no-op, including no extra plan duration.
  PERFORM public.admin_update_user_v2(admin_id, user_id, 'pro', 30, 'custom', 20, request_id);
  SELECT * INTO p FROM public.profiles WHERE id = user_id;
  ASSERT p.plan_expires_at = first_expiry, 'duplicate request extended the plan';
  SELECT count(*) INTO n FROM public.admin_audit_log WHERE target_user_id = user_id;
  ASSERT n = 2, format('duplicate call audit rows %s', n);

  -- New request id applies normally.
  PERFORM public.admin_update_user_v2(admin_id, user_id, NULL, 30, 'inherit', NULL, other_request);
  SELECT * INTO p FROM public.profiles WHERE id = user_id;
  ASSERT NOT p.monthly_analytics_limit_custom, 'new request id did not apply';

  -- A request id owned by another admin is rejected.
  PERFORM public.admin_update_user_v2(user_id, user_id, NULL, 30, 'keep', NULL, other_request);
  RAISE EXCEPTION 'request id reuse by another admin accepted';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
ROLLBACK;
