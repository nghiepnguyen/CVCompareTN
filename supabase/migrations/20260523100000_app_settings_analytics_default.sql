-- Runtime default monthly analytics limit (app_settings) + per-user custom override flag

CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

COMMENT ON TABLE public.app_settings IS
  'Key-value app configuration editable without redeploy (admin or SQL).';

INSERT INTO public.app_settings (key, value)
VALUES ('default_monthly_analytics_limit', '20'::jsonb)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS monthly_analytics_limit_custom boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.monthly_analytics_limit_custom IS
  'When false, effective limit comes from app_settings.default_monthly_analytics_limit. When true, monthly_analytics_limit applies (NULL = unlimited).';

-- Backfill: limit=20 → inherit global; anything else → custom override
UPDATE public.profiles
SET monthly_analytics_limit_custom = true
WHERE monthly_analytics_limit IS NULL
   OR monthly_analytics_limit IS DISTINCT FROM 20;

UPDATE public.profiles
SET monthly_analytics_limit_custom = false
WHERE monthly_analytics_limit = 20;

COMMENT ON COLUMN public.profiles.monthly_analytics_limit IS
  'Used only when monthly_analytics_limit_custom = true. NULL = unlimited. Ignored when custom = false (inherits app_settings).';

CREATE OR REPLACE FUNCTION public.get_default_monthly_analytics_limit()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT (s.value #>> '{}')::integer
      FROM public.app_settings AS s
      WHERE s.key = 'default_monthly_analytics_limit'
    ),
    20
  );
$$;

REVOKE ALL ON FUNCTION public.get_default_monthly_analytics_limit() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_default_monthly_analytics_limit() TO authenticated;

COMMENT ON FUNCTION public.get_default_monthly_analytics_limit() IS
  'Global default analyses per UTC month; fallback 20 if app_settings row missing.';

CREATE OR REPLACE FUNCTION public.effective_monthly_analytics_limit(
  p_custom boolean,
  p_limit integer
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_custom THEN p_limit
    ELSE public.get_default_monthly_analytics_limit()
  END;
$$;

REVOKE ALL ON FUNCTION public.effective_monthly_analytics_limit(boolean, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.effective_monthly_analytics_limit(boolean, integer) TO authenticated;

COMMENT ON FUNCTION public.effective_monthly_analytics_limit(boolean, integer) IS
  'Resolves per-user limit: custom row value (NULL=unlimited) or app_settings default.';

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
  v_custom boolean;
  v_stored_limit integer;
  v_limit integer;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;

  PERFORM public.sync_profile_usage_month(p_user_id);

  SELECT p.usage_count,
         p.monthly_analytics_limit_custom,
         p.monthly_analytics_limit
  INTO v_used, v_custom, v_stored_limit
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

  v_limit := public.effective_monthly_analytics_limit(v_custom, v_stored_limit);

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

CREATE OR REPLACE FUNCTION public.increment_usage_count(user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month text := public.current_usage_month();
  v_custom boolean;
  v_stored_limit integer;
  v_limit integer;
  v_used integer;
BEGIN
  IF user_id IS DISTINCT FROM auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;

  PERFORM public.sync_profile_usage_month(user_id);

  SELECT p.usage_count,
         p.monthly_analytics_limit_custom,
         p.monthly_analytics_limit
  INTO v_used, v_custom, v_stored_limit
  FROM public.profiles AS p
  WHERE p.id = user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_limit := public.effective_monthly_analytics_limit(v_custom, v_stored_limit);

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

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_settings_select_authenticated" ON public.app_settings;
DROP POLICY IF EXISTS "app_settings_admin_write" ON public.app_settings;

CREATE POLICY "app_settings_select_authenticated"
ON public.app_settings FOR SELECT TO authenticated
USING (true);

CREATE POLICY "app_settings_admin_write"
ON public.app_settings FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());
