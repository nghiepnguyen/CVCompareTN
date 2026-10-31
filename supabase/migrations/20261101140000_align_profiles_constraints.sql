-- §4.11: converge production with the source migration chain.
--
-- `public.profiles` existed (created through the dashboard) before
-- 20260516120000 ran, so its `CREATE TABLE IF NOT EXISTS` skipped the inline
-- CHECK constraints that a fresh database gets. Existing data was verified
-- clean (no role outside user/admin, no negative usage_count) before adding
-- them. `profiles_email_key` was an ad-hoc unique constraint from the same
-- era, not part of any migration; auth.users already enforces unique emails,
-- so dropping it removes drift without changing app behaviour.
--
-- Remaining known drift is intentionally not rewritten here because it would
-- need a data migration: `history.id` / `saved_jds.id` are bigint on
-- production but uuid in 20260516120000, and `history.match_score` is integer
-- vs numeric. See docs/7_deployment.md §Migration drift.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_role_check' AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_role_check CHECK (role IN ('user', 'admin'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_usage_count_check' AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_usage_count_check CHECK (usage_count >= 0);
  END IF;
END $$;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_email_key;
