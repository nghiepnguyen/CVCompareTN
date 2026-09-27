import type { SupabaseClient } from '@supabase/supabase-js';

export type ServerAuditAction = 'update_role' | 'update_plan' | 'delete_user';

/**
 * Writes an admin_audit_log row from the server (service role), right next to
 * the privileged action it records. Non-critical: a failed insert is logged
 * and never fails the admin action itself.
 */
export async function logAdminAudit(
  supabase: SupabaseClient,
  adminId: string,
  action: ServerAuditAction,
  targetUserId: string,
  details?: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase.from('admin_audit_log').insert({
    admin_id: adminId,
    action,
    target_user_id: targetUserId,
    details: details ?? null,
  });
  if (error) console.error('admin_audit_log insert failed:', error);
}
