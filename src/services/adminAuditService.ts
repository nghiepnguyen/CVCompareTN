import { supabase } from '../lib/supabase';

export const ADMIN_AUDIT_ACTIONS = [
  'update_role',
  'update_plan',
  'delete_user',
  'update_permission',
  'update_analytics_limit',
  'reset_analytics_limit',
  'update_app_setting',
  'export_data',
] as const;

export type AdminAuditAction = (typeof ADMIN_AUDIT_ACTIONS)[number];

export interface AdminAuditRow {
  id: string;
  adminId: string;
  adminEmail: string;
  action: string;
  targetUserId: string | null;
  targetEmail: string;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export interface AdminAuditQuery {
  action: AdminAuditAction | 'all';
  search: string;
  page: number;
  pageSize: number;
}

export interface AdminAuditPage {
  rows: AdminAuditRow[];
  total: number;
}

interface RawAuditRow {
  id?: string;
  admin_id?: string;
  admin_email?: string;
  action?: string;
  target_user_id?: string | null;
  target_email?: string;
  details?: Record<string, unknown> | null;
  created_at?: string;
}

export async function fetchAdminAuditPage(query: AdminAuditQuery): Promise<AdminAuditPage> {
  const pageSize = Math.min(Math.max(Math.trunc(query.pageSize) || 20, 1), 100);
  const page = Math.max(Math.trunc(query.page) || 1, 1);
  const { data, error } = await supabase.rpc('admin_list_audit', {
    p_action: query.action,
    p_search: query.search.trim() || null,
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
  });

  if (error) throw error;
  const result = (data ?? {}) as { rows?: RawAuditRow[]; total?: number };
  return {
    rows: (result.rows ?? []).map((row) => ({
      id: String(row.id ?? ''),
      adminId: String(row.admin_id ?? ''),
      adminEmail: String(row.admin_email ?? ''),
      action: String(row.action ?? ''),
      targetUserId: row.target_user_id ?? null,
      targetEmail: String(row.target_email ?? ''),
      details: row.details ?? null,
      createdAt: String(row.created_at ?? ''),
    })),
    total: Number(result.total ?? 0),
  };
}
