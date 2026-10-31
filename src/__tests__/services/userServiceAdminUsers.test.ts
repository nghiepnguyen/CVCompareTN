import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();

vi.mock('../../lib/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }));

import { fetchAdminUsersPage } from '../../services/userService';
import type { AdminUsersQuery } from '../../services/userService';

const QUERY: AdminUsersQuery = {
  search: '  bob  ',
  plan: 'pro',
  role: 'user',
  status: 'active',
  sort: 'usage_desc',
  page: 2,
  pageSize: 20,
};

function row(id: string) {
  return {
    id,
    email: `${id}@x.com`,
    display_name: id,
    role: 'user',
    has_permission: true,
    usage_count: 1,
    effective_usage_count: 1,
    monthly_analytics_limit: null,
    monthly_analytics_limit_custom: false,
    created_at: '2026-10-01T00:00:00Z',
  };
}

describe('fetchAdminUsersPage', () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it('sends server-side filters/pagination and maps rows + new-user preview', async () => {
    rpc.mockResolvedValue({
      data: {
        rows: [row('u21')],
        total: 41,
        new_users_count: 3,
        new_users: [row('new1')],
      },
      error: null,
    });

    const result = await fetchAdminUsersPage(QUERY);

    expect(rpc).toHaveBeenCalledWith('admin_list_profiles', {
      p_search: 'bob',
      p_plan: 'pro',
      p_role: 'user',
      p_status: 'active',
      p_sort: 'usage_desc',
      p_limit: 20,
      p_offset: 20,
    });
    expect(result.total).toBe(41);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].email).toBe('u21@x.com');
    expect(result.newUsersCount).toBe(3);
    expect(result.newUsers[0].id).toBe('new1');
  });

  it('throws RPC errors instead of returning an empty page', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } });

    await expect(fetchAdminUsersPage(QUERY)).rejects.toEqual({ message: 'permission denied' });
  });
});
