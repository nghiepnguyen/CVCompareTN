-- Deleted-account blocklist.
--
-- After an admin hard-deletes a user (auth.users row + cascaded data), the email
-- must not be reusable to sign up again: the product rule is "tài khoản đã bị xoá
-- vĩnh viễn, dùng email khác". We keep only the SHA-256 of the normalized email
-- (lower + trim) so the permanent deletion does not retain queryable PII.
--
-- Consumers:
--   1. public.record_deleted_account() — service_role, called by
--      _server-lib/admin/deleteUser.ts right after auth.admin.deleteUser().
--   2. public.email_is_deleted_account() — anon/authenticated, called by the
--      signup form before auth.signUp() so the user gets the specific message.
--   3. public.before_user_created_hook() — Auth hook (Dashboard → Authentication
--      → Hooks → Before User Created → public.before_user_created_hook). When
--      enabled it also blocks OAuth signups and calls that bypass the web app.
--
-- Unblock (appeal / mistaken deletion): SELECT public.release_deleted_account('user@example.com');

CREATE TABLE IF NOT EXISTS public.deleted_accounts (
  email_hash text PRIMARY KEY,
  deleted_by uuid,
  deleted_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.deleted_accounts IS
  'SHA-256 hex of lower(trim(email)) for permanently deleted accounts; blocks re-registration.';
COMMENT ON COLUMN public.deleted_accounts.deleted_by IS
  'Admin that performed the deletion. No FK: that admin row may itself be deleted later.';

ALTER TABLE public.deleted_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.deleted_accounts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.deleted_accounts TO service_role;

-- sha256(bytea) is a Postgres 11+ builtin, so no pgcrypto schema dependency.
CREATE OR REPLACE FUNCTION public.email_is_deleted_account(p_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_email IS NULL OR btrim(p_email) = '' THEN false
    ELSE EXISTS (
      SELECT 1
      FROM public.deleted_accounts AS d
      WHERE d.email_hash = encode(sha256(convert_to(lower(btrim(p_email)), 'UTF8')), 'hex')
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.email_is_deleted_account(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.email_is_deleted_account(text) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.email_is_deleted_account(text) IS
  'True when the normalized email belongs to a permanently deleted account. Deliberately reveals only this bit to callers.';

CREATE OR REPLACE FUNCTION public.record_deleted_account(p_email text, p_deleted_by uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  normalized text := lower(btrim(coalesce(p_email, '')));
BEGIN
  IF normalized = '' THEN
    RETURN false;
  END IF;

  INSERT INTO public.deleted_accounts (email_hash, deleted_by)
  VALUES (encode(sha256(convert_to(normalized, 'UTF8')), 'hex'), p_deleted_by)
  ON CONFLICT (email_hash) DO NOTHING;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.record_deleted_account(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_deleted_account(text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.release_deleted_account(p_email text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  normalized text := lower(btrim(coalesce(p_email, '')));
BEGIN
  IF normalized = '' THEN
    RETURN false;
  END IF;

  DELETE FROM public.deleted_accounts
  WHERE email_hash = encode(sha256(convert_to(normalized, 'UTF8')), 'hex');

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.release_deleted_account(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_deleted_account(text) TO service_role;

COMMENT ON FUNCTION public.release_deleted_account(text) IS
  'Removes an email from the deleted-account blocklist (admin appeal / mistaken deletion).';

-- Supabase Auth "Before User Created" hook. Returning an error object blocks the
-- signup and GoTrue forwards the message to the client (see docs/7_deployment.md).
-- The ACCOUNT_DELETED prefix is what src/context/AuthContext.tsx maps to the
-- localized message.
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

REVOKE ALL ON FUNCTION public.before_user_created_hook(jsonb) FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.before_user_created_hook(jsonb) TO supabase_auth_admin';
  END IF;
END $$;
