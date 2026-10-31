-- Run after migration 20261101150000 on a disposable database; fixtures rollback.
-- B7: only admins may use custom unlimited (custom=true, limit=NULL).
BEGIN;
DO $$
DECLARE
  normal_user uuid := gen_random_uuid();
  admin_user  uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users(id) VALUES (normal_user), (admin_user);
  INSERT INTO public.profiles(id, email, role) VALUES
    (normal_user, 'normal@example.test', 'user'),
    (admin_user,  'admin@example.test',  'admin');

  -- Normal user: custom unlimited must be rejected.
  BEGIN
    UPDATE public.profiles
    SET monthly_analytics_limit_custom = true,
        monthly_analytics_limit = NULL
    WHERE id = normal_user;
    RAISE EXCEPTION 'non-admin unlimited was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Normal user: inherit (custom=false) and explicit numeric limit stay allowed.
  UPDATE public.profiles
  SET monthly_analytics_limit_custom = false,
      monthly_analytics_limit = NULL
  WHERE id = normal_user;

  UPDATE public.profiles
  SET monthly_analytics_limit_custom = true,
      monthly_analytics_limit = 20
  WHERE id = normal_user;

  -- Admin: custom unlimited remains allowed (admins are unlimited by role anyway).
  UPDATE public.profiles
  SET monthly_analytics_limit_custom = true,
      monthly_analytics_limit = NULL
  WHERE id = admin_user;
END $$;
ROLLBACK;
