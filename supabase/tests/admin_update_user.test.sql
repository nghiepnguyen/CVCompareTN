-- Run after migration 20261101190000; fixtures rollback.
-- B6: plan + limit in one transaction, audit rows, admin-only via p_admin_id.
BEGIN;
DO $$
DECLARE
  admin_id uuid := gen_random_uuid();
  user_id uuid := gen_random_uuid();
  p public.profiles;
  n integer;
BEGIN
  INSERT INTO auth.users(id) VALUES (admin_id), (user_id);
  INSERT INTO public.profiles(id, email, display_name, role)
  VALUES
    (admin_id, 'admin@example.test', 'Admin', 'admin'),
    (user_id,  'user@example.test',  'User',  'user');

  EXECUTE 'SET LOCAL ROLE service_role';

  PERFORM public.admin_update_user(admin_id, user_id, 'pro', 30, 'custom', 20);

  SELECT * INTO p FROM public.profiles WHERE id = user_id;
  ASSERT p.plan = 'pro', 'plan not applied';
  ASSERT p.plan_expires_at > now(), 'plan expiry not set';
  ASSERT p.monthly_analytics_limit = 20 AND p.monthly_analytics_limit_custom, 'limit not applied';

  SELECT count(*) INTO n FROM public.admin_audit_log WHERE target_user_id = user_id;
  ASSERT n = 2, format('expected 2 audit rows, got %s', n);

  -- A failure in a later step must not leave the plan half-applied.
  BEGIN
    PERFORM public.admin_update_user(admin_id, user_id, 'recruiter', 30, 'custom', NULL);
    RAISE EXCEPTION 'invalid limit was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;

  SELECT * INTO p FROM public.profiles WHERE id = user_id;
  ASSERT p.plan = 'pro' AND p.monthly_analytics_limit = 20, 'failed call mutated the row';

  -- Plan-only update, then limit-only inherit.
  PERFORM public.admin_update_user(admin_id, user_id, NULL, 30, 'inherit', NULL);
  SELECT * INTO p FROM public.profiles WHERE id = user_id;
  ASSERT p.plan = 'pro' AND NOT p.monthly_analytics_limit_custom, 'inherit not applied';

  -- Non-admin p_admin_id is rejected.
  EXECUTE 'RESET ROLE';
  BEGIN
    PERFORM public.admin_update_user(user_id, user_id, 'pro', 30, 'keep', NULL);
    RAISE EXCEPTION 'non-admin caller accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
ROLLBACK;
