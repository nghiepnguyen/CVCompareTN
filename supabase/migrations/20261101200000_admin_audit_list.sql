-- C1: server-side Audit log page for Admin > Audit. One RPC returns the page
-- plus actor/target emails (target may already be deleted; details.email keeps
-- the address for delete_user rows).
CREATE OR REPLACE FUNCTION public.admin_list_audit(
  p_action text DEFAULT 'all',
  p_search text DEFAULT NULL,
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
  v_action text := COALESCE(NULLIF(btrim(p_action), ''), 'all');
  v_search text := NULLIF(left(btrim(COALESCE(p_search, '')), 80), '');
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = '42501';
  END IF;

  RETURN (
    WITH filtered AS (
      SELECT
        a.id,
        a.admin_id,
        COALESCE(actor.email, '') AS admin_email,
        a.action,
        a.target_user_id,
        COALESCE(target.email, a.details->>'email', '') AS target_email,
        a.details,
        a.created_at
      FROM public.admin_audit_log AS a
      LEFT JOIN public.profiles AS actor ON actor.id = a.admin_id
      LEFT JOIN public.profiles AS target ON target.id = a.target_user_id
      WHERE (v_action = 'all' OR a.action = v_action)
        AND (
          v_search IS NULL
          OR position(lower(v_search) in lower(COALESCE(actor.email, ''))) > 0
          OR position(lower(v_search) in lower(COALESCE(target.email, ''))) > 0
          OR position(lower(v_search) in lower(COALESCE(a.details->>'email', ''))) > 0
          OR a.admin_id::text = v_search
          OR a.target_user_id::text = v_search
        )
    ),
    paged AS (
      SELECT * FROM filtered
      ORDER BY created_at DESC, id DESC
      LIMIT v_limit OFFSET v_offset
    )
    SELECT jsonb_build_object(
      'rows', COALESCE(
        (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.created_at DESC, p.id DESC) FROM paged AS p),
        '[]'::jsonb
      ),
      'total', (SELECT count(*) FROM filtered)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_audit(text, text, integer, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_audit(text, text, integer, integer)
  TO authenticated;

COMMENT ON FUNCTION public.admin_list_audit(text, text, integer, integer) IS
  'Admin-only paginated audit log with actor/target emails; filter by action or search email/id.';
