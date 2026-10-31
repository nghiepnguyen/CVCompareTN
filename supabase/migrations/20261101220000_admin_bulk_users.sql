-- C5: bulk mark-read/lock/unlock for the Admin Users table. Kept server-side
-- so one call updates up to 100 rows atomically and privileged lock/unlock
-- writes produce one audit row with the affected ids.
CREATE OR REPLACE FUNCTION public.admin_bulk_update_users(
  p_admin_id uuid,
  p_user_ids uuid[],
  p_action text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer := 0;
  v_ids uuid[] := COALESCE(p_user_ids, ARRAY[]::uuid[]);
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_admin_id AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = '42501';
  END IF;

  IF p_action NOT IN ('mark_read', 'lock', 'unlock') THEN
    RAISE EXCEPTION 'invalid bulk action' USING ERRCODE = '22023';
  END IF;

  IF cardinality(v_ids) < 1 OR cardinality(v_ids) > 100 THEN
    RAISE EXCEPTION 'select between 1 and 100 users' USING ERRCODE = '22023';
  END IF;

  IF p_action = 'mark_read' THEN
    UPDATE public.profiles
    SET is_new = false
    WHERE id = ANY(v_ids)
      AND role <> 'admin';
  ELSE
    UPDATE public.profiles
    SET has_permission = (p_action = 'unlock')
    WHERE id = ANY(v_ids)
      AND role <> 'admin';
  END IF;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF p_action <> 'mark_read' AND v_count > 0 THEN
    INSERT INTO public.admin_audit_log(admin_id, action, target_user_id, details)
    VALUES (
      p_admin_id,
      'update_permission',
      NULL,
      jsonb_build_object(
        'bulk', true,
        'effect', CASE WHEN p_action = 'unlock' THEN 'unlock' ELSE 'lock' END,
        'count', v_count,
        'user_ids', to_jsonb(v_ids)
      )
    );
  END IF;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_bulk_update_users(uuid, uuid[], text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_bulk_update_users(uuid, uuid[], text)
  TO service_role;

COMMENT ON FUNCTION public.admin_bulk_update_users(uuid, uuid[], text) IS
  'Admin-only via backend: bulk mark_read/lock/unlock for up to 100 non-admin users; lock/unlock audited.';
