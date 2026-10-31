-- C9: allow audited CSV exports from the admin UI. The client logs the export
-- through the existing admin-only log_admin_action RPC before downloading.
ALTER TABLE public.admin_audit_log
  DROP CONSTRAINT IF EXISTS admin_audit_log_action_check;

ALTER TABLE public.admin_audit_log
  ADD CONSTRAINT admin_audit_log_action_check CHECK (action IN (
    'update_role','update_plan','delete_user',
    'update_permission','update_analytics_limit','reset_analytics_limit',
    'update_app_setting','export_data'
  ));
