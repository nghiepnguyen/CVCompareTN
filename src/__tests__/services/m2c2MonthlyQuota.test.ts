// M2-C2: /api/analyze ↔ monthly quota ledger wiring, and the server quota
// module's fail-closed / bounded-retry behaviour. Ledger atomicity itself is
// verified against a real Postgres (supabase/tests/analytics_quota_reservations.test.sql,
// scripts/db-quota-concurrency.ts).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiError } from '@google/genai';

const generateContent = vi.fn();
vi.mock('../../../_server-lib/ai/geminiClient.js', async (orig) => ({
  ...(await orig<typeof import('../../../_server-lib/ai/geminiClient')>()),
  getGeminiClient: () => ({ models: { generateContent } }),
}));

const USER_ID = '11111111-1111-4111-8111-111111111111';
const db = {
  log: [] as Record<string, unknown>[],
  rpcCalls: [] as { name: string; args: Record<string, unknown> }[],
  rpc: (async () => ({ data: null, error: null })) as (name: string, args: Record<string, unknown>) => Promise<unknown>,
};
function thenable(run: () => Promise<unknown>) {
  const b: Record<string, unknown> = {};
  Object.assign(b, {
    select: () => b, eq: () => b, gte: () => b, or: () => b, abortSignal: () => b,
    maybeSingle: () => run(),
    then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => run().then(res, rej),
  });
  return b;
}
vi.mock('../../../_server-lib/payment/supabaseAdmin.js', () => ({
  getUserFromBearerToken: async () => ({ id: USER_ID }),
  getSupabaseAdmin: () => ({
    from: (table: string) =>
      table === 'analysis_log'
        ? {
            insert: (row: Record<string, unknown>) => thenable(async () => { db.log.push(row); return { error: null }; }),
            select: () => thenable(async () => ({ count: 0 })),
          }
        : thenable(async () => ({ data: { has_permission: true, role: 'user', plan: 'free', plan_expires_at: null }, error: null })),
    rpc: (name: string, args: Record<string, unknown>) => thenable(async () => {
      db.rpcCalls.push({ name, args });
      if (name === 'consume_api_rate_limit') return { data: [{ allowed: slotAllowed }], error: null };
      return db.rpc(name, args);
    }),
  }),
}));
let slotAllowed = true;

const resolveStorageRef = vi.fn();
vi.mock('../../../_server-lib/storage/tempFile.js', () => ({ resolveStorageRef: (...a: unknown[]) => resolveStorageRef(...a) }));

import { handleAnalyze } from '../../../_server-lib/analyze/handler';
import { commitMonthlyQuota, isDefinitiveSqlState, releaseMonthlyQuota, reserveMonthlyQuota } from '../../../_server-lib/quota/monthlyQuota';
import { createDeadline } from '../../../_server-lib/deadline';

const reply = (body: unknown) => ({ text: JSON.stringify(body), usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } });
const CV = 'Data analyst with SQL experience at Acme since 2020. '.repeat(3);
const KEY = '22222222-2222-4222-8222-222222222222';
const body = { jd: 'Need SQL analytics', cvData: CV, language: 'en', idempotencyKey: KEY };

// Ledger reply per RPC; tests override pieces.
let ledger: Record<string, (args: Record<string, unknown>) => unknown>;
const calls = (name: string) => db.rpcCalls.filter((c) => c.name === name);

beforeEach(() => {
  generateContent.mockReset();
  resolveStorageRef.mockReset();
  slotAllowed = true;
  db.log = [];
  db.rpcCalls = [];
  ledger = {
    reserve_analytics_quota: () => ({ status: 'reserved', reservation_id: 'res-1' }),
    commit_analytics_quota: () => ({ status: 'committed', charged: true }),
    release_analytics_quota: (a) => ({ status: a.p_outcome === 'uncertain' ? 'uncertain' : 'refunded' }),
  };
  db.rpc = async (name, args) => {
    const handler = ledger[name];
    if (!handler) return { data: null, error: null };
    const out = handler(args);
    return out instanceof Error ? { data: null, error: { message: out.message, code: (out as { code?: string }).code } } : { data: out, error: null };
  };
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  process.env.GEMINI_API_KEY = 'test';
});

