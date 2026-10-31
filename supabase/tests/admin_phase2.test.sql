-- Run after migrations 20261101200000–20261101230000; fixtures rollback.
-- C1 audit list, C2 app-setting write+audit, C5 bulk actions, C6 report ops.
BEGIN;
DO $$
DECLARE
  admin_id uuid := gen_random_uuid();
  alice_id uuid := gen_random_uuid();
  bob_id uuid := gen_random_uuid();
  r jsonb;
  n integer;
BEGIN
  INSERT INTO auth.users(id) VALUES (admin_id), (alice_id), (bob_id);
  INSERT INTO public.profiles(id, email, display_name, role, has_permission, is_new)
  VALUES
    (admin_id, 'admin@example.test', 'Admin', 'admin', true, false),
    (alice_id, 'alice@example.test', 'Alice', 'user', true, true),
    (bob_id, 'bob@example.test', 'Bob', 'user', true, true);

  INSERT INTO public.admin_audit_log(admin_id, action, target_user_id, details, created_at)
  VALUES
    (admin_id, 'update_plan', alice_id, '{"plan":"pro"}'::jsonb, now() - interval '3 hours'),
    (admin_id, 'delete_user', bob_id, '{"email":"bob@example.test"}'::jsonb, now() - interval '2 hours'),
    (admin_id, 'update_app_setting', NULL, '{"key":"default_monthly_analytics_limit","value":10}'::jsonb, now() - interval '1 hour');

  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', admin_id::text, true);

  r := public.admin_list_audit('all', NULL, 50, 0);
  ASSERT (r->>'total')::int = 3, format('audit total %s', r->>'total');
  ASSERT (r->'rows'->0->>'action') = 'update_app_setting', 'audit order newest first';

  r := public.admin_list_audit('delete_user', 'bob@example.test', 50, 0);
  ASSERT (r->>'total')::int = 1, 'audit action/search filter';
  ASSERT (r->'rows'->0->>'target_email') = 'bob@example.test', 'audit target email';

  -- C2: app setting is validated + audited in one RPC.
  EXECUTE 'SET LOCAL ROLE service_role';
  PERFORM public.admin_update_app_setting(admin_id, 'default_monthly_analytics_limit', '12'::jsonb);
  ASSERT (SELECT (value #>> '{}')::int FROM public.app_settings WHERE key='default_monthly_analytics_limit') = 12,
    'app setting not updated';
  ASSERT EXISTS (
    SELECT 1 FROM public.admin_audit_log
    WHERE action='update_app_setting' AND details->>'value' = '12'
  ), 'app setting audit missing';

  BEGIN
    PERFORM public.admin_update_app_setting(admin_id, 'default_monthly_analytics_limit', '"12"'::jsonb);
    RAISE EXCEPTION 'string setting value accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;

  -- C5: bulk lock/unlock/mark_read, audited for privileged actions.
  n := public.admin_bulk_update_users(admin_id, ARRAY[alice_id, bob_id], 'lock');
  ASSERT n = 2, format('bulk lock count %s', n);
  ASSERT NOT EXISTS (SELECT 1 FROM public.profiles WHERE id IN (alice_id, bob_id) AND has_permission),
    'bulk lock not applied';
  ASSERT EXISTS (
    SELECT 1 FROM public.admin_audit_log
    WHERE action='update_permission' AND details->>'bulk' = 'true' AND (details->>'count')::int = 2
  ), 'bulk lock audit missing';

  n := public.admin_bulk_update_users(admin_id, ARRAY[alice_id, bob_id], 'mark_read');
  ASSERT n = 2, 'bulk mark_read count';
  ASSERT NOT EXISTS (SELECT 1 FROM public.profiles WHERE id IN (alice_id, bob_id) AND is_new),
    'bulk mark_read not applied';

  n := public.admin_bulk_update_users(admin_id, ARRAY[alice_id, bob_id], 'unlock');
  ASSERT n = 2, 'bulk unlock count';
  ASSERT EXISTS (SELECT 1 FROM public.profiles WHERE id IN (alice_id, bob_id) AND has_permission),
    'bulk unlock not applied';

  EXECUTE 'RESET ROLE';

  -- C2: authenticated admins can no longer bypass the audited RPC.
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    UPDATE public.app_settings
    SET value = '99'::jsonb
    WHERE key = 'default_monthly_analytics_limit';
    RAISE EXCEPTION 'direct app_settings write succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  EXECUTE 'RESET ROLE';

  -- C6: latency percentiles + analyze error categories.
  INSERT INTO public.analysis_log(user_id, status, kind, created_at, latency_ms, error_message)
  VALUES
    (alice_id, 'success', 'analyze', now() - interval '1 hour', 100, NULL),
    (alice_id, 'success', 'rewrite', now() - interval '2 hours', 300, NULL),
    (alice_id, 'success', 'analyze', now() - interval '3 hours', 500, NULL),
    (bob_id, 'error', 'analyze', now() - interval '4 hours', NULL, '[gemini_error]');

  PERFORM set_config('request.jwt.claim.sub', admin_id::text, true);
  r := public.admin_report_ops(now() - interval '1 day', now() + interval '1 hour');
  ASSERT (r->>'latency_p50_ms')::int = 300, format('p50 %s', r->>'latency_p50_ms');
  ASSERT (r->>'latency_p95_ms')::int = 480, format('p95 %s', r->>'latency_p95_ms');
  ASSERT (r->'error_categories'->0->>'message') = '[gemini_error]', 'error category';
  ASSERT (r->'error_categories'->0->>'count')::int = 1, 'error count';
END $$;
ROLLBACK;
