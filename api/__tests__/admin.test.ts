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

vi.mock('../../_server-lib/rateLimit.js', () => ({
  enforceRateLimit: vi.fn().mockResolvedValue(true),
  rateLimitSubject: (id: string) => `u:${id}`,
}));

import handler from '../admin.js';
import * as supabaseAdmin from '../../_server-lib/payment/supabaseAdmin.js';
import { enforceRateLimit } from '../../_server-lib/rateLimit.js';

const mockGetUser = vi.mocked(supabaseAdmin.getUserFromBearerToken);
const mockGetAdmin = vi.mocked(supabaseAdmin.getSupabaseAdmin);

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const TARGET_ID = '22222222-2222-4222-8222-222222222222';
const REQUEST_ID = '44444444-4444-4444-8444-444444444444';

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
  return { res: { status, setHeader: vi.fn(), end: vi.fn() } as unknown as VercelResponse, status, json };
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
                data: id === ADMIN_ID ? { role: opts.callerRole } : (opts.target ?? null),
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
    mockGetUser.mockResolvedValue({ id: ADMIN_ID } as never);
    vi.mocked(enforceRateLimit).mockResolvedValue(true);
  });

  it('delete-user: hard-deletes the auth user when caller is admin', async () => {
    const { client, deleteUser } = makeAdminClient({
      callerRole: 'admin',
      target: { id: TARGET_ID, email: 'u@x.com', role: 'user' },
    });
    mockGetAdmin.mockReturnValue(client as never);
    const { res, status } = makeRes();

    await handler(makeReq('delete-user', { p_user_id: TARGET_ID }), res);

    expect(status).toHaveBeenCalledWith(200);
    expect(deleteUser).toHaveBeenCalledWith(TARGET_ID);
  });

  it('delete-user: rejects non-admin callers with 403', async () => {
    const { client, deleteUser } = makeAdminClient({ callerRole: 'user' });
    mockGetAdmin.mockReturnValue(client as never);
    const { res, status } = makeRes();

    await handler(makeReq('delete-user', { p_user_id: TARGET_ID }), res);

    expect(status).toHaveBeenCalledWith(403);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('delete-user: 400 when p_user_id is missing or not a UUID', async () => {
    const { client } = makeAdminClient({ callerRole: 'admin' });
    mockGetAdmin.mockReturnValue(client as never);
    const { res, status } = makeRes();

    await handler(makeReq('delete-user', { p_user_id: 'not-a-uuid' }), res);

    expect(status).toHaveBeenCalledWith(400);
  });

  it('set-user-role: writes a server-side audit row after the RPC succeeds', async () => {
    const { client, auditInsert } = makeAdminClient({ callerRole: 'admin' });
    mockGetAdmin.mockReturnValue(client as never);
    const { res, status } = makeRes();

    await handler(makeReq('set-user-role', { p_user_id: TARGET_ID, p_role: 'admin' }), res);

    expect(status).toHaveBeenCalledWith(200);
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        admin_id: ADMIN_ID,
        action: 'update_role',
        target_user_id: TARGET_ID,
        details: { role: 'admin' },
      })
    );
  });

  it('set-user-plan: writes a server-side audit row after the RPC succeeds', async () => {
    const { client, auditInsert } = makeAdminClient({ callerRole: 'admin' });
    mockGetAdmin.mockReturnValue(client as never);
    const { res } = makeRes();

    await handler(makeReq('set-user-plan', { p_user_id: TARGET_ID, p_plan: 'pro', p_duration_days: 90 }), res);

    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'update_plan',
        target_user_id: TARGET_ID,
        details: { plan: 'pro', duration_days: 90 },
      })
    );
  });

  it('update-user: sends plan + limit in one atomic RPC (audit lives in the RPC)', async () => {
    const { client, rpc, auditInsert } = makeAdminClient({ callerRole: 'admin' });
    mockGetAdmin.mockReturnValue(client as never);
    const { res, status } = makeRes();

    await handler(
      makeReq('update-user', {
        p_user_id: TARGET_ID,
        p_request_id: REQUEST_ID,
        p_plan: 'pro',
        p_duration_days: 90,
        p_limit_mode: 'custom',
        p_limit: 20,
      }),
      res
    );

    expect(status).toHaveBeenCalledWith(200);
    expect(rpc).toHaveBeenCalledWith('admin_update_user_v2', {
      p_admin_id: ADMIN_ID,
      p_user_id: TARGET_ID,
      p_plan: 'pro',
      p_duration_days: 90,
      p_limit_mode: 'custom',
      p_limit: 20,
      p_request_id: REQUEST_ID,
    });
    expect(auditInsert).not.toHaveBeenCalled();
  });

  it('update-user: rejects a custom limit that is not a non-negative integer', async () => {
    const { client, rpc } = makeAdminClient({ callerRole: 'admin' });
    mockGetAdmin.mockReturnValue(client as never);
    const { res, status } = makeRes();

    await handler(
      makeReq('update-user', {
        p_user_id: TARGET_ID,
        p_request_id: REQUEST_ID,
        p_limit_mode: 'custom',
        p_limit: -1,
      }),
      res
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('set-user-role: no audit row when the RPC fails', async () => {
    const { client, auditInsert, rpc } = makeAdminClient({ callerRole: 'admin' });
    rpc.mockResolvedValue({ error: { message: 'boom', code: 'XX000' } });
    mockGetAdmin.mockReturnValue(client as never);
    const { res, status } = makeRes();

    await handler(makeReq('set-user-role', { p_user_id: TARGET_ID, p_role: 'admin' }), res);

    expect(status).toHaveBeenCalledWith(500);
    expect(auditInsert).not.toHaveBeenCalled();
  });

  it('set-user-role: admin cannot demote themselves', async () => {
    const { client, rpc } = makeAdminClient({ callerRole: 'admin' });
    mockGetAdmin.mockReturnValue(client as never);
    const { res, status } = makeRes();

    await handler(makeReq('set-user-role', { p_user_id: ADMIN_ID, p_role: 'user' }), res);

    expect(status).toHaveBeenCalledWith(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('update-global-limit: validates and calls the audited setting RPC', async () => {
    const { client, rpc } = makeAdminClient({ callerRole: 'admin' });
    mockGetAdmin.mockReturnValue(client as never);
    const { res, status } = makeRes();

    await handler(
      makeReq('update-global-limit', {
        p_key: 'default_monthly_analytics_limit',
        p_value: 12,
      }),
      res
    );

    expect(status).toHaveBeenCalledWith(200);
    expect(rpc).toHaveBeenCalledWith('admin_update_app_setting', {
      p_admin_id: ADMIN_ID,
      p_key: 'default_monthly_analytics_limit',
      p_value: 12,
    });
  });

  it('update-global-limit: rejects a negative/non-integer value before the RPC', async () => {
    const { client, rpc } = makeAdminClient({ callerRole: 'admin' });
    mockGetAdmin.mockReturnValue(client as never);
    const { res, status } = makeRes();

    await handler(
      makeReq('update-global-limit', {
        p_key: 'default_monthly_analytics_limit',
        p_value: -1,
      }),
      res
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('bulk-users: validates ids and calls the bulk RPC', async () => {
    const { client, rpc } = makeAdminClient({ callerRole: 'admin' });
    rpc.mockResolvedValue({ data: 2, error: null });
    mockGetAdmin.mockReturnValue(client as never);
    const { res, status } = makeRes();

    await handler(
      makeReq('bulk-users', {
        p_user_ids: [TARGET_ID, '33333333-3333-4333-8333-333333333333'],
        p_action: 'lock',
      }),
      res
    );

    expect(status).toHaveBeenCalledWith(200);
    expect(rpc).toHaveBeenCalledWith('admin_bulk_update_users', {
      p_admin_id: ADMIN_ID,
      p_user_ids: [TARGET_ID, '33333333-3333-4333-8333-333333333333'],
      p_action: 'lock',
    });
  });

  it('returns 429 when the shared admin rate limit rejects the call', async () => {
    vi.mocked(enforceRateLimit).mockResolvedValue(false);
    const { client, rpc } = makeAdminClient({ callerRole: 'admin' });
    mockGetAdmin.mockReturnValue(client as never);
    const { res, status } = makeRes();

    await handler(makeReq('set-user-role', { p_user_id: TARGET_ID, p_role: 'admin' }), res);

    expect(status).toHaveBeenCalledWith(429);
    expect(rpc).not.toHaveBeenCalled();
  });
});
