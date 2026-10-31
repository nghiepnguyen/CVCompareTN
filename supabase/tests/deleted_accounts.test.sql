-- Run against a disposable database after migration 20261102100000.
-- Covers: normalization, service_role-only writes, anon read-only check,
-- release, and the before_user_created auth-hook contract.
BEGIN;

DO $$
DECLARE
  rejected jsonb;
  allowed jsonb;
  admin_id uuid := gen_random_uuid();
BEGIN
  -- Writes are service_role only (called from _server-lib/admin/deleteUser.ts).
  EXECUTE 'SET LOCAL ROLE service_role';
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  ASSERT public.record_deleted_account('ThanhNghiep@Yahoo.com ', admin_id), 'record returned false';
  ASSERT public.record_deleted_account('thanhnghiep@yahoo.com', admin_id), 're-record must stay idempotent';
  ASSERT public.record_deleted_account('', NULL) = false, 'empty email must not be recorded';
  EXECUTE 'RESET ROLE';

  -- Case + surrounding whitespace normalize to the same hash.
  ASSERT public.email_is_deleted_account('  THANHNGHIEP@yahoo.com  '), 'blocked email not found';
  ASSERT NOT public.email_is_deleted_account('someone.else@yahoo.com'), 'unrelated email blocked';
  ASSERT NOT public.email_is_deleted_account(''), 'empty email reported as blocked';

  -- Auth hook contract: reject with a mappable message, allow everything else.
  rejected := public.before_user_created_hook(
    jsonb_build_object('user', jsonb_build_object('email', 'ThanhNghiep@yahoo.com'))
  );
  ASSERT rejected->'error'->>'http_code' = '400', 'hook must reject with http_code 400';
  ASSERT rejected->'error'->>'message' LIKE 'ACCOUNT_DELETED%', 'hook message must start with ACCOUNT_DELETED';

  allowed := public.before_user_created_hook(
    jsonb_build_object('user', jsonb_build_object('email', 'new.user@yahoo.com'))
  );
  ASSERT allowed = '{}'::jsonb, 'hook must allow unknown emails';

  -- Phone-only signups have no email; the hook must not error.
  ASSERT public.before_user_created_hook(jsonb_build_object('user', jsonb_build_object('email', null))) = '{}'::jsonb,
    'hook must allow missing email';

  -- anon (signup form, pre-auth) may run the check...
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claim.role', 'anon', true);
  ASSERT public.email_is_deleted_account('thanhnghiep@yahoo.com'), 'anon check failed';

  -- ...but cannot read or write the blocklist directly.
  BEGIN
    PERFORM count(*) FROM public.deleted_accounts;
    RAISE EXCEPTION 'anon read deleted_accounts';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    INSERT INTO public.deleted_accounts (email_hash) VALUES ('deadbeef');
    RAISE EXCEPTION 'anon wrote deleted_accounts';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  EXECUTE 'RESET ROLE';

  -- The auth server role can execute the hook when it exists in this database.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    EXECUTE 'SET LOCAL ROLE supabase_auth_admin';
    PERFORM public.before_user_created_hook(
      jsonb_build_object('user', jsonb_build_object('email', 'thanhnghiep@yahoo.com'))
    );
    EXECUTE 'RESET ROLE';
  END IF;

  -- Release clears the block and is service_role only.
  EXECUTE 'SET LOCAL ROLE service_role';
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  ASSERT public.release_deleted_account(' thanhnghiep@yahoo.com '), 'release failed';
  ASSERT NOT public.email_is_deleted_account('thanhnghiep@yahoo.com'), 'release did not clear the block';
  ASSERT public.release_deleted_account('thanhnghiep@yahoo.com') = false, 'second release must be a no-op';
  EXECUTE 'RESET ROLE';
END $$;

ROLLBACK;
