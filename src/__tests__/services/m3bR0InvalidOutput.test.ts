// M3-B R0: invalid AI output through the real handleAnalyze (Gemini and
// Supabase mocked). Real-DB versions: src/__tests__/db/m3bR0ScoreIntegrity.db.test.ts.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const generateContent = vi.fn();
const captured = vi.hoisted(() => ({ sentry: [] as unknown[] }));
vi.mock('../../../_server-lib/ai/geminiClient.js', async (orig) => ({
  ...(await orig<typeof import('../../../_server-lib/ai/geminiClient')>()),
  getGeminiClient: () => ({ models: { generateContent } }),
}));
vi.mock('../../../_server-lib/sentry.js', () => ({ Sentry: { captureMessage: (...a: unknown[]) => captured.sentry.push(a), captureException: () => {} } }));

const USER_ID = '11111111-1111-4111-8111-111111111111';
const KEY = '22222222-2222-4222-8222-222222222222';
const CANDIDATE = '33333333-3333-4333-8333-333333333333';
let rpcReply: Record<string, (args: Record<string, unknown>) => unknown>;
const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
const logRows: Record<string, unknown>[] = [];
const historyUpserts: unknown[] = [];
const candidateUpdates: { payload: unknown; filters: [string, unknown][] }[] = [];
let candidateUpdateReply: () => unknown;

function chain(run: () => Promise<unknown>, onEq?: (k: string, v: unknown) => void) {
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
      if (table === 'analysis_log') return { insert: (row: Record<string, unknown>) => { logRows.push(row); return chain(async () => ({ error: null })); }, select: () => chain(async () => ({ count: 0 })) };
      if (table === 'history') return { upsert: (row: unknown) => { historyUpserts.push(row); return chain(async () => ({ error: null })); } };
      if (table === 'candidate_cvs') {
        return {
          select: () => chain(async () => ({ data: { id: CANDIDATE }, error: null })),
          update: (payload: unknown) => {
            const u = { payload, filters: [] as [string, unknown][] };
            candidateUpdates.push(u);
            return chain(async () => candidateUpdateReply(), (k, v) => u.filters.push([k, v]));
          },
        };
      }
      return chain(async () => ({ data: { has_permission: true, role: 'user', plan: 'recruiter', plan_expires_at: null }, error: null }));
    },
    rpc: (name: string, args: Record<string, unknown>) => chain(async () => {
      rpcCalls.push({ name, args });
      if (name === 'consume_api_rate_limit') return { data: [{ allowed: true }], error: null };
      const out = rpcReply[name]?.(args);
      if (out instanceof Error) throw out;
      return out ?? { data: null, error: null };
    }),
  }),
}));
vi.mock('../../../_server-lib/storage/tempFile.js', () => ({ resolveStorageRef: vi.fn() }));

import { handleAnalyze, INVALID_AI_OUTPUT_MESSAGES } from '../../../_server-lib/analyze/handler';
import { SCORE_VERSION } from '../../../_server-lib/ai/localizeAnalysis';
import { GenerateContentResponse, type BlockedReason, type FinishReason } from '@google/genai';

const USAGE = { promptTokenCount: 3829, candidatesTokenCount: 1500, thoughtsTokenCount: 275 };
const rawReply = (matchScoreJson: string) => ({
  text: `{"jobTitle":"Data Analyst","matchScore":${matchScoreJson},"detailedComparison":{"skills":[{"requirement":"SQL","status":"matched","cvEvidence":"SQL at Acme","priority":"required"}],"experience":[],"tools":[],"education":[],"keywords":[]}}`,
  usageMetadata: USAGE,
});
const CV = 'Data analyst with SQL experience at Acme since 2020. '.repeat(3);
const personal = { jd: 'Need SQL analytics', cvData: CV, language: 'en', idempotencyKey: KEY };
const recruiter = { ...personal, candidateId: CANDIDATE };
const calls = (name: string) => rpcCalls.filter((c) => c.name === name);
const ok = (data: unknown) => () => ({ data, error: null });

