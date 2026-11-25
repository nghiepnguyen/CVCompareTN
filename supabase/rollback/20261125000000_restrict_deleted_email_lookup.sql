-- ROLLBACK for 20261125000000_restrict_deleted_email_lookup.sql.
-- SECURITY WARNING: this lets API roles call the deleted-email lookup again.
-- Use only if sign-up is broken by the forward migration and the hook cannot be
-- fixed forward; prefer fixing forward.
-- Deliberately NOT restored: anon/authenticated EXECUTE on record_deleted_account()
-- and release_deleted_account(). No client uses them.
GRANT EXECUTE ON FUNCTION public.email_is_deleted_account(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.before_user_created_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.email_is_deleted_account(event->'user'->>'email') THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 400,
        'message', 'ACCOUNT_DELETED: Tài khoản đã bị xóa vĩnh viễn. Vui lòng sử dụng email khác.'
      )
    );
  END IF;
  RETURN '{}'::jsonb;
END;
$$;

COMMENT ON FUNCTION public.email_is_deleted_account(text) IS
  'True when the normalized email belongs to a permanently deleted account. Deliberately reveals only this bit to callers.';
