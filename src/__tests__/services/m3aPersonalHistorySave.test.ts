// M3-A Phase 1: /api/analyze writes a personal result to the user's history
// row only after the quota commit is confirmed (A4), under
// analysis_id = request key. Mocked DB here; grants, the account-lock trigger
// and cross-user isolation run against real Postgres in m3aPersonalHistorySave.db.test.ts.
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
let rpcReply: Record<string, (args: Record<string, unknown>) => unknown>;
let historyReply: () => unknown;
const upserts: { row: Record<string, unknown>; opts: unknown }[] = [];

function thenable(run: () => Promise<unknown>) {
  const b: Record<string, unknown> = {};
  Object.assign(b, {
    select: () => b, gte: () => b, or: () => b, eq: () => b, abortSignal: () => b,
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
      if (table === 'history') {
        return {
          upsert: (row: Record<string, unknown>, opts: unknown) => thenable(async () => {
            events.push('history_upsert');
            upserts.push({ row, opts });
            const out = historyReply();
            if (out instanceof Error) throw out;
            return out;
          }),
        };
      }
      if (table === 'candidate_cvs') return thenable(async () => ({ data: { id: CANDIDATE }, error: null }));
      return thenable(async () => ({ data: { has_permission: true, role: 'user', plan: 'pro', plan_expires_at: null }, error: null }));
    },
    rpc: (name: string, args: Record<string, unknown>) => thenable(async () => {
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
import { saveHistoryRow } from '../../../_server-lib/analyze/historySave';
import { createDeadline } from '../../../_server-lib/deadline';
import { toHistoryRow } from '../../lib/historyRow';
import type { AnalysisResult } from '../../services/ai/types';

const reply = (body: unknown) => ({ text: JSON.stringify(body), usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } });
const CV = 'Data analyst with SQL experience at Acme since 2020. '.repeat(3);
const personal = { jd: 'Need SQL analytics', cvData: CV, language: 'en', idempotencyKey: KEY };
const ok = (data: unknown) => () => ({ data, error: null });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

beforeEach(() => {
  generateContent.mockReset();
  generateContent.mockResolvedValue(reply({ matchScore: 70 }));
  events.length = 0; upserts.length = 0;
  historyReply = () => ({ error: null });
  rpcReply = {
    reserve_analytics_quota: ok({ status: 'reserved', reservation_id: 'res-1' }),
    commit_analytics_quota: ok({ status: 'committed', charged: true }),
    release_analytics_quota: ok({ status: 'refunded' }),
    commit_analytics_quota_and_save_candidate: ok({ status: 'committed', charged: true, replay: false, save: 'saved', save_replay: false }),
  };
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  process.env.GEMINI_API_KEY = 'test';
});

describe('confirmed commit → server history save', () => {
  it('saves once, after the commit, under the request key and the token user', async () => {
    const res = await handleAnalyze('Bearer x', personal);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: KEY, serverSave: 'saved', matchScore: 70 });
    expect(upserts).toHaveLength(1);
    expect(events.indexOf('commit_analytics_quota')).toBeLessThan(events.indexOf('history_upsert'));
    const { row, opts } = upserts[0];
    expect(row).toMatchObject({ user_id: USER_ID, analysis_id: KEY, match_score: 70 });
    expect(row).not.toHaveProperty('id'); // PK never in the payload
    expect(opts).toEqual({ onConflict: 'user_id,analysis_id' });
  });

  it('a body userId cannot redirect the row: user_id is the token user', async () => {
    await handleAnalyze('Bearer x', { ...personal, userId: '99999999-9999-4999-8999-999999999999', user_id: 'x' });
    expect(upserts[0].row.user_id).toBe(USER_ID);
  });

  it('old client without a key: server key is both the result id and analysis_id', async () => {
    const res = await handleAnalyze('Bearer x', { ...personal, idempotencyKey: undefined });
    expect(res.status).toBe(200);
    expect(res.body.id).toMatch(UUID);
    expect(upserts[0].row.analysis_id).toBe(res.body.id);
  });

  it('upsert error → result still delivered, serverSave failed (browser save is the fallback)', async () => {
    historyReply = () => ({ error: { message: 'boom', code: '42501' } });
    const res = await handleAnalyze('Bearer x', personal);
    expect(res).toMatchObject({ status: 200, body: { id: KEY, serverSave: 'failed', matchScore: 70 } });
  });

  it('upsert throws (network) → result still delivered, serverSave failed', async () => {
    historyReply = () => new TypeError('fetch failed');
    const res = await handleAnalyze('Bearer x', personal);
    expect(res).toMatchObject({ status: 200, body: { serverSave: 'failed', matchScore: 70 } });
  });
});

describe('A4: no persistence without a confirmed commit', () => {
  it('definitive commit failure → 503 unavailable, no history write', async () => {
    rpcReply.commit_analytics_quota = () => ({ data: null, error: { message: 'denied', code: '42501' } });
    const res = await handleAnalyze('Bearer x', personal);
    expect(res).toMatchObject({ status: 503, body: { code: 'quota_settlement_unavailable' } });
    expect(upserts).toHaveLength(0);
  });

  it('commit outcome unknown → 503 unknown, no history write', async () => {
    rpcReply.commit_analytics_quota = () => ({ data: null, error: { message: 'gateway', code: '' } });
    const res = await handleAnalyze('Bearer x', personal);
    expect(res).toMatchObject({ status: 503, body: { code: 'quota_settlement_unknown', retryable: false } });
    expect(upserts).toHaveLength(0);
  });

  it('commit status not committed (e.g. not_found) → no history write', async () => {
    rpcReply.commit_analytics_quota = ok({ status: 'not_found' });
    expect((await handleAnalyze('Bearer x', personal)).status).toBe(503);
    expect(upserts).toHaveLength(0);
  });

  it('Gemini fails → release, no commit, no history write', async () => {
    generateContent.mockRejectedValue(new Error('boom'));
    const res = await handleAnalyze('Bearer x', personal);
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(events).not.toContain('commit_analytics_quota');
    expect(upserts).toHaveLength(0);
  });

  it('duplicate key → 409 before Gemini, no history write', async () => {
    rpcReply.reserve_analytics_quota = ok({ status: 'duplicate', state: 'committed' });
    const res = await handleAnalyze('Bearer x', personal);
    expect(res).toMatchObject({ status: 409, body: { code: 'duplicate_request' } });
    expect(generateContent).not.toHaveBeenCalled();
    expect(upserts).toHaveLength(0);
  });

  it('quota denied → 429, no history write', async () => {
    rpcReply.reserve_analytics_quota = ok({ status: 'denied', used: 5, limit: 5 });
    expect((await handleAnalyze('Bearer x', personal)).status).toBe(429);
    expect(upserts).toHaveLength(0);
  });
});

describe('recruiter path unchanged', () => {
  it('candidate request: atomic commit+save, no history write, result id not the key', async () => {
    const res = await handleAnalyze('Bearer x', { ...personal, candidateId: CANDIDATE });
    expect(res).toMatchObject({ status: 200, body: { serverSave: 'saved' } });
    expect(res.body.id).not.toBe(KEY);
    expect(events).not.toContain('commit_analytics_quota');
    expect(upserts).toHaveLength(0);
  });
});

describe('saveHistoryRow bounds', () => {
  it('no budget left → failed without touching the DB', async () => {
    const out = await saveHistoryRow(USER_ID, { id: KEY, timestamp: 0 } as AnalysisResult, createDeadline(0));
    expect(out).toBe('failed');
    expect(upserts).toHaveLength(0);
  });
});

describe('toHistoryRow (one column list for browser and server)', () => {
  it('takes user_id from the argument, never the result, and has no id column', () => {
    const r = { id: KEY, userId: 'someone-else', timestamp: 0, matchScore: 1, presentationLanguage: 'vi', language: 'en' } as AnalysisResult;
    const row = toHistoryRow(USER_ID, r);
    expect(row.user_id).toBe(USER_ID);
    expect(row.analysis_id).toBe(KEY);
    expect(row).not.toHaveProperty('id');
    expect(row.language).toBe('vi');
  });
});
