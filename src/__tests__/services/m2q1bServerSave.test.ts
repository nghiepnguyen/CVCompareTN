// M2-Q Phase 1B: /api/analyze saves recruiter results itself, after the quota
// commit, through the M2-D3 fenced save. Mocked DB here; the same flows run
// against a real Postgres/PostgREST in m2q1bServerSave.db.test.ts.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const generateContent = vi.fn();
vi.mock('../../../_server-lib/ai/geminiClient.js', async (orig) => ({
  ...(await orig<typeof import('../../../_server-lib/ai/geminiClient')>()),
  getGeminiClient: () => ({ models: { generateContent } }),
}));

const USER_ID = '11111111-1111-4111-8111-111111111111';
const KEY = '22222222-2222-4222-8222-222222222222';
const CANDIDATE = '33333333-3333-4333-8333-333333333333';
const events: string[] = [];
let gate: () => unknown;
let rpcReply: Record<string, (args: Record<string, unknown>) => unknown>;
const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
const candidateFilters: [string, unknown][] = [];

function thenable(run: () => Promise<unknown>, onEq?: (k: string, v: unknown) => void) {
  const b: Record<string, unknown> = {};
  Object.assign(b, {
    select: () => b, gte: () => b, or: () => b, abortSignal: () => b,
    eq: (k: string, v: unknown) => { onEq?.(k, v); return b; },
    maybeSingle: () => run(),
    then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => run().then(res, rej),
  });
  return b;
}
vi.mock('../../../_server-lib/payment/supabaseAdmin.js', () => ({
  getUserFromBearerToken: async () => ({ id: USER_ID }),
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      if (table === 'analysis_log') {
        return { insert: () => thenable(async () => ({ error: null })), select: () => thenable(async () => ({ count: 0 })) };
      }
      if (table === 'candidate_cvs') {
        return thenable(async () => { events.push('gate'); const g = gate(); if (g instanceof Error) throw g; return g; },
          (k, v) => candidateFilters.push([k, v]));
      }
      return thenable(async () => ({ data: { has_permission: true, role: 'user', plan: 'recruiter', plan_expires_at: null }, error: null }));
    },
    rpc: (name: string, args: Record<string, unknown>) => thenable(async () => {
      rpcCalls.push({ name, args });
      events.push(name);
      if (name === 'consume_api_rate_limit') return { data: [{ allowed: true }], error: null };
      const out = rpcReply[name]?.(args);
      if (out instanceof Error) throw out;
      return out ?? { data: null, error: null };
    }),
  }),
}));
vi.mock('../../../_server-lib/storage/tempFile.js', () => ({ resolveStorageRef: vi.fn() }));

import { handleAnalyze } from '../../../_server-lib/analyze/handler';

const reply = (body: unknown) => ({ text: JSON.stringify(body), usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } });
const CV = 'Data analyst with SQL experience at Acme since 2020. '.repeat(3);
const personal = { jd: 'Need SQL analytics', cvData: CV, language: 'en', idempotencyKey: KEY };
const recruiter = { ...personal, candidateId: CANDIDATE };
const calls = (name: string) => rpcCalls.filter((c) => c.name === name);
const ok = (data: unknown) => () => ({ data, error: null });

beforeEach(() => {
  generateContent.mockReset();
  generateContent.mockResolvedValue(reply({ matchScore: 70 }));
  events.length = 0; rpcCalls.length = 0; candidateFilters.length = 0;
  gate = () => ({ data: { id: CANDIDATE }, error: null });
  rpcReply = {
    reserve_analytics_quota: ok({ status: 'reserved', reservation_id: 'res-1' }),
    commit_analytics_quota: ok({ status: 'committed', charged: true }),
    release_analytics_quota: ok({ status: 'refunded' }),
    save_candidate_analysis_attempt: ok({ result: 'saved', replay: false }),
    commit_analytics_quota_and_save_candidate: ok({ status: 'committed', charged: true, replay: false, save: 'saved', save_replay: false }),
  };
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  process.env.GEMINI_API_KEY = 'test';
});

