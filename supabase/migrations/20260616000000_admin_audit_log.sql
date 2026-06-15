-- Admin audit log: records every destructive/privileged admin action for forensic review.

CREATE TABLE public.admin_audit_log (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  action     text        NOT NULL,
  target_user_id uuid    REFERENCES auth.users(id) ON DELETE SET NULL,
  details    jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX admin_audit_log_admin_id_idx        ON public.admin_audit_log (admin_id);
CREATE INDEX admin_audit_log_target_user_id_idx  ON public.admin_audit_log (target_user_id);
CREATE INDEX admin_audit_log_created_at_idx      ON public.admin_audit_log (created_at DESC);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Admins can read all audit log entries
CREATE POLICY "admins_can_read_audit_log"
  ON public.admin_audit_log
  FOR SELECT
  USING (public.is_admin());

-- Authenticated users can only insert rows where they are the actor
CREATE POLICY "self_insert_audit_log"
  ON public.admin_audit_log
  FOR INSERT
  WITH CHECK (admin_id = auth.uid());

REVOKE ALL ON public.admin_audit_log FROM PUBLIC;
GRANT SELECT, INSERT ON public.admin_audit_log TO authenticated;

COMMENT ON TABLE public.admin_audit_log IS
  'Immutable audit trail for admin actions (role change, plan change, delete, permission toggle).';
