-- Monthly analytics quota per user (profiles.usage_count = usage in current usage_month)

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS monthly_analytics_limit integer
    CHECK (monthly_analytics_limit IS NULL OR monthly_analytics_limit >= 0);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS usage_month text NOT NULL
    DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM');

COMMENT ON COLUMN public.profiles.monthly_analytics_limit IS
  'Max analyses per calendar month (UTC YYYY-MM). NULL = unlimited.';
COMMENT ON COLUMN public.profiles.usage_month IS
  'Month key (YYYY-MM) that usage_count applies to; reset when month changes.';
COMMENT ON COLUMN public.profiles.usage_count IS
  'Successful analyses in usage_month (not lifetime total).';

CREATE OR REPLACE FUNCTION public.current_usage_month()
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM');
$$;

CREATE OR REPLACE FUNCTION public.sync_profile_usage_month(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month text := public.current_usage_month();
BEGIN
  UPDATE public.profiles AS p
  SET usage_month = v_month,
      usage_count = 0
  WHERE p.id = p_user_id
    AND p.usage_month IS DISTINCT FROM v_month;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_profile_usage_month(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_profile_usage_month(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.check_analytics_quota(
  p_user_id uuid,
  p_additional integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month text := public.current_usage_month();
  v_used integer;
  v_limit integer;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;

  PERFORM public.sync_profile_usage_month(p_user_id);

  SELECT p.usage_count, p.monthly_analytics_limit
  INTO v_used, v_limit
  FROM public.profiles AS p
  WHERE p.id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'used', 0,
      'limit', null,
      'month', v_month,
      'reason', 'profile_not_found'
    );
  END IF;

  IF v_limit IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'used', v_used,
      'limit', null,
      'month', v_month
    );
  END IF;

  IF v_used + GREATEST(p_additional, 0) > v_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'used', v_used,
      'limit', v_limit,
      'month', v_month,
      'reason', 'monthly_limit_exceeded'
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'used', v_used,
    'limit', v_limit,
    'month', v_month
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_analytics_quota(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_analytics_quota(uuid, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.increment_usage_count(user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month text := public.current_usage_month();
  v_limit integer;
  v_used integer;
BEGIN
  IF user_id IS DISTINCT FROM auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;

  PERFORM public.sync_profile_usage_month(user_id);

  SELECT p.usage_count, p.monthly_analytics_limit
  INTO v_used, v_limit
  FROM public.profiles AS p
  WHERE p.id = user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_limit IS NOT NULL AND v_used >= v_limit THEN
    RAISE EXCEPTION 'monthly_limit_exceeded'
      USING ERRCODE = 'P0001',
            MESSAGE = 'Monthly analytics limit reached';
  END IF;

  UPDATE public.profiles AS p
  SET usage_count = COALESCE(p.usage_count, 0) + 1,
      usage_month = v_month
  WHERE p.id = user_id;
END;
$$;

COMMENT ON FUNCTION public.check_analytics_quota(uuid, integer) IS
  'Returns allowed/used/limit for current UTC month; resets usage_count when month rolls over.';
COMMENT ON FUNCTION public.increment_usage_count(uuid) IS
  'Increments monthly usage_count after successful analysis; enforces monthly_analytics_limit.';