describe('personal analysis is unchanged', () => {
  // M3-A: personal results now get a history save (m3aPersonalHistorySave.test.ts);
  // this mock has no history table, so that save reports 'failed'.
  it('no candidateId: no ownership query, no candidate save RPC', async () => {
    const res = await handleAnalyze('Bearer x', personal);
    expect(res.status).toBe(200);
    expect(res.body.matchScore).toBe(70);
    expect(events).not.toContain('gate');
    expect(calls('save_candidate_analysis_attempt')).toHaveLength(0);
    expect(calls('commit_analytics_quota_and_save_candidate')).toHaveLength(0);
    expect(calls('commit_analytics_quota')).toHaveLength(1);
  });
});

describe('request validation (before quota)', () => {
  it.each([
    ['candidateId without a client key', { ...personal, idempotencyKey: undefined, candidateId: CANDIDATE }],
    ['malformed candidateId', { ...personal, candidateId: 'c1' }],
    ['non-string candidateId', { ...personal, candidateId: 42 }],
  ])('%s → 400, no reservation, no Gemini', async (_l, body) => {
    expect((await handleAnalyze('Bearer x', body)).status).toBe(400);
    expect(calls('reserve_analytics_quota')).toHaveLength(0);
    expect(generateContent).not.toHaveBeenCalled();
  });
});

