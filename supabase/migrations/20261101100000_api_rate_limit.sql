-- Shared rate limiting for the serverless (Vercel) surface. The Express
-- limiter in server/lib/rateLimiter.ts only covers `npm start`; api/*.ts has
-- no shared state across instances, so counters live in Postgres and are
-- updated atomically per (subject, bucket). Subjects are `u:<uuid>` for
-- authenticated calls or `ip:<hmac>` for anonymous ones; raw IPs are never
-- stored. Fixed windows are enough here: the goal is bounding bursts/cost,
-- not precise traffic shaping.
--
-- service_role only: the table has RLS on with no policies and both the
-- table and the functions are revoked from anon/authenticated. The RPC is
-- SECURITY DEFINER and enforces its own input bounds so a compromised
-- service caller cannot write arbitrary keys or oversized windows.

CREATE TABLE public.api_rate_limits (
  subject text NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 128),
  bucket text NOT NULL CHECK (char_length(bucket) BETWEEN 1 AND 64),
  window_start timestamptz NOT NULL,
  hits integer NOT NULL CHECK (hits >= 0),
  PRIMARY KEY (subject, bucket)
);

CREATE INDEX api_rate_limits_window_start_idx ON public.api_rate_limits (window_start);

ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.api_rate_limits FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.api_rate_limits IS
  'Fixed-window request counters for Vercel API routes; one row per (subject, bucket), purged after 2 days.';

CREATE OR REPLACE FUNCTION public.consume_api_rate_limit(
  p_subject text,
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
)
RETURNS TABLE (allowed boolean, remaining integer, retry_after integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_window_start timestamptz;
  v_hits integer;
BEGIN
  IF p_subject IS NULL OR p_bucket IS NULL
     OR char_length(p_subject) < 1 OR char_length(p_subject) > 128
     OR char_length(p_bucket) < 1 OR char_length(p_bucket) > 64
     OR p_limit IS NULL OR p_limit < 1 OR p_limit > 100000
     OR p_window_seconds IS NULL OR p_window_seconds < 1 OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION 'invalid rate limit arguments' USING ERRCODE = '22023';
  END IF;

  v_window_start := to_timestamp(
    (floor(extract(epoch FROM clock_timestamp()) / p_window_seconds) * p_window_seconds)::double precision
  );

  INSERT INTO public.api_rate_limits AS limits (subject, bucket, window_start, hits)
  VALUES (p_subject, p_bucket, v_window_start, 1)
  ON CONFLICT (subject, bucket) DO UPDATE
    SET hits = CASE WHEN limits.window_start < v_window_start THEN 1 ELSE limits.hits + 1 END,
        window_start = CASE WHEN limits.window_start < v_window_start THEN v_window_start ELSE limits.window_start END
  RETURNING limits.hits INTO v_hits;

  allowed := v_hits <= p_limit;
  remaining := greatest(p_limit - v_hits, 0);
  retry_after := CASE
    WHEN v_hits <= p_limit THEN 0
    ELSE greatest(
      1,
      ceil(extract(epoch FROM (v_window_start + make_interval(secs => p_window_seconds) - clock_timestamp())))::integer
    )
  END;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_api_rate_limit(text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_api_rate_limit(text, text, integer, integer) TO service_role;

-- Stale rows are swept by the daily job in 20261101100001; the RPC never
-- deletes because that would add write amplification to the hot path.
CREATE OR REPLACE FUNCTION public.purge_expired_api_rate_limits()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE n integer;
BEGIN
  DELETE FROM public.api_rate_limits WHERE window_start < now() - interval '2 days';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_api_rate_limits() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_api_rate_limits() TO service_role;