describe('analyze ↔ quota reservation', () => {
  it('reserves with the client key, commits once on success, never releases', async () => {
    generateContent.mockResolvedValue(reply({ matchScore: 70 }));
    const res = await handleAnalyze('Bearer x', body);
    expect(res.status).toBe(200);
    expect(calls('reserve_analytics_quota')[0].args).toMatchObject({ p_user_id: USER_ID, p_request_key: KEY, p_ttl_seconds: 360 });
    expect(calls('commit_analytics_quota')).toHaveLength(1);
    expect(calls('release_analytics_quota')).toHaveLength(0);
    // Legacy check-then-increment RPCs are gone from the analyze path.
    expect(calls('check_analytics_quota')).toHaveLength(0);
    expect(calls('increment_usage_count')).toHaveLength(0);
  });

  it('generates a server key when the client sends none; rejects a malformed key without reserving', async () => {
    generateContent.mockResolvedValue(reply({ matchScore: 70 }));
    await handleAnalyze('Bearer x', { ...body, idempotencyKey: undefined });
    expect(calls('reserve_analytics_quota')[0].args.p_request_key).toMatch(/^[0-9a-f-]{36}$/);
    db.rpcCalls = [];
    const bad = await handleAnalyze('Bearer x', { ...body, idempotencyKey: 'not-a-uuid' });
    expect(bad.status).toBe(400);
    expect(calls('reserve_analytics_quota')).toHaveLength(0);
  });

  it('D3: unavailable quota state → 503 retryable, no slot, no Gemini', async () => {
    for (const fail of [() => new Error('db down'), () => ({ status: 'weird' }), () => ({ status: 'unavailable', reason: 'profile_not_found' })]) {
      db.rpcCalls = [];
      ledger.reserve_analytics_quota = fail;
      const res = await handleAnalyze('Bearer x', body);
      expect(res).toMatchObject({ status: 503, body: { code: 'quota_unavailable', retryable: true } });
      expect(calls('consume_api_rate_limit')).toHaveLength(0);
    }
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('denied → 429 with used/limit; duplicate key → 409; neither runs Gemini nor takes a slot', async () => {
    ledger.reserve_analytics_quota = () => ({ status: 'denied', used: 5, limit: 5 });
    expect(await handleAnalyze('Bearer x', body)).toMatchObject({ status: 429, body: { used: 5, limit: 5 } });
    ledger.reserve_analytics_quota = () => ({ status: 'duplicate', state: 'committed' });
    expect(await handleAnalyze('Bearer x', body)).toMatchObject({ status: 409, body: { code: 'duplicate_request', state: 'committed' } });
    expect(generateContent).not.toHaveBeenCalled();
    expect(calls('consume_api_rate_limit')).toHaveLength(0);
  });

  it('pre-Gemini failures release as pre_gemini (slot denied, storage error)', async () => {
    slotAllowed = false;
    expect((await handleAnalyze('Bearer x', body)).status).toBe(429);
    expect(calls('release_analytics_quota').map((c) => c.args.p_outcome)).toEqual(['pre_gemini']);

    slotAllowed = true;
    db.rpcCalls = [];
    resolveStorageRef.mockRejectedValue(new Error('missing object'));
    expect((await handleAnalyze('Bearer x', { ...body, cvData: undefined, cvDataStoragePath: `${USER_ID}/cv.pdf`, cvMimeType: 'application/pdf' })).status).toBe(400);
    expect(calls('release_analytics_quota').map((c) => c.args.p_outcome)).toEqual(['pre_gemini']);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('provider error responses (429 / 503 / 400) release as provider_error', async () => {
    for (const status of [429, 503, 400]) {
      db.rpcCalls = [];
      generateContent.mockRejectedValueOnce(new ApiError({ message: 'x', status }));
      await handleAnalyze('Bearer x', body);
      expect(calls('release_analytics_quota').map((c) => c.args.p_outcome)).toEqual(['provider_error']);
      expect(calls('commit_analytics_quota')).toHaveLength(0);
    }
  });

  it('outcome unknown after the request started (timeout, unparseable reply) releases as uncertain', async () => {
    generateContent.mockRejectedValueOnce(new Error('socket hang up DEADLINE_EXCEEDED'));
    expect((await handleAnalyze('Bearer x', body)).status).toBe(504);
    expect(calls('release_analytics_quota').map((c) => c.args.p_outcome)).toEqual(['uncertain']);

    db.rpcCalls = [];
    generateContent.mockResolvedValueOnce({ text: 'not json at all', usageMetadata: {} });
    expect((await handleAnalyze('Bearer x', body)).status).toBe(500);
    expect(calls('release_analytics_quota').map((c) => c.args.p_outcome)).toEqual(['uncertain']);
  });

  it('A4: commit rolled back on every attempt (SQLSTATE) withholds the result: confirmed failed', async () => {
    generateContent.mockResolvedValue(reply({ matchScore: 70 }));
    ledger.commit_analytics_quota = () => Object.assign(new Error('db error'), { code: 'P0001' });
    const res = await handleAnalyze('Bearer x', body);
    expect(res).toMatchObject({ status: 503, body: { code: 'quota_settlement_unavailable', retryable: true } });
    expect(res.body.matchScore).toBeUndefined();
    expect(calls('commit_analytics_quota')).toHaveLength(3);
    expect(calls('release_analytics_quota')).toHaveLength(0); // left for TTL → uncertain
    expect(db.log.at(-1)?.error_message).toBe('[quota_settlement_unavailable]');
  });

  it('M2-Q 2C: commit error without a SQLSTATE is an UNKNOWN outcome, never success (personal path)', async () => {
    generateContent.mockResolvedValue(reply({ matchScore: 70 }));
    ledger.commit_analytics_quota = () => new Error('db down');
    const res = await handleAnalyze('Bearer x', body);
    expect(res).toEqual({ status: 503, body: { error: 'Quota settlement outcome unknown', code: 'quota_settlement_unknown', retryable: false } });
    expect(calls('commit_analytics_quota')).toHaveLength(3);
    expect(calls('release_analytics_quota')).toHaveLength(0);
    expect(calls('commit_analytics_quota_and_save_candidate')).toHaveLength(0); // personal never uses the recruiter RPC
    expect(db.log.at(-1)?.error_message).toBe('[quota_settlement_unknown]');
  });

  // M2-Q 1A: only an explicit 'committed' answer may release the result.
  it.each([
    ['not_found', { status: 'not_found' }],
    ['still reserved', { status: 'reserved' }],
    ['malformed (no status)', { charged: true }],
  ])('M2-Q: commit answer %s never becomes a 200 with the result', async (_label, answer) => {
    generateContent.mockResolvedValue(reply({ matchScore: 70 }));
    ledger.commit_analytics_quota = () => answer;
    const res = await handleAnalyze('Bearer x', body);
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'Quota settlement unavailable', code: 'quota_settlement_unavailable', retryable: true });
    expect(calls('release_analytics_quota')).toHaveLength(0);
  });

  it('M2-Q 2C: an unreadable commit answer (array) is unknown, never a 200', async () => {
    generateContent.mockResolvedValue(reply({ matchScore: 70 }));
    ledger.commit_analytics_quota = () => [{ status: 'committed' }];
    const res = await handleAnalyze('Bearer x', body);
    expect(res).toMatchObject({ status: 503, body: { code: 'quota_settlement_unknown' } });
    expect(res.body.matchScore).toBeUndefined();
  });

  it('a commit conflict (reservation already refunded) is definitive: not retried, result withheld', async () => {
    generateContent.mockResolvedValue(reply({ matchScore: 70 }));
    ledger.commit_analytics_quota = () => ({ status: 'conflict', state: 'refunded' });
    expect((await handleAnalyze('Bearer x', body)).status).toBe(503);
    expect(calls('commit_analytics_quota')).toHaveLength(1);
  });
});

describe('server quota module', () => {
  it('reserve maps every ledger answer and fails closed on anything else', async () => {
    const d = createDeadline(10_000);
    ledger.reserve_analytics_quota = () => ({ status: 'reserved', reservation_id: 'r' });
    expect(await reserveMonthlyQuota(USER_ID, KEY, d)).toEqual({ status: 'reserved', reservationId: 'r' });
    ledger.reserve_analytics_quota = () => ({ status: 'denied', used: 3, limit: 3 });
    expect(await reserveMonthlyQuota(USER_ID, KEY, d)).toEqual({ status: 'denied', used: 3, limit: 3 });
    ledger.reserve_analytics_quota = () => ({ status: 'reserved' }); // missing id
    expect(await reserveMonthlyQuota(USER_ID, KEY, d)).toEqual({ status: 'unavailable' });
    ledger.reserve_analytics_quota = () => new Error('boom');
    expect(await reserveMonthlyQuota(USER_ID, KEY, d)).toEqual({ status: 'unavailable' });
    expect(await reserveMonthlyQuota(USER_ID, KEY, createDeadline(0))).toEqual({ status: 'unavailable' });
  });

  it('commit/release retry at most 3 times, and stop at the request deadline', async () => {
    ledger.commit_analytics_quota = () => new Error('flaky');
    expect(await commitMonthlyQuota(USER_ID, 'r', createDeadline(10_000))).toBe('unknown');
    expect(calls('commit_analytics_quota')).toHaveLength(3);

    db.rpcCalls = [];
    ledger.commit_analytics_quota = () => Object.assign(new Error('raise'), { code: '22023' });
    expect(await commitMonthlyQuota(USER_ID, 'r', createDeadline(10_000))).toBe('failed');
    expect(calls('commit_analytics_quota')).toHaveLength(3);

    db.rpcCalls = [];
    let n = 0;
    ledger.release_analytics_quota = () => (++n < 2 ? new Error('flaky') : { status: 'refunded' });
    expect(await releaseMonthlyQuota(USER_ID, 'r', 'pre_gemini', createDeadline(10_000))).toBe(true);
    expect(calls('release_analytics_quota')).toHaveLength(2);

    db.rpcCalls = [];
    ledger.commit_analytics_quota = () => new Error('flaky');
    expect(await commitMonthlyQuota(USER_ID, 'r', createDeadline(100))).toBe('unknown');
    expect(calls('commit_analytics_quota').length).toBeLessThanOrEqual(1);

    db.rpcCalls = [];
    expect(await commitMonthlyQuota(USER_ID, 'r', createDeadline(0))).toBe('failed'); // nothing was sent
    expect(calls('commit_analytics_quota')).toHaveLength(0);
  });

  it('M2-Q 2C: only a real Postgres SQLSTATE is definitive', () => {
    for (const c of ['P0001', '22023', '42501', '57014', '55P03', '40001', 'XX000']) expect(isDefinitiveSqlState(c)).toBe(true);
    for (const c of [undefined, '', 'PGRST003', 'PGRST116', '08006', '08003', '57P01', '502', 'p0001', 'P00011']) expect(isDefinitiveSqlState(c)).toBe(false);
  });
});
