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

const accountAccess = vi.hoisted(() => vi.fn());
vi.mock('../../_server-lib/accountLock.js', () => ({ checkAccountAccess: accountAccess }));

import handler from '../recruiter/save-analysis.js';
import * as supabaseAdmin from '../../_server-lib/payment/supabaseAdmin.js';

const mockGetUser = vi.mocked(supabaseAdmin.getUserFromBearerToken);
const mockGetAdmin = vi.mocked(supabaseAdmin.getSupabaseAdmin);

const req = {
  method: 'POST',
  headers: { authorization: 'Bearer tok' },
  body: { candidateId: 'c1', analysisResult: { a: 1 }, matchScore: 70, status: 'done' },
} as unknown as VercelRequest;

function run(rpcResult: unknown) {
  const rpc = vi.fn().mockResolvedValue(rpcResult);
  mockGetAdmin.mockReturnValue({ rpc } as never);
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  return handler(req, { status, setHeader: vi.fn(), end: vi.fn() } as unknown as VercelResponse).then(() => ({ rpc, status, json }));
}

describe('POST /api/recruiter/save-analysis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    accountAccess.mockResolvedValue('ok');
    mockGetUser.mockResolvedValue({ id: 'u1' } as never);
  });

  it.each([['locked', 403], ['unavailable', 503]] as const)('blocks %s accounts before saving', async (state, code) => {
    accountAccess.mockResolvedValue(state);
    const { rpc, status } = await run({ error: null });
    expect(status).toHaveBeenCalledWith(code);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('passes the caller id to the RPC', async () => {
    const { rpc, status } = await run({ error: null });
    expect(rpc).toHaveBeenCalledWith(
      'save_candidate_analysis',
      expect.objectContaining({ p_user_id: 'u1', p_candidate_id: 'c1' }),
    );
    expect(status).toHaveBeenCalledWith(200);
  });

  it('maps 42501 to 403 without leaking detail', async () => {
    const { status, json } = await run({ error: { code: '42501', message: 'secret' } });
    expect(status).toHaveBeenCalledWith(403);
    expect(JSON.stringify(json.mock.calls[0][0])).not.toContain('secret');
    expect(json.mock.calls[0][0]).not.toHaveProperty('detail');
  });

  it('maps P0002 to 404', async () => {
    const { status } = await run({ error: { code: 'P0002', message: 'x' } });
    expect(status).toHaveBeenCalledWith(404);
  });

  it('maps other errors to 500 without detail', async () => {
    const { status, json } = await run({ error: { code: 'XX', message: 'secret' } });
    expect(status).toHaveBeenCalledWith(500);
    expect(json.mock.calls[0][0]).not.toHaveProperty('detail');
  });
});
