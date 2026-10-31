import { supabase } from '../lib/supabase';

export type AdminExportScope = 'users' | 'report';

/** Audit-before-download. Throws if the audit row cannot be written. */
export async function logAdminExport(
  scope: AdminExportScope,
  count: number,
  extra?: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase.rpc('log_admin_action', {
    p_action: 'export_data',
    p_target_user_id: null,
    p_details: { scope, count, format: 'csv', ...extra },
  });
  if (error) throw error;
}