beforeEach(() => {
  generateContent.mockReset();
  rpcCalls.length = 0; logRows.length = 0; historyUpserts.length = 0; candidateUpdates.length = 0; captured.sentry.length = 0;
  candidateUpdateReply = () => ({ data: [{ id: CANDIDATE }], error: null });
  rpcReply = {
    reserve_analytics_quota: ok({ status: 'reserved', reservation_id: 'res-1' }),
    commit_analytics_quota: ok({ status: 'committed', charged: true }),
    release_analytics_quota: ok({ status: 'refunded', replay: false }),
    commit_analytics_quota_and_save_candidate: ok({ status: 'committed', charged: true, replay: false, save: 'saved', save_replay: false }),
  };
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  process.env.GEMINI_API_KEY = 'test';
});

const INVALID: [string, string][] = [
  ['null', 'null'], ['missing', '__MISSING__'], ['"abc"', '"abc"'], ['"70" (numeric string)', '"70"'],
  ['-5', '-5'], ['150', '150'], ['100.4', '100.4'], ['1e309 (Infinity)', '1e309'],
];
const replyFor = (j: string) => (j === '__MISSING__' ? { ...rawReply('0'), text: rawReply('0').text.replace('"matchScore":0,', '') } : rawReply(j));

describe('invalid matchScore → 502 invalid_ai_output, no commit, no save', () => {
  it.each(INVALID)('personal %s', async (_l, j) => {
    generateContent.mockResolvedValue(replyFor(j));
    const res = await handleAnalyze('Bearer x', personal);
    expect(res).toEqual({ status: 502, body: { error: INVALID_AI_OUTPUT_MESSAGES.released.en, code: 'invalid_ai_output', quotaReleased: true, retryable: false } });
    expect(calls('commit_analytics_quota')).toHaveLength(0);
    expect(calls('release_analytics_quota').map((c) => c.args.p_outcome)).toEqual(['provider_error']);
    expect(historyUpserts).toHaveLength(0);
    // Hourly abuse slot consumed (before Gemini), never refunded.
    expect(calls('consume_api_rate_limit')).toHaveLength(1);
    // Provider spend: real token usage logged (thinking counted once in output).
    const log = logRows.at(-1)!;
    expect(log).toMatchObject({ status: 'error', kind: 'analyze', input_tokens: 3829, output_tokens: 1775, model: 'gemini-3-flash-preview' });
    expect(String(log.error_message)).toMatch(/^\[invalid_ai_output:(missing|not_a_number|non_finite|out_of_range):release_refunded\]$/);
    expect(JSON.stringify(res.body)).not.toMatch(/SQL|Acme|matchScore/);
  });

  it('malformed JSON reply is invalid AI output too (was: uncertain → forgiven twice, then charged)', async () => {
    generateContent.mockResolvedValue({ text: 'Sorry, I cannot help.', usageMetadata: USAGE });
    const res = await handleAnalyze('Bearer x', personal);
    expect(res.status).toBe(502);
    expect(calls('release_analytics_quota').map((c) => c.args.p_outcome)).toEqual(['provider_error']);
    expect(String(logRows.at(-1)!.error_message)).toBe('[invalid_ai_output:malformed_json:release_refunded]');
  });

  it('VI request gets the Vietnamese copy', async () => {
    generateContent.mockResolvedValue(rawReply('null'));
    const res = await handleAnalyze('Bearer x', { ...personal, language: 'vi' });
    expect(res.body.error).toBe(INVALID_AI_OUTPUT_MESSAGES.released.vi);
    // Localization never runs for an invalid result: exactly one (scoring) Gemini call, so logged tokens are complete.
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(logRows.at(-1)).toMatchObject({ input_tokens: 3829, output_tokens: 1775 });
  });

  it('no automatic retry: exactly one Gemini call', async () => {
    generateContent.mockResolvedValue(rawReply('-1'));
    await handleAnalyze('Bearer x', personal);
    expect(generateContent).toHaveBeenCalledTimes(1);
  });
});

