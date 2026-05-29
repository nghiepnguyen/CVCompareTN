-- Saved CVs table for CV Store feature
-- Free: 1 CV, Pro: 10 CVs
CREATE TABLE IF NOT EXISTS public.saved_cvs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  cv_id text NOT NULL,
  file_name text NOT NULL DEFAULT '',
  file_path text NOT NULL DEFAULT '',
  file_type text NOT NULL DEFAULT '',
  file_size bigint NOT NULL DEFAULT 0,
  timestamp timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint per user per cv_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.conname = 'saved_cvs_user_cv_unique'
      AND n.nspname = 'public' AND t.relname = 'saved_cvs'
  ) THEN
    ALTER TABLE public.saved_cvs
      ADD CONSTRAINT saved_cvs_user_cv_unique UNIQUE (user_id, cv_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_saved_cvs_user_timestamp ON public.saved_cvs (user_id, timestamp DESC);

COMMENT ON TABLE public.saved_cvs IS 'User-saved CV files metadata';

-- RLS Policies
ALTER TABLE public.saved_cvs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "saved_cvs_select_own" ON public.saved_cvs;
DROP POLICY IF EXISTS "saved_cvs_insert_own" ON public.saved_cvs;
DROP POLICY IF EXISTS "saved_cvs_delete_own" ON public.saved_cvs;

CREATE POLICY "saved_cvs_select_own"
ON public.saved_cvs FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "saved_cvs_insert_own"
ON public.saved_cvs FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "saved_cvs_delete_own"
ON public.saved_cvs FOR DELETE TO authenticated
USING (user_id = auth.uid());