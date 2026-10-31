import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
vi.mock('../../lib/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }));

import { fetchAdminAuditPage } from '../../services/adminAuditService';

describe('fetchAdminAuditPage', () => {
  beforeEach(() => rpc.mockReset());

  it('maps audit rows and sends pagination/filter args', async () => {
    rpc.mockResolvedValue({
      data: {
        total: 41,
        rows: [
          {
            id: 'a1',
            admin_id: 'admin-1',
            admin_email: 'admin@x.com',
            action: 'delete_user',
            target_user_id: null,
            target_email: 'gone@x.com',
            details: { email: 'gone@x.com' },
            created_at: '2026-10-31T03:00:00Z',
          },
        ],
      },
      error: null,
    });

    const result = await fetchAdminAuditPage({
      action: 'delete_user',
      search: 'gone',
      page: 2,
      pageSize: 20,
    });

    expect(rpc).toHaveBeenCalledWith('admin_list_audit', {
      p_action: 'delete_user',
      p_search: 'gone',
      p_limit: 20,
      p_offset: 20,
    });
    expect(result.total).toBe(41);
    expect(result.rows[0]).toEqual({
      id: 'a1',
      adminId: 'admin-1',
      adminEmail: 'admin@x.com',
      action: 'delete_user',
      targetUserId: null,
      targetEmail: 'gone@x.com',
      details: { email: 'gone@x.com' },
      createdAt: '2026-10-31T03:00:00Z',
    });
  });

  it('throws RPC errors', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'denied' } });
    await expect(
      fetchAdminAuditPage({ action: 'all', search: '', page: 1, pageSize: 20 })
    ).rejects.toEqual({ message: 'denied' });
  });
});
