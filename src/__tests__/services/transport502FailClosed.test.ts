import { describe, it, expect, vi, beforeEach } from 'vitest';

// Gateway-502 fault injection (the Kong ↔ PostgREST keep-alive race fixed in
// scripts/ci/db-stack.sh). The app must FAIL CLOSED on a transport 502 and must
// not blindly replay requests: pre-Gemini checks are tried once; the only replay
// is the existing bounded settlement retry, with the identical reservation id
// (an idempotent ledger replay, never a second charge). Real handler; only
// Gemini and the Supabase client are mocked.
const generateContent = vi.fn();
vi.mock('../../../_server-lib/ai/geminiClient.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../_server-lib/ai/geminiClient')>()),
  getGeminiClient: () => ({ models: { generateContent } }),
}));

// What a gateway 502 looks like to supabase-js: no SQLSTATE, a gateway message.
const GATEWAY_502 = { data: null, error: { message: 'An invalid response was received from the upstream server', code: '' }, status: 502 };
const RESERVATION = '22222222-2222-4222-8222-222222222222';
const ok: Record<string, unknown> = {
  check_analytics_quota: { allowed: true },
  reserve_analytics_quota: { status: 'reserved', reservation_id: RESERVATION },
  consume_api_rate_limit: [{ allowed: true }],
  release_analytics_quota: { status: 'refunded' },
  commit_analytics_quota: { status: 'committed' },
};
let fail502 = new Set<string>();
const rpcCalls: { name: string; args: unknown }[] = [];
const rpc = (name: string, args: unknown) => {
  rpcCalls.push({ name, args });
  const result = fail502.has(name) ? GATEWAY_502 : { data: ok[name] ?? null, error: null };
  return { abortSignal: async () => result };
};
// Table reads: profile (plan), candidate gate, hourly cap; inserts swallowed.
const table = (name: string) => {
  const failing = fail502.has(`table:${name}`);
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'gte', 'or', 'abortSignal']) chain[m] = () => chain;
  chain.maybeSingle = async () => (failing ? GATEWAY_502 : name === 'profiles'
    ? { data: { plan: 'recruiter', role: 'user', has_permission: true }, error: null }
    : { data: { id: 'c1' }, error: null });
  chain.then = (res: (v: unknown) => void) => res(failing ? GATEWAY_502 : { count: 0, error: null });
  chain.insert = () => ({ abortSignal: async () => ({ error: null }) });
  chain.upsert = () => ({ abortSignal: async () => ({ error: null }), select: () => ({ abortSignal: async () => ({ data: [{}], error: null }) }) });
  return chain;
};
vi.mock('../../../_server-lib/payment/supabaseAdmin.js', () => ({
  getUserFromBearerToken: async () => ({ id: '11111111-1111-4111-8111-111111111111' }),
  getSupabaseAdmin: () => ({ from: table, rpc }),
}));

import { handleAnalyze } from '../../../_server-lib/analyze/handler';

const KEY = '33333333-3333-4333-8333-333333333333';
const CV = 'Data analyst with SQL experience at Acme since 2020. Built Tableau dashboards. '.repeat(2);
const analyze = (extra: Record<string, unknown> = {}) =>
  handleAnalyze('Bearer t', { jd: 'Data Analyst. Requirements: SQL.', cvData: CV, cvMimeType: 'text/plain', language: 'en', idempotencyKey: KEY, ...extra });
const calls = (name: string) => rpcCalls.filter((c) => c.name === name);

beforeEach(() => {
  vi.restoreAllMocks();
  fail502 = new Set();
  rpcCalls.length = 0;
  generateContent.mockReset().mockResolvedValue({
    text: JSON.stringify({ matchScore: 70, detailedComparison: { skills: [], experience: [], tools: [], education: [], keywords: [] } }),
    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
  });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

describe('gateway 502 → fail closed, no blind replay', () => {
  it('quota reservation 502: 503 quota_unavailable, tried once, no slot, no Gemini', async () => {
    fail502.add('reserve_analytics_quota');
    const res = await analyze();
    expect(res).toMatchObject({ status: 503, body: { code: 'quota_unavailable' } });
    expect(calls('reserve_analytics_quota')).toHaveLength(1);
    expect(calls('consume_api_rate_limit')).toHaveLength(0);
    expect(calls('release_analytics_quota')).toHaveLength(0); // nothing was reserved
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('AI slot 502: 503 rate-limit unavailable, tried once, reservation released, no Gemini', async () => {
    fail502.add('consume_api_rate_limit');
    const res = await analyze();
    expect(res).toMatchObject({ status: 503, body: { error: 'Rate limit verification unavailable' } });
    expect(calls('consume_api_rate_limit')).toHaveLength(1);
    expect(calls('release_analytics_quota')).toHaveLength(1);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('candidate gate 502: 503 before any quota or Gemini work', async () => {
    fail502.add('table:candidate_cvs');
    const res = await analyze({ candidateId: '44444444-4444-4444-8444-444444444444' });
    expect(res).toMatchObject({ status: 503, body: { error: 'Candidate verification unavailable' } });
    expect(calls('reserve_analytics_quota')).toHaveLength(0);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('settlement 502 on every attempt: bounded identical replays, then 503 unknown; Gemini ran once', async () => {
    fail502.add('commit_analytics_quota');
    const res = await analyze();
    expect(res).toMatchObject({ status: 503, body: { code: 'quota_settlement_unknown', retryable: false } });
    expect(res.body).not.toHaveProperty('matchScore');
    const commits = calls('commit_analytics_quota');
    expect(commits).toHaveLength(3); // SETTLE_ATTEMPTS
    for (const c of commits) expect(c.args).toEqual(commits[0].args);
    expect(commits[0].args).toMatchObject({ p_reservation_id: RESERVATION });
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(calls('reserve_analytics_quota')).toHaveLength(1);
    // A charge that may have landed is never refunded (no duplicate charge or refund).
    expect(calls('release_analytics_quota')).toHaveLength(0);
  });

  it('control: no 502 → 200 with one reservation, one slot, one commit', async () => {
    const res = await analyze();
    expect(res.status).toBe(200);
    expect([calls('reserve_analytics_quota').length, calls('consume_api_rate_limit').length, calls('commit_analytics_quota').length]).toEqual([1, 1, 1]);
  });
});
