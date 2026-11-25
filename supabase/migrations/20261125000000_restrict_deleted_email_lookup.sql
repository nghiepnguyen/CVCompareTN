-- P1-C1: restrict the deleted-account functions to the server and the Auth hook.
--
-- email_is_deleted_account(), record_deleted_account() and
-- release_deleted_account() are only needed by the server (service_role,
-- _server-lib/admin/deleteUser.ts), the owner's SQL, and the Before User Created
-- hook. They were reachable by API roles: the lookup through an explicit grant
-- (for a sign-up pre-check, now removed from the client), and record/release
-- through Supabase's default function privileges, which REVOKE ... FROM PUBLIC
-- does not remove. Revoke EXECUTE from PUBLIC, anon and authenticated.
--
-- The Before User Created hook (Postgres, public.before_user_created_hook,
-- enabled in production) keeps enforcing the block on sign-up. It is SECURITY
-- DEFINER owned by postgres, so its call to email_is_deleted_account() runs
-- with the owner's privileges and needs no grant to anon, authenticated or
-- supabase_auth_admin.
--
-- The hook's rejection message becomes neutral (GoTrue forwards it verbatim);
-- the client maps SIGNUP_BLOCKED (and the previous ACCOUNT_DELETED) to a
-- neutral text.
--
-- Unchanged: deleted_accounts rows, table grants, RLS, function ownership,
-- record/release behaviour. Rollback: supabase/rollback/20261125000000_restrict_deleted_email_lookup.sql

REVOKE EXECUTE ON FUNCTION public.email_is_deleted_account(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_deleted_account(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_deleted_account(text) FROM PUBLIC, anon, authenticated;

-- CREATE OR REPLACE keeps the owner and existing privileges.
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
        'message', 'SIGNUP_BLOCKED: Không thể đăng ký bằng email này. Vui lòng dùng email khác hoặc liên hệ hỗ trợ.'
      )
    );
  END IF;
  RETURN '{}'::jsonb;
END;
$$;

-- Re-assert the hook's grants (idempotent).
REVOKE ALL ON FUNCTION public.before_user_created_hook(jsonb) FROM PUBLIC, anon, authenticated;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.before_user_created_hook(jsonb) TO supabase_auth_admin';
  END IF;
END $$;

COMMENT ON FUNCTION public.email_is_deleted_account(text) IS
  'True when the normalized email belongs to a deleted account. Not callable by anon/authenticated (P1-C1); used by before_user_created_hook (owner context) and service_role.';
