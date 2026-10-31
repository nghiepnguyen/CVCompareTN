-- C6: operational insight for Admin > Report. Kept as a small companion RPC
-- to the main aggregate so the report can show latency/error categories without
-- transferring raw analysis_log rows.
CREATE OR REPLACE FUNCTION public.admin_report_ops(
  p_start timestamptz,
  p_end timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = '42501';
  END IF;

  IF p_start IS NULL OR p_end IS NULL OR p_start >= p_end THEN
    RAISE EXCEPTION 'invalid range' USING ERRCODE = '22023';
  END IF;

  RETURN (
    WITH logs AS (
      SELECT *
      FROM public.analysis_log
      WHERE created_at >= p_start
        AND created_at < p_end
    ),
    latency AS (
      SELECT
        percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms) AS p50,
        percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95
      FROM logs
      WHERE status = 'success' AND latency_ms IS NOT NULL
    ),
    errors AS (
      SELECT error_message, count(*)::int AS count
      FROM logs
      WHERE kind = 'analyze'
        AND status = 'error'
        AND error_message IS NOT NULL
      GROUP BY error_message
      ORDER BY count DESC
      LIMIT 10
    )
    SELECT jsonb_build_object(
      'latency_p50_ms', (SELECT round(p50)::int FROM latency),
      'latency_p95_ms', (SELECT round(p95)::int FROM latency),
      'error_categories', COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object('message', error_message, 'count', count)
            ORDER BY count DESC
          )
          FROM errors
        ),
        '[]'::jsonb
      )
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_report_ops(timestamptz, timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_report_ops(timestamptz, timestamptz)
  TO authenticated;

COMMENT ON FUNCTION public.admin_report_ops(timestamptz, timestamptz) IS
  'Admin-only latency p50/p95 and top analyze error categories for the report range.';