describe('release outcome decides what the user is told', () => {
  it('release answered with another state (already uncertain) → quotaReleased false, unconfirmed copy', async () => {
    rpcReply.release_analytics_quota = ok({ status: 'uncertain', replay: true });
    generateContent.mockResolvedValue(rawReply('null'));
    const res = await handleAnalyze('Bearer x', personal);
    expect(res.body).toMatchObject({ code: 'invalid_ai_output', quotaReleased: false, error: INVALID_AI_OUTPUT_MESSAGES.unconfirmed.en });
    expect(String(logRows.at(-1)!.error_message)).toContain('release_not_refunded');
  });

  it('release replay of an already refunded row counts as confirmed (idempotent)', async () => {
    rpcReply.release_analytics_quota = ok({ status: 'refunded', replay: true });
    generateContent.mockResolvedValue(rawReply('null'));
    expect((await handleAnalyze('Bearer x', personal)).body.quotaReleased).toBe(true);
  });

  it('release transport failure on every attempt → unknown: unconfirmed copy, reservation left to the TTL → uncertain contract', async () => {
    rpcReply.release_analytics_quota = () => new Error('socket hang up');
    generateContent.mockResolvedValue(rawReply('null'));
    const res = await handleAnalyze('Bearer x', personal);
    expect(res.body).toMatchObject({ quotaReleased: false, error: INVALID_AI_OUTPUT_MESSAGES.unconfirmed.en });
    expect(calls('release_analytics_quota').length).toBeGreaterThanOrEqual(1);
    expect(calls('commit_analytics_quota')).toHaveLength(0);
    expect(String(logRows.at(-1)!.error_message)).toContain('release_unknown');
  });
});

describe('recruiter: fenced failure transition', () => {
  it('invalid output → no atomic commit/save; candidate → error under id + attempt + analyzing fence', async () => {
    generateContent.mockResolvedValue(rawReply('150'));
    const res = await handleAnalyze('Bearer x', recruiter);
    expect(res).toMatchObject({ status: 502, body: { code: 'invalid_ai_output', quotaReleased: true } });
    expect(calls('commit_analytics_quota_and_save_candidate')).toHaveLength(0);
    expect(candidateUpdates).toHaveLength(1);
    expect(candidateUpdates[0].payload).toEqual({ status: 'error', error_message: INVALID_AI_OUTPUT_MESSAGES.released.en });
    expect(candidateUpdates[0].filters).toEqual([['id', CANDIDATE], ['analysis_attempt_id', KEY], ['status', 'analyzing']]);
  });

  it('fence rejects (superseded attempt / already done) → nothing overwritten, still 502', async () => {
    candidateUpdateReply = () => ({ data: [], error: null });
    generateContent.mockResolvedValue(rawReply('null'));
    expect((await handleAnalyze('Bearer x', recruiter)).status).toBe(502);
  });

  it('failure transition error does not hide the 502 and is never retried into a save', async () => {
    candidateUpdateReply = () => ({ data: null, error: { message: 'db down' } });
    generateContent.mockResolvedValue(rawReply('null'));
    expect((await handleAnalyze('Bearer x', recruiter)).status).toBe(502);
    expect(calls('commit_analytics_quota_and_save_candidate')).toHaveLength(0);
  });

  it('release unknown: candidate still leaves analyzing (no result can land later), unconfirmed copy', async () => {
    rpcReply.release_analytics_quota = () => new Error('timeout');
    generateContent.mockResolvedValue(rawReply('null'));
    const res = await handleAnalyze('Bearer x', recruiter);
    expect(res.body.quotaReleased).toBe(false);
    expect(candidateUpdates[0].payload).toEqual({ status: 'error', error_message: INVALID_AI_OUTPUT_MESSAGES.unconfirmed.en });
  });
});

describe('valid scores: one integer everywhere (canonical-en-v2)', () => {
  it.each([[0, 0, 'Low'], [59, 59, 'Low'], [59.5, 60, 'Medium'], [60, 60, 'Medium'], [79, 79, 'Medium'], [79.5, 80, 'High'], [80, 80, 'High'], [100, 100, 'High']])(
    'personal %j → %j %s in body and history row', async (raw, score, band) => {
      generateContent.mockResolvedValue(rawReply(String(raw)));
      const res = await handleAnalyze('Bearer x', personal);
      expect(res.body).toMatchObject({ matchScore: score, passProbability: band, successProbability: band, scoreVersion: SCORE_VERSION, serverSave: 'saved' });
      expect(historyUpserts[0]).toMatchObject({ match_score: score, pass_probability: band, score_version: 'canonical-en-v2' });
      expect(calls('commit_analytics_quota')).toHaveLength(1);
      expect(calls('release_analytics_quota')).toHaveLength(0);
    });

  it('recruiter 59.5 → column, JSON result and band all 60/Medium (was: column 60, JSON 59.5 Low)', async () => {
    generateContent.mockResolvedValue(rawReply('59.5'));
    await handleAnalyze('Bearer x', recruiter);
    const a = calls('commit_analytics_quota_and_save_candidate')[0].args;
    expect(a.p_match_score).toBe(60);
    expect(a.p_analysis_result).toMatchObject({ matchScore: 60, passProbability: 'Medium', scoreVersion: 'canonical-en-v2' });
  });
});