describe('ownership gate (before quota)', () => {
  it('checks owner campaign, this attempt and analyzing status', async () => {
    await handleAnalyze('Bearer x', recruiter);
    expect(candidateFilters).toEqual(expect.arrayContaining([
      ['id', CANDIDATE], ['recruitment_campaigns.user_id', USER_ID], ['analysis_attempt_id', KEY], ['status', 'analyzing'],
    ]));
    expect(events.indexOf('gate')).toBeLessThan(events.indexOf('reserve_analytics_quota'));
  });

  it('not owned by this attempt → 409 not_owner, no reservation, no slot, no Gemini', async () => {
    gate = () => ({ data: null, error: null });
    const res = await handleAnalyze('Bearer x', recruiter);
    expect(res).toMatchObject({ status: 409, body: { code: 'not_owner' } });
    expect(calls('reserve_analytics_quota')).toHaveLength(0);
    expect(calls('consume_api_rate_limit')).toHaveLength(0);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it.each([['query error', () => ({ data: null, error: { message: 'down' } })], ['throws', () => new Error('net')]])(
    'gate %s → 503 fail closed, no reservation', async (_l, g) => {
      gate = g;
      expect((await handleAnalyze('Bearer x', recruiter)).status).toBe(503);
      expect(calls('reserve_analytics_quota')).toHaveLength(0);
      expect(generateContent).not.toHaveBeenCalled();
    });
});

describe('atomic commit + save (M2-Q 2C)', () => {
  const ATOMIC = 'commit_analytics_quota_and_save_candidate';
  const pgError = (code: string, message = 'x') => () => ({ data: null, error: { message, code } });

  it('commits and saves in ONE call, fenced by the request key, and reports serverSave', async () => {
    const res = await handleAnalyze('Bearer x', recruiter);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ matchScore: 70, serverSave: 'saved' });
    const [atomic] = calls(ATOMIC);
    expect(atomic.args).toMatchObject({
      p_user_id: USER_ID, p_reservation_id: 'res-1', p_candidate_id: CANDIDATE, p_attempt_id: KEY, p_match_score: 70,
    });
    expect(atomic.args.p_analysis_result).not.toHaveProperty('serverSave');
    // Never the two-transaction path for a recruiter request.
    expect(calls('commit_analytics_quota')).toHaveLength(0);
    expect(calls('save_candidate_analysis_attempt')).toHaveLength(0);
    expect(calls('release_analytics_quota')).toHaveLength(0);
  });

  it('decimal score is rounded once on the server (M3-B R0): body, JSON result and column get the same integer', async () => {
    generateContent.mockResolvedValue(reply({ matchScore: 72.5 }));
    expect((await handleAnalyze('Bearer x', recruiter)).body).toMatchObject({ matchScore: 73, serverSave: 'saved' });
    expect(calls(ATOMIC)[0].args.p_match_score).toBe(73);
    expect((calls(ATOMIC)[0].args.p_analysis_result as { matchScore: number }).matchScore).toBe(73);
  });

  it.each([
    ['throws (transport)', () => new Error('socket hang up')],
    ['error without SQLSTATE (gateway / fetch)', () => ({ data: null, error: { message: 'Bad Gateway' } })],
    ['PostgREST code (no SQLSTATE)', pgError('PGRST003')],
    ['connection-class SQLSTATE', pgError('08006')],
    ['unreadable reply', () => ({ data: [{ status: 'committed' }], error: null })],
  ])('settlement %s → 503 quota_settlement_unknown, no result, no release', async (_l, answer) => {
    rpcReply[ATOMIC] = answer;
    const res = await handleAnalyze('Bearer x', recruiter);
    expect(res).toEqual({ status: 503, body: { error: 'Quota settlement outcome unknown', code: 'quota_settlement_unknown', retryable: false } });
    expect(calls(ATOMIC)).toHaveLength(3); // idempotent replays of the same reservation, never a new key
    expect(calls('release_analytics_quota')).toHaveLength(0);
  });

  it('a SQLSTATE on every attempt (rolled back) → 503 quota_settlement_unavailable (confirmed failed)', async () => {
    rpcReply[ATOMIC] = pgError('P0001', 'boom');
    expect((await handleAnalyze('Bearer x', recruiter)).body).toEqual({ error: 'Quota settlement unavailable', code: 'quota_settlement_unavailable', retryable: true });
  });

  it('one unknown attempt makes the whole outcome unknown even if later attempts roll back', async () => {
    let n = 0;
    rpcReply[ATOMIC] = () => (n++ === 0 ? new Error('timeout') : { data: null, error: { message: 'x', code: '55P03' } });
    expect((await handleAnalyze('Bearer x', recruiter)).body).toMatchObject({ code: 'quota_settlement_unknown' });
  });

  it('a lost first response is recovered by the replay → 200', async () => {
    let n = 0;
    rpcReply[ATOMIC] = () => (n++ === 0 ? new Error('fetch failed') : { data: { status: 'committed', charged: true, replay: true, save: 'saved', save_replay: true }, error: null });
    expect(await handleAnalyze('Bearer x', recruiter)).toMatchObject({ status: 200, body: { serverSave: 'saved' } });
  });

  it.each([
    ['not_found', { status: 'not_found', save: 'skipped' }],
    ['conflict', { status: 'conflict', state: 'refunded', save: 'skipped' }],
  ])('commit status %s is definitive: one call, 503 unavailable', async (_l, answer) => {
    rpcReply[ATOMIC] = ok(answer);
    expect((await handleAnalyze('Bearer x', recruiter)).body).toMatchObject({ code: 'quota_settlement_unavailable' });
    expect(calls(ATOMIC)).toHaveLength(1);
  });

  it('Gemini failure: no settlement call', async () => {
    generateContent.mockRejectedValue(new Error('boom'));
    expect((await handleAnalyze('Bearer x', recruiter)).status).not.toBe(200);
    expect(calls(ATOMIC)).toHaveLength(0);
  });

  it.each([
    ['superseded', 'superseded'],
    ['not_owner', 'not_owner'],
    ['failed', 'failed'],
    ['weird', 'failed'],
    [undefined, 'failed'],
  ])('committed with save=%s → 200 with the result and serverSave=%s; no release', async (save, expected) => {
    rpcReply[ATOMIC] = ok({ status: 'committed', charged: true, save });
    const res = await handleAnalyze('Bearer x', recruiter);
    expect(res).toMatchObject({ status: 200, body: { matchScore: 70, serverSave: expected } });
    expect(calls(ATOMIC)).toHaveLength(1);
    expect(calls('release_analytics_quota')).toHaveLength(0);
  });
});

describe('client request body', () => {
  it('personal analyze sends no candidateId; recruiter sends it with the attempt key', async () => {
    const { analyzeCV } = await import('../../services/ai/analysisService');
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ matchScore: 70 }), { status: 200 });
    }));
    await analyzeCV('jd', 'cv', 'text/plain');
    await analyzeCV('jd', 'cv', 'text/plain', 'cv', 'vi', 'tok', undefined, undefined, undefined, undefined, KEY, CANDIDATE);
    vi.unstubAllGlobals();
    expect(bodies[0]).not.toHaveProperty('candidateId');
    expect(bodies[1]).toMatchObject({ idempotencyKey: KEY, candidateId: CANDIDATE });
  });
});
