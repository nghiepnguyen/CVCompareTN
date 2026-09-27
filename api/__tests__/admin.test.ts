// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

vi.mock('../../_server-lib/sentry.js', () => ({
  initSentryServer: vi.fn(),
  Sentry: { captureException: vi.fn() },
}));

vi.mock('../../_server-lib/payment/supabaseAdmin.js', () => ({
  getUserFromBearerToken: vi.fn(),
  getSupabaseAdmin: vi.fn(),
}));

import handler from '../admin.js';
import * as supabaseAdmin from '../../_server-lib/payment/supabaseAdmin.js';

const mockGetUser = vi.mocked(supabaseAdmin.getUserFromBearerToken);
const mockGetAdmin = vi.mocked(supabaseAdmin.getSupabaseAdmin);

function makeReq(action: string, body: Record<string, unknown>): VercelRequest {
  return {
    method: 'POST',
    url: `/api/admin/${action}`,
    headers: { host: 'localhost', authorization: 'Bearer tok' },
    body,
  } as unknown as VercelRequest;
}

function makeRes() {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  return { res: { status } as unknown as VercelResponse, status, json };
}

/** Service-role client stub: caller role, target profile, audit insert, RPC, auth delete. */
function makeAdminClient(opts: { callerRole: string; target?: { id: string; email: string; role: string } }) {
  const auditInsert = vi.fn().mockResolvedValue({ error: null });
  const deleteUser = vi.fn().mockResolvedValue({ error: null });
  const rpc = vi.fn().mockResolvedValue({ error: null });
  const client = {
    from: (table: string) => {
      if (table === 'admin_audit_log') return { insert: auditInsert };
      return {
        select: () => ({
          eq: (_col: string, id: string) => ({
            maybeSingle: () =>
              Promise.resolve({
                data: id === 'admin-1' ? { role: opts.callerRole } : (opts.target ?? null),
                error: null,
              }),
          }),
        }),
      };
    },
    rpc,
    storage: { from: () => ({ list: () => Promise.resolve({ data: [], error: null }), remove: vi.fn() }) },
    auth: { admin: { deleteUser } },
  };
  return { client, auditInsert, deleteUser, rpc };
}

describe('api/admin handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockGetUser.mockResolvedValue({ id: 'admin-1' } as never);
  });

  it('delete-user: hard-deletes the auth user when caller is admin', async () => {
    const { client, deleteUser } = makeAdminClient({
      callerRole: 'admin',
      target: { id: 'user-1', email: 'u@x.com', role: 'user' },
    });
    mockGetAdmin.mockReturnValue(client as never);
    const { res, status } = makeRes();

    await handler(makeReq('delete-user', { p_user_id: 'user-1' }), res);

    expect(status).toHaveBeenCalledWith(200);
    expect(deleteUser).toHaveBeenCalledWith('user-1');
  });

  it('delete-user: rejects non-admin callers with 403', async () => {
    const { client, deleteUser } = makeAdminClient({ callerRole: 'user' });
    mockGetAdmin.mockReturnValue(client as never);
    const { res, status } = makeRes();

    await handler(makeReq('delete-user', { p_user_id: 'user-1' }), res);

    expect(status).toHaveBeenCalledWith(403);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('delete-user: 400 when p_user_id missing', async () => {
    const { client } = makeAdminClient({ callerRole: 'admin' });
    mockGetAdmin.mockReturnValue(client as never);
    const { res, status } = makeRes();

    await handler(makeReq('delete-user', {}), res);

    expect(status).toHaveBeenCalledWith(400);
  });

  it('set-user-role: writes a server-side audit row after the RPC succeeds', async () => {
    const { client, auditInsert } = makeAdminClient({ callerRole: 'admin' });
    mockGetAdmin.mockReturnValue(client as never);
    const { res, status } = makeRes();

    await handler(makeReq('set-user-role', { p_user_id: 'user-1', p_role: 'admin' }), res);

    expect(status).toHaveBeenCalledWith(200);
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({ admin_id: 'admin-1', action: 'update_role', target_user_id: 'user-1', details: { role: 'admin' } })
    );
  });

  it('set-user-plan: writes a server-side audit row after the RPC succeeds', async () => {
    const { client, auditInsert } = makeAdminClient({ callerRole: 'admin' });
    mockGetAdmin.mockReturnValue(client as never);
    const { res } = makeRes();

    await handler(makeReq('set-user-plan', { p_user_id: 'user-1', p_plan: 'pro', p_duration_days: 90 }), res);

    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'update_plan', target_user_id: 'user-1', details: { plan: 'pro', duration_days: 90 } })
    );
  });

  it('set-user-role: no audit row when the RPC fails', async () => {
    const { client, auditInsert, rpc } = makeAdminClient({ callerRole: 'admin' });
    rpc.mockResolvedValue({ error: { message: 'boom' } });
    mockGetAdmin.mockReturnValue(client as never);
    const { res, status } = makeRes();

    await handler(makeReq('set-user-role', { p_user_id: 'user-1', p_role: 'admin' }), res);

    expect(status).toHaveBeenCalledWith(500);
    expect(auditInsert).not.toHaveBeenCalled();
  });
});
