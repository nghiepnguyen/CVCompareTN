-- Run against a disposable database after migrations 20261102100000 and
-- 20261125000000 (P1-C1). Synthetic addresses only.
-- Covers: normalization, service_role-only writes, the lookup is NOT callable
-- by PUBLIC/anon/authenticated, no other exposed
-- function reaches the blocklist, release, and the before_user_created
-- auth-hook contract executed as supabase_auth_admin.
-- Denied function calls are asserted with has_function_privilege, not by
-- calling: on the local aarch64 image a denied call after SET ROLE in a
-- postgres session can crash the backend (PostgREST returns 42501 cleanly;
-- see the HTTP probe in the P1-C1 PR).
BEGIN;

DO $$
DECLARE
  rejected jsonb;
  allowed jsonb;
  admin_id uuid := gen_random_uuid();
  exposed text;
BEGIN
  -- Writes are service_role only (called from _server-lib/admin/deleteUser.ts).
  EXECUTE 'SET LOCAL ROLE service_role';
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  ASSERT public.record_deleted_account('Blocked.User@Example.TEST ', admin_id), 'record returned false';
  ASSERT public.record_deleted_account('blocked.user@example.test', admin_id), 're-record must stay idempotent';
  ASSERT public.record_deleted_account('', NULL) = false, 'empty email must not be recorded';
  -- service_role keeps the lookup (server-side support use).
  ASSERT public.email_is_deleted_account('blocked.user@example.test'), 'service_role lookup failed';
  EXECUTE 'RESET ROLE';

  -- Case + surrounding whitespace normalize to the same hash.
  ASSERT public.email_is_deleted_account('  BLOCKED.USER@example.test  '), 'blocked email not found';
  ASSERT NOT public.email_is_deleted_account('someone.else@example.test'), 'unrelated email blocked';
  ASSERT NOT public.email_is_deleted_account(''), 'empty email reported as blocked';

  -- P1-C1: no direct lookup for PUBLIC, anon or authenticated.
  ASSERT NOT has_function_privilege('public', 'public.email_is_deleted_account(text)', 'EXECUTE'), 'PUBLIC can run the lookup';
  ASSERT NOT has_function_privilege('anon', 'public.email_is_deleted_account(text)', 'EXECUTE'), 'anon can run the lookup';
  ASSERT NOT has_function_privilege('authenticated', 'public.email_is_deleted_account(text)', 'EXECUTE'), 'authenticated can run the lookup';
  ASSERT has_function_privilege('service_role', 'public.email_is_deleted_account(text)', 'EXECUTE'), 'service_role lost the lookup';
  -- Writes to the blocklist: server only (no API-role EXECUTE).
  ASSERT NOT has_function_privilege('anon', 'public.record_deleted_account(text, uuid)', 'EXECUTE')
     AND NOT has_function_privilege('authenticated', 'public.record_deleted_account(text, uuid)', 'EXECUTE'), 'API role can block an email';
  ASSERT NOT has_function_privilege('anon', 'public.release_deleted_account(text)', 'EXECUTE')
     AND NOT has_function_privilege('authenticated', 'public.release_deleted_account(text)', 'EXECUTE'), 'API role can unblock an email';
  ASSERT has_function_privilege('service_role', 'public.record_deleted_account(text, uuid)', 'EXECUTE')
     AND has_function_privilege('service_role', 'public.release_deleted_account(text)', 'EXECUTE'), 'service_role lost record/release';

  -- No indirect path: no other function that touches the blocklist is callable
  -- by anon or authenticated.
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO exposed
    FROM pg_proc AS p
   WHERE p.pronamespace = 'public'::regnamespace
     AND (p.prosrc ILIKE '%deleted_accounts%' OR p.prosrc ILIKE '%email_is_deleted_account%')
     AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  ASSERT exposed IS NULL, 'blocklist reachable by anon/authenticated via: ' || exposed;

  -- Hardening unchanged: owner postgres, SECURITY DEFINER, empty search_path.
  ASSERT (SELECT count(*) = 4
                 AND bool_and(prosecdef AND proconfig IS NOT DISTINCT FROM ARRAY['search_path=""'] AND pg_get_userbyid(proowner) = 'postgres')
            FROM pg_proc
           WHERE oid IN ('public.email_is_deleted_account(text)'::regprocedure, 'public.record_deleted_account(text, uuid)'::regprocedure,
                         'public.release_deleted_account(text)'::regprocedure, 'public.before_user_created_hook(jsonb)'::regprocedure)),
    'deleted-account functions lost DEFINER / search_path / postgres ownership';
  -- Hook grants: only the auth server role (and the owner).
  ASSERT NOT has_function_privilege('anon', 'public.before_user_created_hook(jsonb)', 'EXECUTE')
     AND NOT has_function_privilege('authenticated', 'public.before_user_created_hook(jsonb)', 'EXECUTE')
     AND NOT has_function_privilege('public', 'public.before_user_created_hook(jsonb)', 'EXECUTE'), 'hook callable by an API role';
  -- Table grants unchanged.
  ASSERT NOT has_table_privilege('anon', 'public.deleted_accounts', 'SELECT')
     AND NOT has_table_privilege('authenticated', 'public.deleted_accounts', 'SELECT')
     AND has_table_privilege('service_role', 'public.deleted_accounts', 'SELECT')
     AND has_table_privilege('service_role', 'public.deleted_accounts', 'INSERT')
     AND has_table_privilege('service_role', 'public.deleted_accounts', 'DELETE'), 'deleted_accounts table grants changed';

  -- Auth hook contract: reject with a neutral, mappable message; allow everything else.
  rejected := public.before_user_created_hook(
    jsonb_build_object('user', jsonb_build_object('email', 'Blocked.User@example.test'))
  );
  ASSERT rejected->'error'->>'http_code' = '400', 'hook must reject with http_code 400';
  ASSERT rejected->'error'->>'message' LIKE 'SIGNUP_BLOCKED%', 'hook message must start with SIGNUP_BLOCKED';
  ASSERT rejected->'error'->>'message' !~* '(xóa|xoá|delet|vĩnh viễn|permanent)', 'hook message discloses deletion history';

  allowed := public.before_user_created_hook(
    jsonb_build_object('user', jsonb_build_object('email', 'new.user@example.test'))
  );
  ASSERT allowed = '{}'::jsonb, 'hook must allow unknown emails';

  -- Phone-only signups have no email; the hook must not error.
  ASSERT public.before_user_created_hook(jsonb_build_object('user', jsonb_build_object('email', null))) = '{}'::jsonb,
    'hook must allow missing email';

  -- anon cannot read or write the blocklist directly.
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claim.role', 'anon', true);
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

  -- The auth server role runs the hook exactly as GoTrue does: the DEFINER hook
  -- still reaches the (now revoked) lookup through its owner.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    EXECUTE 'SET LOCAL ROLE supabase_auth_admin';
    rejected := public.before_user_created_hook(
      jsonb_build_object('user', jsonb_build_object('email', 'blocked.user@example.test'))
    );
    allowed := public.before_user_created_hook(
      jsonb_build_object('user', jsonb_build_object('email', 'fresh.user@example.test'))
    );
    EXECUTE 'RESET ROLE';
    ASSERT rejected->'error'->>'message' LIKE 'SIGNUP_BLOCKED%', 'hook as supabase_auth_admin did not block';
    ASSERT allowed = '{}'::jsonb, 'hook as supabase_auth_admin blocked a fresh email';
  END IF;

  -- Release clears the block and is service_role only.
  EXECUTE 'SET LOCAL ROLE service_role';
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  ASSERT public.release_deleted_account(' blocked.user@example.test '), 'release failed';
  ASSERT NOT public.email_is_deleted_account('blocked.user@example.test'), 'release did not clear the block';
  ASSERT public.release_deleted_account('blocked.user@example.test') = false, 'second release must be a no-op';
  EXECUTE 'RESET ROLE';
  ASSERT public.before_user_created_hook(
    jsonb_build_object('user', jsonb_build_object('email', 'blocked.user@example.test'))) = '{}'::jsonb,
    'released email still blocked by the hook';
END $$;

ROLLBACK;
