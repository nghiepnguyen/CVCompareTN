-- Follow-up to admin_list_profiles: add quick filters (new / expiring in 7 days)
-- without changing the signature used by the already-deployed bundle.
-- SECURITY INVOKER + is_admin() guard; RLS on profiles still applies.

CREATE OR REPLACE FUNCTION public.admin_list_profiles_v2(
  p_search text DEFAULT NULL,
  p_plan text DEFAULT 'all',
  p_role text DEFAULT 'all',
  p_status text DEFAULT 'all',
  p_flag text DEFAULT 'all',
  p_sort text DEFAULT 'created_desc',
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_search text := NULLIF(left(btrim(COALESCE(p_search, '')), 80), '');
  v_plan text := COALESCE(p_plan, 'all');
  v_role text := COALESCE(p_role, 'all');
  v_status text := COALESCE(p_status, 'all');
  v_flag text := COALESCE(p_flag, 'all');
  v_sort text := COALESCE(p_sort, 'created_desc');
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = '42501';
  END IF;

  IF v_plan NOT IN ('all', 'free', 'pro', 'recruiter')
     OR v_role NOT IN ('all', 'user', 'admin')
     OR v_status NOT IN ('all', 'active', 'locked')
     OR v_flag NOT IN ('all', 'new', 'expiring') THEN
    RAISE EXCEPTION 'invalid filter' USING ERRCODE = '22023';
  END IF;

  IF v_sort NOT IN ('created_desc', 'created_asc', 'usage_desc', 'name_asc', 'expiry_asc') THEN
    RAISE EXCEPTION 'invalid sort' USING ERRCODE = '22023';
  END IF;

  RETURN (
    WITH base AS (
      SELECT
        p.*,
        public.effective_usage_count(p) AS effective_usage_count,
        CASE
          WHEN p.role = 'admin' THEN 'pro'
          WHEN p.plan IN ('pro', 'recruiter')
               AND (p.plan_expires_at IS NULL OR p.plan_expires_at > now())
            THEN p.plan
          ELSE 'free'
        END AS effective_plan,
        (p.has_permission OR p.role = 'admin') AS is_active
      FROM public.profiles AS p
    ),
    filtered AS (
      SELECT b.*
      FROM base AS b
      WHERE (
          v_search IS NULL
          OR position(lower(v_search) in lower(b.email)) > 0
          OR position(lower(v_search) in lower(b.display_name)) > 0
          OR b.id::text = v_search
        )
        AND (v_role = 'all' OR b.role = v_role)
        AND (v_plan = 'all' OR b.effective_plan = v_plan)
        AND (v_status = 'all' OR (v_status = 'active') = b.is_active)
        AND (
          v_flag = 'all'
          OR (v_flag = 'new' AND b.is_new AND b.role <> 'admin')
          OR (
            v_flag = 'expiring'
            AND b.role <> 'admin'
            AND b.plan IN ('pro', 'recruiter')
            AND b.plan_expires_at IS NOT NULL
            AND b.plan_expires_at > now()
            AND b.plan_expires_at <= now() + interval '7 days'
          )
        )
    ),
    ordered AS (
      SELECT
        f.*,
        row_number() OVER (
          ORDER BY
            CASE WHEN v_sort = 'created_desc' THEN f.created_at END DESC NULLS LAST,
            CASE WHEN v_sort = 'created_asc' THEN f.created_at END ASC NULLS LAST,
            CASE WHEN v_sort = 'usage_desc' THEN f.effective_usage_count END DESC NULLS LAST,
            CASE WHEN v_sort = 'name_asc' THEN lower(f.display_name) END ASC NULLS LAST,
            CASE WHEN v_sort = 'expiry_asc' THEN f.plan_expires_at END ASC NULLS LAST,
            f.created_at DESC,
            f.id ASC
        ) AS ord
      FROM filtered AS f
    ),
    page AS (
      SELECT * FROM ordered ORDER BY ord LIMIT v_limit OFFSET v_offset
    ),
    new_users AS (
      SELECT b.*
      FROM base AS b
      WHERE b.is_new AND b.role <> 'admin'
      ORDER BY b.created_at DESC
      LIMIT 12
    )
    SELECT jsonb_build_object(
      'rows', COALESCE(
        (SELECT jsonb_agg(to_jsonb(p) - 'ord' ORDER BY p.ord) FROM page AS p),
        '[]'::jsonb
      ),
      'total', (SELECT count(*) FROM filtered),
      'new_users_count', (
        SELECT count(*) FROM public.profiles WHERE is_new AND role <> 'admin'
      ),
      'new_users', COALESCE(
        (SELECT jsonb_agg(to_jsonb(n) ORDER BY n.created_at DESC) FROM new_users AS n),
        '[]'::jsonb
      )
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_profiles_v2(text, text, text, text, text, text, integer, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_profiles_v2(text, text, text, text, text, text, integer, integer)
  TO authenticated;

COMMENT ON FUNCTION public.admin_list_profiles_v2(text, text, text, text, text, text, integer, integer) IS
  'Admin-only paginated/filtered profile list + quick new/expiring filters + DB-wide new-user count/preview.';
