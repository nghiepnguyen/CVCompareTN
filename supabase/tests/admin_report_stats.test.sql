-- Run after migration 20261101170000; fixtures rollback.
-- B4: aggregate report totals/daily/top users/token buckets/current quota.
BEGIN;
DO $$
DECLARE
  admin_id uuid := gen_random_uuid();
  alice_id uuid := gen_random_uuid();
  bob_id uuid := gen_random_uuid();
  r jsonb;
  v_cycle text;
BEGIN
  INSERT INTO auth.users(id) VALUES (admin_id), (alice_id), (bob_id);
  v_cycle := public.current_quota_cycle(1::smallint);

  INSERT INTO public.profiles
    (id, email, display_name, role, has_permission, created_at, usage_count, usage_month, quota_reset_day)
  VALUES
    (admin_id, 'admin@example.test', 'Admin', 'admin', true,  '2026-10-01T00:00:00Z', 0, v_cycle, 1),
    (alice_id, 'alice@example.test', 'Alice', 'user',  true,  '2026-10-31T02:00:00Z', 3, v_cycle, 1),
    (bob_id,   'bob@example.test',   'Bob',   'user',  true,  '2026-09-01T00:00:00Z', 2, v_cycle, 1);

  INSERT INTO public.analysis_log
    (user_id, status, kind, created_at, input_tokens, output_tokens, model)
  VALUES
    (alice_id, 'success', 'analyze',  '2026-10-30T17:30:00Z', 100, 20, 'gemini-3-flash-preview'),
    (alice_id, 'error',   'analyze',  '2026-10-30T18:30:00Z', 0, 0, NULL),
    (bob_id,   'success', 'analyze',  '2026-10-31T02:00:00Z', 50, 10, 'gemini-3.5-flash-lite'),
    (bob_id,   'success', 'parse_cv', '2026-10-31T02:01:00Z', 30, 5, 'gemini-3.5-flash-lite'),
    (alice_id, 'success', 'rewrite',  '2026-10-31T02:02:00Z', 10, 2, 'gemini-3-flash-preview');

  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', admin_id::text, true);

  r := public.admin_report_stats(
    '2026-10-30T17:00:00Z'::timestamptz, -- 2026-10-31 00:00 ICT
    '2026-10-31T17:00:00Z'::timestamptz  -- 2026-11-01 00:00 ICT
  );

  ASSERT (r->>'new_users_count')::int = 1, format('new users %s', r->>'new_users_count');
  ASSERT (r->>'total_success')::int = 2, format('success %s', r->>'total_success');
  ASSERT (r->>'total_error')::int = 1, format('error %s', r->>'total_error');
  ASSERT jsonb_array_length(r->'daily_counts') = 1, 'one VN day in range';
  ASSERT r->'daily_counts'->0->>'date' = '2026-10-31', 'VN day key';
  ASSERT (r->'daily_counts'->0->>'success')::int = 2, 'daily success';
  ASSERT (r->'daily_counts'->0->>'error')::int = 1, 'daily error';
  ASSERT (r->>'total_input_tokens')::bigint = 190, format('input %s', r->>'total_input_tokens');
  ASSERT (r->>'total_output_tokens')::bigint = 37, format('output %s', r->>'total_output_tokens');
  ASSERT (r->>'tracked_success_count')::int = 2, 'tracked analyze success';
  ASSERT (r->'top_users'->0->>'email') = 'alice@example.test', 'top user alice';
  ASSERT (r->'top_users'->0->>'count')::int = 2, 'top user count';
  ASSERT (r->>'quota_used_current_cycle')::int = 5, format('quota %s', r->>'quota_used_current_cycle');
  ASSERT r->>'as_of' IS NOT NULL, 'as_of';

  -- A wider range zero-fills days without analyses instead of collapsing gaps.
  r := public.admin_report_stats(
    '2026-10-29T17:00:00Z'::timestamptz, -- 2026-10-30 00:00 ICT
    '2026-10-31T17:00:00Z'::timestamptz
  );
  ASSERT jsonb_array_length(r->'daily_counts') = 2, 'zero-filled day count';
  ASSERT r->'daily_counts'->0->>'date' = '2026-10-30', 'zero-filled first day';
  ASSERT (r->'daily_counts'->0->>'success')::int = 0, 'zero-filled success';
  ASSERT r->'daily_counts'->1->>'date' = '2026-10-31', 'zero-filled second day';

  PERFORM set_config('request.jwt.claim.sub', alice_id::text, true);
  BEGIN
    PERFORM public.admin_report_stats(now() - interval '1 day', now());
    RAISE EXCEPTION 'non-admin report call succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
ROLLBACK;
