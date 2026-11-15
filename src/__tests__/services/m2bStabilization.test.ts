// M2-B regression tests for the M2-A audit findings (docs/audits/2026-11-15-m2a-analyze-stabilization-audit.md).
// Offline: Gemini and Supabase are mocked; real handlers, services, limits and deadlines.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiError } from '@google/genai';

const generateContent = vi.fn();
vi.mock('../../../_server-lib/ai/geminiClient.js', async (orig) => ({
  ...(await orig<typeof import('../../../_server-lib/ai/geminiClient')>()),
  getGeminiClient: () => ({ models: { generateContent } }),
}));

const USER_ID = '11111111-1111-4111-8111-111111111111';
type RateRpc = { p_subject: string; p_bucket: string; p_limit: number; p_window_seconds: number };
const state = {
  userId: USER_ID,
  plan: 'free',
  used: 0,
  limit: 5,
  log: [] as Record<string, unknown>[],
  // Atomic in-memory stand-in for public.consume_api_rate_limit (one upsert per call).
  hits: new Map<string, number>(),
  rateCalls: [] as RateRpc[],
  rateMode: 'ok' as 'ok' | 'error' | 'hang' | 'malformed',
};
function thenable(run: () => Promise<unknown>) {
  const b: Record<string, unknown> = {};
  Object.assign(b, {
    select: () => b, eq: () => b, gte: () => b, or: () => b,
    abortSignal: () => b,
    maybeSingle: () => run(),
    then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => run().then(res, rej),
  });
  return b;
}
vi.mock('../../../_server-lib/payment/supabaseAdmin.js', () => ({
  getUserFromBearerToken: async () => ({ id: state.userId }),
  getSupabaseAdmin: () => ({
    from: (table: string) =>
      table === 'analysis_log'
        ? {
            insert: (row: Record<string, unknown>) => thenable(async () => { state.log.push(row); return { error: null }; }),
            select: () => thenable(async () => ({ count: state.log.filter((r) => r.kind === 'analyze' && r.status === 'success').length })),
          }
        : thenable(async () => ({ data: { has_permission: true, role: 'user', plan: state.plan, plan_expires_at: null }, error: null })),
    rpc: (name: string, args: Record<string, unknown>) => thenable(async () => {
      if (name === 'consume_api_rate_limit') {
        const a = args as RateRpc;
        state.rateCalls.push(a);
        if (state.rateMode === 'error') return { data: null, error: { message: 'db down' } };
        if (state.rateMode === 'hang') return new Promise(() => {});
        if (state.rateMode === 'malformed') return { data: [{}], error: null };
        const key = `${a.p_subject}|${a.p_bucket}`;
        const hits = (state.hits.get(key) ?? 0) + 1;
        state.hits.set(key, hits);
        return { data: [{ allowed: hits <= a.p_limit, remaining: Math.max(a.p_limit - hits, 0), retry_after: 0 }], error: null };
      }
      if (name === 'check_analytics_quota') return { data: { allowed: state.used + 1 <= state.limit, used: state.used, limit: state.limit }, error: null };
      if (name === 'increment_usage_count') {
        if (state.used >= state.limit) return { data: null, error: { message: 'Monthly analytics limit reached' } };
        state.used++;
        return { data: null, error: null };
      }
      return { data: null, error: null };
    }),
  }),
}));

import { handleAnalyze } from '../../../_server-lib/analyze/handler';
import { handleParseCv } from '../../../_server-lib/parseCv/handler';
import { handleRewriteCv } from '../../../_server-lib/rewriteCv/handler';
import { hourlyAiLimit } from '../../../_server-lib/accountLock';
import { AI_RATE_LIMIT_BUCKETS, AI_RATE_LIMIT_WINDOW_SECONDS, RATE_LIMITS } from '../../../_server-lib/rateLimit';
import { MAX_CV_TEXT_CHARS, MAX_JD_CHARS } from '../../../_server-lib/inputLimits';

const analysisReply = () => new Promise((r) => setTimeout(() => r({
  text: JSON.stringify({ matchScore: 70, jobTitle: 'X' }),
  usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 500 },
}), 20));
const CV = 'Data analyst with SQL experience at Acme since 2020. '.repeat(3);
const body = { jd: 'Need SQL analytics', cvData: CV, language: 'en' };
const parsedReply = () => ({ text: JSON.stringify({ personal_information: { full_name: 'A' } }), usageMetadata: {} });
const rewriteReply = () => ({ text: '# A\n\n## Experience\n- Data analyst with SQL experience at Acme since 2020.', usageMetadata: {} });

