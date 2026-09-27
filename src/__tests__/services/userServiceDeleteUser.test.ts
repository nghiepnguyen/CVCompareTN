import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const profilesDelete = vi.fn();

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { access_token: 'tok' } } }),
      getUser: () => Promise.resolve({ data: { user: { id: 'admin-1' } } }),
    },
    from: () => ({
      delete: () => {
        profilesDelete();
        return { eq: () => Promise.resolve({ error: null }) };
      },
      insert: () => Promise.resolve({ error: null }),
    }),
  },
}));

import { deleteUser } from '../../services/userService';

describe('deleteUser (admin, client side)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    profilesDelete.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('hard-deletes through the server endpoint instead of deleting the profiles row', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    await deleteUser('user-1');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/delete-user',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer tok' }),
        body: JSON.stringify({ p_user_id: 'user-1' }),
      })
    );
    expect(profilesDelete).not.toHaveBeenCalled();
  });

  it('surfaces the server error message', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: 'Demote this admin to user before deleting' }),
    });

    await expect(deleteUser('user-1')).rejects.toThrow('Demote this admin to user before deleting');
  });
});
