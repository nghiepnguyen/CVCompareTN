-- Security: pin search_path on functions flagged by Supabase Security Advisor.

CREATE OR REPLACE FUNCTION public.current_usage_month()
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM');
$$;

CREATE OR REPLACE FUNCTION public.effective_plan_from_row(
  p_plan text,
  p_expires_at timestamptz
)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_plan = 'pro' AND (p_expires_at IS NULL OR p_expires_at > now())
      THEN 'pro'
    ELSE 'free'
  END;
$$;