beforeEach(() => {
  generateContent.mockReset();
  Object.assign(state, {
    userId: USER_ID, plan: 'free', used: 0, limit: 1000, log: [], hits: new Map(), rateCalls: [], rateMode: 'ok',
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  process.env.GEMINI_API_KEY = 'test';
});

describe('M2-B atomic AI slot (M2-A P1-1)', () => {
  it('a concurrent burst reaches Gemini at most hourlyAiLimit times (was: every request)', async () => {
    generateContent.mockImplementation(analysisReply);
    const N = 15;
    const results = await Promise.all(Array.from({ length: N }, () => handleAnalyze('Bearer x', body)));
    const ok = results.filter((r) => r.status === 200).length;
    const limited = results.filter((r) => r.status === 429).length;
    expect(hourlyAiLimit('free')).toBe(10);
    expect(generateContent).toHaveBeenCalledTimes(10);
    expect(ok).toBe(10);
    expect(limited).toBe(5);
    expect(state.log.filter((r) => r.error_message === '[ai_rate_limited]')).toHaveLength(5);
  });

  it('RESIDUAL (not fixed in M2-B): monthly quota stays check-then-increment inside the hourly cap', async () => {
    // Documents the known gap for the reserve/refund stage: 1 unit left, a
    // burst still yields up to hourlyAiLimit results while usage_count stops at the limit.
    state.limit = 5;
    state.used = 4;
    generateContent.mockImplementation(analysisReply);
    const results = await Promise.all(Array.from({ length: 15 }, () => handleAnalyze('Bearer x', body)));
    expect(results.filter((r) => r.status === 200).length).toBe(10);
    expect(state.used).toBe(5);
  });

  it('sequential requests are still capped', async () => {
    generateContent.mockImplementation(analysisReply);
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) statuses.push((await handleAnalyze('Bearer x', body)).status);
    expect(statuses.filter((s) => s === 200)).toHaveLength(10);
    expect(statuses.slice(-2)).toEqual([429, 429]);
  });

  it('uses dedicated ai_* buckets with the plan hourly limit and a 1h window', async () => {
    generateContent.mockImplementation(analysisReply);
    state.plan = 'recruiter';
    await handleAnalyze('Bearer x', body);
    generateContent.mockReset();
    generateContent.mockImplementation(async () => parsedReply());
    await handleParseCv('Bearer x', { cvData: CV, language: 'en' });
    generateContent.mockReset();
    generateContent.mockImplementation(async () => rewriteReply());
    await handleRewriteCv('Bearer x', { jd: 'Need SQL analytics', cvData: CV, language: 'en' });
    expect(state.rateCalls.map((c) => c.p_bucket)).toEqual(['ai_analyze', 'ai_parse_cv', 'ai_rewrite']);
    for (const c of state.rateCalls) {
      expect(c.p_subject).toBe(`u:${USER_ID}`);
      expect(c.p_limit).toBe(hourlyAiLimit('recruiter'));
      expect(c.p_window_seconds).toBe(AI_RATE_LIMIT_WINDOW_SECONDS);
    }
  });

  it('bucket names never collide with existing rate-limit buckets or each other', () => {
    const ai = Object.values(AI_RATE_LIMIT_BUCKETS);
    expect(new Set(ai).size).toBe(ai.length);
    for (const b of ai) {
      expect(Object.keys(RATE_LIMITS)).not.toContain(b);
      expect(b.startsWith('ai_')).toBe(true);
      expect(b.length).toBeLessThanOrEqual(64);
    }
    expect(Object.keys(RATE_LIMITS).some((b) => b.startsWith('ai_'))).toBe(false);
  });

  for (const mode of ['error', 'hang', 'malformed'] as const) {
    it(`fails closed when the reservation cannot be verified (${mode}): 503 retryable, no Gemini`, async () => {
      state.rateMode = mode;
      generateContent.mockImplementation(analysisReply);
      const a = await handleAnalyze('Bearer x', body);
      const p = await handleParseCv('Bearer x', { cvData: CV, language: 'en' });
      const r = await handleRewriteCv('Bearer x', { jd: 'Need SQL analytics', cvData: CV, language: 'en' });
      for (const res of [a, p, r]) {
        expect(res.status).toBe(503);
        expect(res.body.retryable).toBe(true);
      }
      expect(generateContent).not.toHaveBeenCalled();
      expect(state.log.filter((row) => row.error_message === '[rate_limit_unavailable]')).toHaveLength(3);
    }, 10_000);
  }

  it('fails closed for a subject it cannot key (non-UUID user id)', async () => {
    state.userId = 'not-a-uuid';
    generateContent.mockImplementation(analysisReply);
    const res = await handleAnalyze('Bearer x', body);
    expect(res.status).toBe(503);
    expect(generateContent).not.toHaveBeenCalled();
    expect(state.rateCalls).toHaveLength(0);
  });

  it('does not consume a slot for requests rejected before Gemini (monthly quota)', async () => {
    state.limit = 0;
    const res = await handleAnalyze('Bearer x', body);
    expect(res.status).toBe(429);
    expect(state.rateCalls).toHaveLength(0);
  });
});

describe('M2-B provider failure classification (M2-A P2-1)', () => {
  for (const [code, category] of [[429, 'gemini_rate_limited'], [500, 'gemini_unavailable'], [503, 'gemini_unavailable']] as const) {
    it(`Gemini ${code} → 503 retryable [${category}] on analyze, parse and rewrite (through the real services)`, async () => {
      generateContent.mockRejectedValue(new ApiError({ message: 'PROVIDER_RAW_DETAIL', status: code }));
      const a = await handleAnalyze('Bearer x', body);
      const p = await handleParseCv('Bearer x', { cvData: CV, language: 'en' });
      const r = await handleRewriteCv('Bearer x', { jd: 'Need SQL analytics', cvData: CV, language: 'en' });
      for (const res of [a, p, r]) {
        expect(res.status).toBe(503);
        expect(res.body.retryable).toBe(true);
        expect(JSON.stringify(res.body)).not.toContain('PROVIDER_RAW_DETAIL');
      }
      expect(state.log.map((row) => row.error_message)).toEqual([`[${category}]`, `[${category}]`, `[${category}]`]);
      // No automatic retry: exactly one Gemini call per request.
      expect(generateContent).toHaveBeenCalledTimes(3);
    });
  }

  it('a non-transient provider error (400) stays 500 non-retryable [gemini_error]', async () => {
    generateContent.mockRejectedValue(new ApiError({ message: 'bad request', status: 400 }));
    const res = await handleAnalyze('Bearer x', body);
    expect(res.status).toBe(500);
    expect(res.body.retryable).toBe(false);
    expect(state.log.at(-1)?.error_message).toBe('[gemini_error]');
  });
});

describe('M2-B input size limits (M2-A P2-4)', () => {
  it('JD over MAX_JD_CHARS → 413 on analyze and rewrite; Gemini not called, no slot used', async () => {
    const big = 'x'.repeat(MAX_JD_CHARS + 1);
    const a = await handleAnalyze('Bearer x', { ...body, jd: big });
    const r = await handleRewriteCv('Bearer x', { jd: big, cvData: CV });
    for (const res of [a, r]) {
      expect(res.status).toBe(413);
      expect(res.body).toMatchObject({ field: 'jd', maxChars: MAX_JD_CHARS });
    }
    expect(generateContent).not.toHaveBeenCalled();
    expect(state.rateCalls).toHaveLength(0);
  });

  it('JD exactly at the limit is accepted and forwarded unchanged', async () => {
    generateContent.mockImplementation(analysisReply);
    const jd = 'y'.repeat(MAX_JD_CHARS);
    const res = await handleAnalyze('Bearer x', { ...body, jd });
    expect(res.status).toBe(200);
    expect(generateContent.mock.calls[0][0].contents[0].parts[0].text).toContain(jd);
  });

  it('CV text over MAX_CV_TEXT_CHARS → 413 on analyze, parse and rewrite', async () => {
    const big = 'z'.repeat(MAX_CV_TEXT_CHARS + 1);
    const a = await handleAnalyze('Bearer x', { ...body, cvData: big });
    const p = await handleParseCv('Bearer x', { cvData: big });
    const r = await handleRewriteCv('Bearer x', { jd: 'Need SQL', cvData: big });
    for (const res of [a, p, r]) expect(res).toMatchObject({ status: 413, body: { field: 'cv', maxChars: MAX_CV_TEXT_CHARS } });
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('binary CVs (base64 PDF / image) are not measured against the text limit', async () => {
    generateContent.mockImplementation(analysisReply);
    const base64 = 'A'.repeat(MAX_CV_TEXT_CHARS + 10);
    const res = await handleAnalyze('Bearer x', { ...body, cvData: base64, cvMimeType: 'image/png' });
    expect(res.status).toBe(200);
  });
});
