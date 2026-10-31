-- Disposable DB only; migrations through 20261101100000. Fixtures roll back.
BEGIN;

DO $$
DECLARE
  r record;
BEGIN
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.api_rate_limits'::regclass), 'RLS disabled on api_rate_limits';
  ASSERT NOT has_table_privilege('anon', 'public.api_rate_limits', 'SELECT'), 'anon can read counters';
  ASSERT NOT has_table_privilege('authenticated', 'public.api_rate_limits', 'INSERT'), 'authenticated can write counters';
  ASSERT NOT has_function_privilege('anon', 'public.consume_api_rate_limit(text,text,integer,integer)', 'EXECUTE'), 'anon can call the limiter';
  ASSERT NOT has_function_privilege('authenticated', 'public.consume_api_rate_limit(text,text,integer,integer)', 'EXECUTE'), 'authenticated can call the limiter';
  ASSERT has_function_privilege('service_role', 'public.consume_api_rate_limit(text,text,integer,integer)', 'EXECUTE'), 'service_role cannot call the limiter';
  ASSERT NOT has_function_privilege('anon', 'public.purge_expired_api_rate_limits()', 'EXECUTE'), 'anon can purge counters';
  ASSERT NOT has_function_privilege('authenticated', 'public.purge_expired_api_rate_limits()', 'EXECUTE'), 'authenticated can purge counters';

  SELECT * INTO r FROM public.consume_api_rate_limit('u:test-subject', 'widget', 2, 3600);
  ASSERT r.allowed AND r.remaining = 1 AND r.retry_after = 0, 'first call must be allowed';

  SELECT * INTO r FROM public.consume_api_rate_limit('u:test-subject', 'widget', 2, 3600);
  ASSERT r.allowed AND r.remaining = 0, 'second call must be allowed with nothing remaining';

  SELECT * INTO r FROM public.consume_api_rate_limit('u:test-subject', 'widget', 2, 3600);
  ASSERT NOT r.allowed AND r.remaining = 0, 'third call must be limited';
  ASSERT r.retry_after BETWEEN 1 AND 3600, format('retry_after out of range: %s', r.retry_after);

  SELECT * INTO r FROM public.consume_api_rate_limit('u:test-subject', 'other-bucket', 2, 3600);
  ASSERT r.allowed AND r.remaining = 1, 'buckets must be independent';

  SELECT * INTO r FROM public.consume_api_rate_limit('u:other-subject', 'widget', 2, 3600);
  ASSERT r.allowed AND r.remaining = 1, 'subjects must be independent';

  -- Fixed-window rollover: an older window starts a fresh count, not an accumulation.
  UPDATE public.api_rate_limits
    SET window_start = now() - interval '2 hours'
    WHERE subject = 'u:test-subject' AND bucket = 'widget';
  SELECT * INTO r FROM public.consume_api_rate_limit('u:test-subject', 'widget', 2, 3600);
  ASSERT r.allowed AND r.remaining = 1, 'new window must reset the counter';
  ASSERT (SELECT hits FROM public.api_rate_limits WHERE subject = 'u:test-subject' AND bucket = 'widget') = 1,
    'reset must not keep the old count';

  BEGIN
    PERFORM public.consume_api_rate_limit('u:test-subject', 'widget', 0, 3600);
    ASSERT false, 'zero limit accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.consume_api_rate_limit(NULL, 'widget', 5, 3600);
    ASSERT false, 'null subject accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.consume_api_rate_limit('u:test-subject', repeat('x', 65), 5, 3600);
    ASSERT false, 'oversized bucket accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.consume_api_rate_limit('u:test-subject', 'widget', 5, 0);
    ASSERT false, 'zero window accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END $$;

DO $$
DECLARE n integer;
BEGIN
  INSERT INTO public.api_rate_limits (subject, bucket, window_start, hits)
  VALUES ('u:stale', 'widget', now() - interval '3 days', 9),
         ('u:fresh', 'widget', now() - interval '1 minute', 9);
  n := public.purge_expired_api_rate_limits();
  ASSERT n = 1, format('purge removed %s rows, expected 1', n);
  ASSERT NOT EXISTS (SELECT 1 FROM public.api_rate_limits WHERE subject = 'u:stale'), 'stale row survived';
  ASSERT EXISTS (SELECT 1 FROM public.api_rate_limits WHERE subject = 'u:fresh'), 'fresh row was deleted';
END $$;

ROLLBACK;
