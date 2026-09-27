import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminDeleteUser } from '../deleteUser';

const CALLER = 'admin-1';
const TARGET = 'user-1';

type StorageEntry = { name: string; id: string | null };

interface MockOptions {
  targetProfile?: { id: string; email: string; role: string } | null;
  /** bucket -> prefix -> entries */
  storage?: Record<string, Record<string, StorageEntry[]>>;
  listError?: string;
  deleteUserError?: { status: number; message: string } | null;
}

function makeSupabase(opts: MockOptions = {}) {
  const auditInsert = vi.fn().mockResolvedValue({ error: null });
  const profileDeleteEq = vi.fn().mockResolvedValue({ error: null });
  const storageRemove = vi.fn().mockResolvedValue({ error: null });
  const deleteUser = vi.fn().mockResolvedValue({ error: opts.deleteUserError ?? null });

  const from = vi.fn((table: string) => {
    if (table === 'admin_audit_log') return { insert: auditInsert };
    // profiles
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({
              data: opts.targetProfile === undefined
                ? { id: TARGET, email: 'u@x.com', role: 'user' }
                : opts.targetProfile,
              error: null,
            }),
        }),
      }),
      delete: () => ({ eq: profileDeleteEq }),
    };
  });

  const storageFrom = vi.fn((bucket: string) => ({
    list: (prefix: string) =>
      opts.listError
        ? Promise.resolve({ data: null, error: { message: opts.listError } })
        : Promise.resolve({ data: opts.storage?.[bucket]?.[prefix] ?? [], error: null }),
    remove: (paths: string[]) => storageRemove(bucket, paths),
  }));

  const client = {
    from,
    storage: { from: storageFrom },
    auth: { admin: { deleteUser } },
  } as unknown as SupabaseClient;

  return { client, auditInsert, profileDeleteEq, storageRemove, deleteUser };
}

describe('adminDeleteUser', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('refuses to delete the caller themselves', async () => {
    const { client, deleteUser } = makeSupabase();
    const result = await adminDeleteUser(client, CALLER, CALLER);
    expect(result).toEqual({ ok: false, status: 400, error: 'Cannot delete your own account' });
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('refuses to delete an admin', async () => {
    const { client, deleteUser, auditInsert } = makeSupabase({
      targetProfile: { id: TARGET, email: 'a@x.com', role: 'admin' },
    });
    const result = await adminDeleteUser(client, CALLER, TARGET);
    expect(result.ok).toBe(false);
    expect(deleteUser).not.toHaveBeenCalled();
    expect(auditInsert).not.toHaveBeenCalled();
  });

  it('audits with email, removes nested storage files, then deletes the auth user', async () => {
    const { client, auditInsert, storageRemove, deleteUser } = makeSupabase({
      storage: {
        'cv-files': {
          [TARGET]: [
            { name: 'cv-1', id: null },
            { name: 'campaigns', id: null },
          ],
          [`${TARGET}/cv-1`]: [{ name: 'a.pdf', id: 'f1' }],
          [`${TARGET}/campaigns`]: [{ name: 'c1', id: null }],
          [`${TARGET}/campaigns/c1`]: [{ name: 'b.pdf', id: 'f2' }],
        },
        'cv-analyze-tmp': {
          [TARGET]: [{ name: 'tmp.pdf', id: 'f3' }],
        },
      },
    });

    const result = await adminDeleteUser(client, CALLER, TARGET);

    expect(result).toEqual({ ok: true, storageErrors: [] });
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({ admin_id: CALLER, action: 'delete_user', target_user_id: TARGET, details: { email: 'u@x.com' } })
    );
    expect(storageRemove).toHaveBeenCalledWith('cv-files', [
      `${TARGET}/cv-1/a.pdf`,
      `${TARGET}/campaigns/c1/b.pdf`,
    ]);
    expect(storageRemove).toHaveBeenCalledWith('cv-analyze-tmp', [`${TARGET}/tmp.pdf`]);
    expect(deleteUser).toHaveBeenCalledWith(TARGET);
  });

  it('still deletes the account when storage cleanup fails', async () => {
    const { client, deleteUser } = makeSupabase({ listError: 'boom' });
    const result = await adminDeleteUser(client, CALLER, TARGET);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.storageErrors).toHaveLength(2);
    expect(deleteUser).toHaveBeenCalledWith(TARGET);
  });

  it('removes a stray profile when the auth user is already gone (404)', async () => {
    const { client, profileDeleteEq } = makeSupabase({
      deleteUserError: { status: 404, message: 'User not found' },
    });
    const result = await adminDeleteUser(client, CALLER, TARGET);
    expect(result.ok).toBe(true);
    expect(profileDeleteEq).toHaveBeenCalledWith('id', TARGET);
  });

  it('propagates other auth delete errors as 500', async () => {
    const { client } = makeSupabase({
      deleteUserError: { status: 500, message: 'db down' },
    });
    const result = await adminDeleteUser(client, CALLER, TARGET);
    expect(result).toEqual({ ok: false, status: 500, error: 'db down' });
  });
});
