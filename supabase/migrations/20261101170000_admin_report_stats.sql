-- B4: Admin > Report aggregate. One RPC returns compact aggregates instead of
-- the client fetching every analysis_log row in the range.
--
-- Volume counts kind='analyze' only (success + error); token/cost totals span
-- analyze + parse_cv + rewrite (one analysis fires all three Gemini calls).
-- Quota is a current-cycle snapshot (profiles.effective_usage_count), not
-- range-scoped, because each user resets on their own quota_reset_day.

CREATE OR REPLACE FUNCTION public.admin_report_stats(
  p_start timestamptz,
  p_end timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_start date;
  v_end date;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = '42501';
  END IF;

  IF p_start IS NULL OR p_end IS NULL OR p_start >= p_end THEN
    RAISE EXCEPTION 'invalid range' USING ERRCODE = '22023';
  END IF;

  v_start := (p_start AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_end := ((p_end - interval '1 microsecond') AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;

  RETURN (
    WITH logs AS (
      SELECT
        l.*,
        (l.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS log_day
      FROM public.analysis_log AS l
      WHERE l.created_at >= p_start
        AND l.created_at < p_end
    ),
    analyze_logs AS (
      SELECT * FROM logs WHERE kind = 'analyze'
    ),
    daily AS (
      SELECT
        log_day AS day,
        count(*) FILTER (WHERE status = 'success')::int AS success,
        count(*) FILTER (WHERE status = 'error')::int AS error
      FROM analyze_logs
      GROUP BY log_day
    ),
    days AS (
      SELECT generate_series(v_start, v_end, interval '1 day')::date AS day
    ),
    daily_filled AS (
      SELECT
        d.day,
        COALESCE(daily.success, 0)::int AS success,
        COALESCE(daily.error, 0)::int AS error
      FROM days AS d
      LEFT JOIN daily ON daily.day = d.day
      ORDER BY d.day
    ),
    top AS (
      SELECT user_id, count(*)::int AS count
      FROM analyze_logs
      WHERE user_id IS NOT NULL
      GROUP BY user_id
      ORDER BY count DESC
      LIMIT 10
    ),
    top_users AS (
      SELECT
        t.user_id,
        COALESCE(p.email, '') AS email,
        COALESCE(p.display_name, '') AS display_name,
        t.count
      FROM top AS t
      LEFT JOIN public.profiles AS p ON p.id = t.user_id
      ORDER BY t.count DESC
    ),
    token_total AS (
      SELECT
        COALESCE(sum(input_tokens), 0)::bigint AS input_tokens,
        COALESCE(sum(output_tokens), 0)::bigint AS output_tokens
      FROM logs
      WHERE status = 'success'
    ),
    model_usage AS (
      SELECT
        model,
        sum(input_tokens)::bigint AS input_tokens,
        sum(output_tokens)::bigint AS output_tokens
      FROM logs
      WHERE status = 'success'
      GROUP BY model
      ORDER BY model NULLS LAST
    ),
    tracked AS (
      SELECT count(*)::int AS n
      FROM analyze_logs
      WHERE status = 'success'
        AND created_at >= '2026-07-04T00:00:00Z'::timestamptz
    ),
    quota AS (
      SELECT COALESCE(sum(public.effective_usage_count(p)), 0)::int AS used
      FROM public.profiles AS p
      WHERE p.role <> 'admin'
    )
    SELECT jsonb_build_object(
      'new_users_count', (
        SELECT count(*)
        FROM public.profiles AS p
        WHERE p.created_at >= p_start
          AND p.created_at < p_end
          AND p.role <> 'admin'
      ),
      'total_success', (SELECT count(*) FROM analyze_logs WHERE status = 'success'),
      'total_error', (SELECT count(*) FROM analyze_logs WHERE status = 'error'),
      'daily_counts', COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'date', to_char(day, 'YYYY-MM-DD'),
              'success', success,
              'error', error
            )
            ORDER BY day
          )
          FROM daily_filled
        ),
        '[]'::jsonb
      ),
      'top_users', COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'userId', user_id,
              'email', email,
              'displayName', display_name,
              'count', count
            )
            ORDER BY count DESC
          )
          FROM top_users
        ),
        '[]'::jsonb
      ),
      'total_input_tokens', (SELECT input_tokens FROM token_total),
      'total_output_tokens', (SELECT output_tokens FROM token_total),
      'tracked_success_count', (SELECT n FROM tracked),
      'model_usage', COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'model', model,
              'input_tokens', input_tokens,
              'output_tokens', output_tokens
            )
            ORDER BY model NULLS LAST
          )
          FROM model_usage
        ),
        '[]'::jsonb
      ),
      'quota_used_current_cycle', (SELECT used FROM quota),
      'as_of', now()
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_report_stats(timestamptz, timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_report_stats(timestamptz, timestamptz)
  TO authenticated;

COMMENT ON FUNCTION public.admin_report_stats(timestamptz, timestamptz) IS
  'Admin-only report aggregate: analyze volume/day/top users, token totals by model, current-cycle quota. No raw row transfer.';
