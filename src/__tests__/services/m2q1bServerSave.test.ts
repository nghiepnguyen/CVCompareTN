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
import { saveCandidateResult } from '../../../_server-lib/recruiter/serverSave';

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
  };
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  process.env.GEMINI_API_KEY = 'test';
});

describe('personal analysis is unchanged', () => {
  it('no candidateId: no ownership query, no save RPC, body is exactly the result', async () => {
    const res = await handleAnalyze('Bearer x', personal);
    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('serverSave');
    expect(res.body.matchScore).toBe(70);
    expect(events).not.toContain('gate');
    expect(calls('save_candidate_analysis_attempt')).toHaveLength(0);
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

describe('save after settlement', () => {
  it('saves after the commit, fenced by the request key, and reports serverSave', async () => {
    const res = await handleAnalyze('Bearer x', recruiter);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ matchScore: 70, serverSave: 'saved' });
    expect(events.indexOf('commit_analytics_quota')).toBeLessThan(events.indexOf('save_candidate_analysis_attempt'));
    const [save] = calls('save_candidate_analysis_attempt');
    expect(save.args).toMatchObject({ p_user_id: USER_ID, p_candidate_id: CANDIDATE, p_attempt_id: KEY, p_match_score: 70 });
    expect(save.args.p_analysis_result).not.toHaveProperty('serverSave');
    expect(calls('release_analytics_quota')).toHaveLength(0);
  });

  it('commit failure: today\'s 503 body, no save, no result', async () => {
    rpcReply.commit_analytics_quota = () => ({ data: null, error: { message: 'db down' } });
    const res = await handleAnalyze('Bearer x', recruiter);
    expect(res.body).toEqual({ error: 'Quota settlement unavailable', code: 'quota_settlement_unavailable', retryable: true });
    expect(calls('save_candidate_analysis_attempt')).toHaveLength(0);
  });

  it('Gemini failure: no save', async () => {
    generateContent.mockRejectedValue(new Error('boom'));
    expect((await handleAnalyze('Bearer x', recruiter)).status).not.toBe(200);
    expect(calls('save_candidate_analysis_attempt')).toHaveLength(0);
  });

  it.each([
    ['superseded', ok({ result: 'superseded' }), 'superseded'],
    ['not_owner', ok({ result: 'not_owner' }), 'not_owner'],
    ['RPC error', () => ({ data: null, error: { message: 'invalid_match_score' } }), 'failed'],
    ['RPC throws', () => new Error('socket hang up'), 'failed'],
    ['unknown answer', ok({ result: 'weird' }), 'failed'],
  ])('save %s → 200 with the result and serverSave=%s; quota untouched', async (_l, answer, expected) => {
    rpcReply.save_candidate_analysis_attempt = answer;
    const res = await handleAnalyze('Bearer x', recruiter);
    expect(res).toMatchObject({ status: 200, body: { matchScore: 70, serverSave: expected } });
    expect(calls('release_analytics_quota')).toHaveLength(0);
    expect(calls('commit_analytics_quota')).toHaveLength(1);
  });

  it('skips the save when too little request budget is left', async () => {
    const deadline = { remainingMs: () => 600, signal: () => new AbortController().signal } as never;
    expect(await saveCandidateResult(USER_ID, CANDIDATE, KEY, { matchScore: 1 }, deadline)).toBe('failed');
    expect(calls('save_candidate_analysis_attempt')).toHaveLength(0);
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