// M3-B R0.3-A: provider completion states, built as real SDK response objects
// (the `text` getter is the SDK's own). Only a completed STOP candidate may
// become a charged result; everything else completed is invalid AI output;
// unknown transport outcomes keep the M2-Q uncertain contract.
describe('provider completion states (real GenerateContentResponse)', () => {
  const VALID_JSON = rawReply('72').text;
  const sdk = (o: { text?: string; finishReason?: string; candidates?: false; blockReason?: string; usage?: false }) => {
    const r = new GenerateContentResponse();
    if (o.candidates !== false) {
      r.candidates = [{ content: { role: 'model', parts: o.text === undefined ? [] : [{ text: o.text }] }, ...(o.finishReason ? { finishReason: o.finishReason as FinishReason } : {}) }];
    }
    if (o.blockReason) r.promptFeedback = { blockReason: o.blockReason as BlockedReason };
    if (o.usage !== false) r.usageMetadata = USAGE;
    return r;
  };
  const expectInvalid = async (res: Awaited<ReturnType<typeof handleAnalyze>>, reason: string) => {
    expect(res).toEqual({ status: 502, body: { error: INVALID_AI_OUTPUT_MESSAGES.released.en, code: 'invalid_ai_output', quotaReleased: true, retryable: false } });
    expect(calls('commit_analytics_quota')).toHaveLength(0);
    expect(calls('commit_analytics_quota_and_save_candidate')).toHaveLength(0);
    expect(calls('release_analytics_quota').map((c) => c.args.p_outcome)).toEqual(['provider_error']);
    expect(historyUpserts).toHaveLength(0);
    expect(calls('consume_api_rate_limit')).toHaveLength(1);
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(logRows.at(-1)).toMatchObject({ status: 'error', input_tokens: 3829, output_tokens: 1775 });
    expect(String(logRows.at(-1)!.error_message)).toBe(`[invalid_ai_output:${reason}:release_refunded]`);
  };

  it('STOP with valid output → 200, committed, saved (control)', async () => {
    generateContent.mockResolvedValue(sdk({ text: VALID_JSON, finishReason: 'STOP' }));
    const res = await handleAnalyze('Bearer x', personal);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ matchScore: 72, scoreVersion: 'canonical-en-v2' });
    expect(calls('commit_analytics_quota')).toHaveLength(1);
    expect(historyUpserts).toHaveLength(1);
  });

  it('MAX_TOKENS with syntactically valid JSON and a valid score is NOT accepted', async () => {
    generateContent.mockResolvedValue(sdk({ text: VALID_JSON, finishReason: 'MAX_TOKENS' }));
    await expectInvalid(await handleAnalyze('Bearer x', personal), 'incomplete_response');
  });

  it('MAX_TOKENS with truncated JSON', async () => {
    generateContent.mockResolvedValue(sdk({ text: VALID_JSON.slice(0, 60), finishReason: 'MAX_TOKENS' }));
    await expectInvalid(await handleAnalyze('Bearer x', personal), 'incomplete_response');
  });

  it.each(['SAFETY', 'RECITATION', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'LANGUAGE', 'OTHER', 'FINISH_REASON_UNSPECIFIED'])(
    'candidate finishReason %s (even with parseable JSON) → invalid', async (fr) => {
      generateContent.mockResolvedValue(sdk({ text: VALID_JSON, finishReason: fr }));
      await expectInvalid(await handleAnalyze('Bearer x', personal), 'incomplete_response');
    });

  it('candidate blocked by safety with no content parts', async () => {
    generateContent.mockResolvedValue(sdk({ finishReason: 'SAFETY' }));
    await expectInvalid(await handleAnalyze('Bearer x', personal), 'incomplete_response');
  });

  it('candidate without a finishReason is not a completed answer', async () => {
    generateContent.mockResolvedValue(sdk({ text: VALID_JSON }));
    await expectInvalid(await handleAnalyze('Bearer x', personal), 'incomplete_response');
  });

  it('prompt blocked by safety policy (no candidates, promptFeedback.blockReason)', async () => {
    generateContent.mockResolvedValue(sdk({ candidates: false, blockReason: 'SAFETY' }));
    await expectInvalid(await handleAnalyze('Bearer x', personal), 'blocked');
  });

  it('missing candidates → empty text → malformed_json', async () => {
    generateContent.mockResolvedValue(sdk({ candidates: false }));
    await expectInvalid(await handleAnalyze('Bearer x', personal), 'malformed_json');
  });

  it('STOP with empty text → malformed_json', async () => {
    generateContent.mockResolvedValue(sdk({ text: '', finishReason: 'STOP' }));
    await expectInvalid(await handleAnalyze('Bearer x', personal), 'malformed_json');
  });

  it('missing usage metadata: still invalid, tokens logged as 0', async () => {
    generateContent.mockResolvedValue(sdk({ text: VALID_JSON, finishReason: 'MAX_TOKENS', usage: false }));
    const res = await handleAnalyze('Bearer x', personal);
    expect(res.status).toBe(502);
    expect(logRows.at(-1)).toMatchObject({ status: 'error', input_tokens: 0, output_tokens: 0, model: 'gemini-3-flash-preview' });
  });

  it('recruiter MAX_TOKENS → fenced failure transition, no candidate save', async () => {
    generateContent.mockResolvedValue(sdk({ text: VALID_JSON, finishReason: 'MAX_TOKENS' }));
    await expectInvalid(await handleAnalyze('Bearer x', recruiter), 'incomplete_response');
    expect(candidateUpdates).toHaveLength(1);
    expect(candidateUpdates[0].payload).toMatchObject({ status: 'error' });
    expect(candidateUpdates[0].filters).toEqual([['id', CANDIDATE], ['analysis_attempt_id', KEY], ['status', 'analyzing']]);
  });

  it('release unconfirmed → no refund claim', async () => {
    rpcReply.release_analytics_quota = ok({ status: 'uncertain', replay: true });
    generateContent.mockResolvedValue(sdk({ text: VALID_JSON, finishReason: 'MAX_TOKENS' }));
    const res = await handleAnalyze('Bearer x', personal);
    expect(res.body).toMatchObject({ code: 'invalid_ai_output', quotaReleased: false, error: INVALID_AI_OUTPUT_MESSAGES.unconfirmed.en });
  });

  it('localization reply truncated or blocked keeps the safe EN fallback; canonical score untouched', async () => {
    // A canonical result with localizable prose, so the second call really happens.
    const withProse = VALID_JSON.replace('"matchScore":72,', '"matchScore":72,"matchingPoints":[{"content":"Strong SQL analytics at Acme"}],');
    generateContent
      .mockResolvedValueOnce(sdk({ text: withProse, finishReason: 'STOP' }))
      .mockResolvedValueOnce(sdk({ text: '{"items":[', finishReason: 'MAX_TOKENS' }));
    const res = await handleAnalyze('Bearer x', { ...personal, language: 'vi' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ matchScore: 72, passProbability: 'Medium', scoreVersion: 'canonical-en-v2', presentationLanguage: 'en' });
    expect(calls('commit_analytics_quota')).toHaveLength(1);
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['connection loss', new TypeError('fetch failed')],
    ['aborted request', Object.assign(new Error('This operation was aborted'), { name: 'AbortError' })],
    ['provider timeout', new Error('DEADLINE_EXCEEDED')],
  ])('%s keeps the uncertain contract (not invalid_ai_output)', async (_l, err) => {
    generateContent.mockRejectedValue(err);
    const res = await handleAnalyze('Bearer x', personal);
    expect(res.body.code).not.toBe('invalid_ai_output');
    expect(calls('release_analytics_quota').map((c) => c.args.p_outcome)).toEqual(['uncertain']);
    expect(calls('commit_analytics_quota')).toHaveLength(0);
    expect(historyUpserts).toHaveLength(0);
  });
});
