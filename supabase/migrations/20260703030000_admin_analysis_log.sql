-- Analysis log: one row per /api/analyze attempt (success or error), used for
-- the Admin > Report tab (daily volume, success/error split, top users).
-- Inserted server-side only via the service-role client (handleAnalyze), so no
-- INSERT grant is given to `authenticated` — only admins may SELECT.

CREATE TABLE public.analysis_log (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  status     text        NOT NULL CHECK (status IN ('success', 'error')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX analysis_log_created_at_idx ON public.analysis_log (created_at DESC);
CREATE INDEX analysis_log_user_id_idx    ON public.analysis_log (user_id);

ALTER TABLE public.analysis_log ENABLE ROW LEVEL SECURITY;

-- Admins can read all analysis log entries
CREATE POLICY "admins_can_read_analysis_log"
  ON public.analysis_log
  FOR SELECT
  USING (public.is_admin());

REVOKE ALL ON public.analysis_log FROM PUBLIC;
GRANT SELECT ON public.analysis_log TO authenticated;

COMMENT ON TABLE public.analysis_log IS
  'One row per /api/analyze attempt (success or error); admin-only read for reporting.';
