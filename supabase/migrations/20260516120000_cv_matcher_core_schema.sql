-- CV Matcher & Optimizer — core schema (idempotent: safe if tables already exist from an older setup).
-- Apply: `supabase db push` or SQL Editor.
--
-- If ADD CONSTRAINT history_user_analysis_unique fails: you have duplicate (user_id, analysis_id)
-- rows — dedupe or delete duplicates then re-run.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email text NOT NULL DEFAULT '',
  display_name text NOT NULL DEFAULT '',
  photo_url text,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  has_permission boolean NOT NULL DEFAULT true,
  usage_count integer NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  is_new boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles (role);

CREATE TABLE IF NOT EXISTS public.history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  analysis_id text NOT NULL,
  timestamp timestamptz NOT NULL DEFAULT now(),
  jd_title text,
  job_title text,
  cv_name text,
  match_score numeric,
  category_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  matching_points jsonb NOT NULL DEFAULT '[]'::jsonb,
  missing_gaps jsonb NOT NULL DEFAULT '[]'::jsonb,
  success_probability text,
  pass_probability text,
  pass_explanation text,
  main_factor text,
  ats_keywords jsonb NOT NULL DEFAULT '[]'::jsonb,
  rewrite_suggestions jsonb NOT NULL DEFAULT '[]'::jsonb,
  full_rewritten_cv text,
  cv_url text,
  jd_url text,
  detailed_comparison jsonb NOT NULL DEFAULT '{}'::jsonb,
  rating integer,
  feedback text,
  language text NOT NULL DEFAULT 'vi',
  parsed_cv jsonb
);

-- Older DBs: ensure Parsed CV column exists even when history predates this migration
ALTER TABLE public.history
  ADD COLUMN IF NOT EXISTS parsed_cv jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.conname = 'history_user_analysis_unique'
      AND n.nspname = 'public' AND t.relname = 'history'
  ) THEN
    ALTER TABLE public.history
      ADD CONSTRAINT history_user_analysis_unique UNIQUE (user_id, analysis_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_history_user_timestamp ON public.history (user_id, timestamp DESC);

CREATE TABLE IF NOT EXISTS public.saved_jds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  jd_id text NOT NULL,
  title text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  timestamp timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.conname = 'saved_jds_user_jd_unique'
      AND n.nspname = 'public' AND t.relname = 'saved_jds'
  ) THEN
    ALTER TABLE public.saved_jds
      ADD CONSTRAINT saved_jds_user_jd_unique UNIQUE (user_id, jd_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_saved_jds_user_timestamp ON public.saved_jds (user_id, timestamp DESC);

COMMENT ON TABLE public.profiles IS 'App user profile; id mirrors auth.users';
COMMENT ON TABLE public.history IS 'Analysis runs per user; upsert conflicts on (user_id, analysis_id)';
COMMENT ON COLUMN public.history.parsed_cv IS 'Structured ParsedCV JSON from Gemini (personal_information, work_experience, skills, ats_evaluation, …)';
COMMENT ON TABLE public.saved_jds IS 'User-saved job descriptions';

-- -----------------------------------------------------------------------------
-- RPC helpers
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

COMMENT ON FUNCTION public.is_admin() IS 'True if current user row in profiles has role = admin';

CREATE OR REPLACE FUNCTION public.increment_usage_count(user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles AS p
  SET usage_count = COALESCE(p.usage_count, 0) + 1
  WHERE p.id = user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_usage_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_usage_count(uuid) TO authenticated;

COMMENT ON FUNCTION public.increment_usage_count(uuid) IS 'Atomic usage_count += 1; PostgREST body key must remain user_id';

-- -----------------------------------------------------------------------------
-- Row Level Security (drop + recreate so re-run aligns with this migration)
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own_or_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete_own_or_admin" ON public.profiles;

CREATE POLICY "profiles_select_own_or_admin"
ON public.profiles FOR SELECT TO authenticated
USING (id = auth.uid() OR public.is_admin());

CREATE POLICY "profiles_insert_own"
ON public.profiles FOR INSERT TO authenticated
WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_update_own_or_admin"
ON public.profiles FOR UPDATE TO authenticated
USING (id = auth.uid() OR public.is_admin())
WITH CHECK (id = auth.uid() OR public.is_admin());

CREATE POLICY "profiles_delete_own_or_admin"
ON public.profiles FOR DELETE TO authenticated
USING (id = auth.uid() OR public.is_admin());

ALTER TABLE public.history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "history_select_own" ON public.history;
DROP POLICY IF EXISTS "history_insert_own" ON public.history;
DROP POLICY IF EXISTS "history_update_own" ON public.history;
DROP POLICY IF EXISTS "history_delete_own" ON public.history;

CREATE POLICY "history_select_own"
ON public.history FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "history_insert_own"
ON public.history FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "history_update_own"
ON public.history FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "history_delete_own"
ON public.history FOR DELETE TO authenticated
USING (user_id = auth.uid());

ALTER TABLE public.saved_jds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "saved_jds_select_own" ON public.saved_jds;
DROP POLICY IF EXISTS "saved_jds_insert_own" ON public.saved_jds;
DROP POLICY IF EXISTS "saved_jds_update_own" ON public.saved_jds;
DROP POLICY IF EXISTS "saved_jds_delete_own" ON public.saved_jds;

CREATE POLICY "saved_jds_select_own"
ON public.saved_jds FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "saved_jds_insert_own"
ON public.saved_jds FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "saved_jds_update_own"
ON public.saved_jds FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "saved_jds_delete_own"
ON public.saved_jds FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- Storage: cv-files bucket
-- -----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'cv-files',
  'cv-files',
  true,
  52428800,
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "cv_files_select_public_bucket" ON storage.objects;
DROP POLICY IF EXISTS "cv_files_insert_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "cv_files_update_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "cv_files_delete_authenticated" ON storage.objects;

CREATE POLICY "cv_files_select_public_bucket"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'cv-files');

CREATE POLICY "cv_files_insert_authenticated"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'cv-files');

CREATE POLICY "cv_files_update_authenticated"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'cv-files')
WITH CHECK (bucket_id = 'cv-files');

CREATE POLICY "cv_files_delete_authenticated"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'cv-files');

-- -----------------------------------------------------------------------------
-- Realtime: profiles
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  END IF;
END $$;
