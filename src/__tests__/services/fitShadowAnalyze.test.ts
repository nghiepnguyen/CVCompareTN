import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// M3-B A3.3: fit-score-v1 shadow on the real analyze handler. Only Gemini,
// Supabase, quota and the AI slot are mocked (same pattern as guardMetrics.test.ts).
const generateContent = vi.fn();
const commitMonthlyQuota = vi.fn(async () => 'committed');
vi.mock('../../../_server-lib/quota/monthlyQuota.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../_server-lib/quota/monthlyQuota.js')>()),
  reserveMonthlyQuota: async () => ({ status: 'reserved', reservationId: 'res-1' }),
  commitMonthlyQuota: () => commitMonthlyQuota(),
  releaseMonthlyQuota: async () => true,
}));
vi.mock('../../../_server-lib/rateLimit.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../_server-lib/rateLimit')>()),
  reserveAiCall: async () => 'ok',
}));
vi.mock('../../../_server-lib/ai/geminiClient.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../_server-lib/ai/geminiClient')>()),
  getGeminiClient: () => ({ models: { generateContent } }),
}));
// Spy on the shadow builder; `shadowThrows` simulates a bug inside it.
let shadowThrows = false;
const buildSpy = vi.fn();
vi.mock('../../../src/services/ai/fitScore.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../services/ai/fitScore')>();
  return {
    ...real,
    buildFitShadow: (...a: Parameters<typeof real.buildFitShadow>) => {
      buildSpy(...a);
      if (shadowThrows) throw new Error('boom: SQL Acme a@example.com');
      return real.buildFitShadow(...a);
    },
  };
});

const insert = vi.fn();
const chain: Record<string, unknown> = { select: () => chain, eq: () => chain, abortSignal: () => chain, maybeSingle: async () => ({ data: { plan: 'free', role: 'user', has_permission: true } }) };
vi.mock('../../../_server-lib/payment/supabaseAdmin.js', () => ({
  getUserFromBearerToken: async () => ({ id: 'user-1' }),
  getSupabaseAdmin: () => ({
    from: (table: string) =>
      table === 'analysis_log' ? { insert: (row: unknown) => ({ abortSignal: () => insert(row) }) } : chain,
    rpc: (fn: string) => ({
      abortSignal: async () => ({ data: fn === 'check_analytics_quota' ? { allowed: true } : null, error: null }),
    }),
  }),
}));

import { handleAnalyze } from '../../../_server-lib/analyze/handler';
import { analyzeCV } from '../../../_server-lib/ai/analysisService';

// Synthetic, PII-shaped strings so the privacy check can prove none is logged.
const CV = 'Nguyen Van A, a@example.com, 0912345678. Data Analyst at Acme. Wrote SQL reports for sales weekly using Tableau.';
const JD = 'Senior Data Analyst at Globex: SQL, Tableau, Python.';
const TABLE = {
  skills: [
    { requirement: 'SQL', status: 'matched', cvEvidence: 'Wrote SQL reports for sales weekly at Acme', priority: 'required', improvement: 'n/a' },
    { requirement: 'Python', status: 'unknown', priority: 'required', improvement: 'Add Python' }, // schema violation → displayed as missing,
  ],
  experience: [{ requirement: '5+ years of analytics', status: 'partial', cvEvidence: 'Data Analyst at Acme', priority: 'required' }],
  tools: [{ requirement: 'Tableau', status: 'matched', cvEvidence: 'Used Tableau for sales dashboards', priority: 'nice-to-have' }],
  education: [],
  keywords: [{ requirement: 'Globex', status: 'missing' }],
};
const reply = (detailedComparison: unknown = TABLE) => ({
  text: JSON.stringify({ matchScore: 72, jobTitle: 'Senior Data Analyst', detailedComparison, rewriteSuggestions: [] }),
  usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
});
const KEY = '11111111-1111-4111-8111-111111111111';
const analyze = (body: Record<string, unknown> = {}) =>
  handleAnalyze('Bearer t', { jd: JD, cvData: CV, cvMimeType: 'text/plain', language: 'en', idempotencyKey: KEY, ...body });
const loggedMetrics = () => (insert.mock.calls.at(-1)![0] as { guard_metrics: Record<string, unknown> }).guard_metrics;
// generateContent args minus the per-request AbortSignal.
const geminiArgs = () => generateContent.mock.calls.map(([a]) => { const { abortSignal: _s, ...config } = a.config; return { ...a, config }; });

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  generateContent.mockReset();
  commitMonthlyQuota.mockClear();
  buildSpy.mockClear();
  shadowThrows = false;
  insert.mockReset().mockResolvedValue({ error: null });
  vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.unstubAllEnvs());

async function run(env: Record<string, string>, body?: Record<string, unknown>) {
  vi.unstubAllEnvs();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  generateContent.mockReset().mockResolvedValueOnce(reply());
  const res = await analyze(body);
  return { res, metrics: loggedMetrics(), gemini: geminiArgs() };
}

describe('fit-score shadow: flags OFF (default)', () => {
  it('guard_metrics keeps the exact pre-A3.3 shape and the builder never runs', async () => {
    const { res, metrics } = await run({});
    expect(res.status).toBe(200);
    expect(buildSpy).not.toHaveBeenCalled();
    expect(Object.keys(metrics).sort()).toEqual(['requirementVerification', 'suggestionGuard', 'v']);
  });
  it('FIT_SCORE_SHADOW=false is off', async () => {
    await run({ FIT_SCORE_SHADOW: 'false', FIT_SCORE_AUTHORITY: 'false' });
    expect(buildSpy).not.toHaveBeenCalled();
    expect(loggedMetrics()).not.toHaveProperty('fitShadow');
  });
});

describe('fit-score shadow: ON', () => {
  it('logs fitShadow; response body, Gemini request and quota calls are identical to OFF', async () => {
    const off = await run({});
    const offCommits = commitMonthlyQuota.mock.calls.length;
    const on = await run({ FIT_SCORE_SHADOW: 'true' });
    expect(on.res).toEqual(off.res);
    expect(on.res.body.matchScore).toBe(72);
    expect(on.res.body.scoreVersion).toBe('canonical-en-v2');
    expect(on.res.body.passProbability).toBe('Medium');
    expect(on.res.body).not.toHaveProperty('fitShadow');
    expect(JSON.stringify(on.res.body)).not.toContain('fit-score');
    expect(on.gemini).toEqual(off.gemini);
    expect(on.gemini).toHaveLength(1); // no extra Gemini call
    expect(commitMonthlyQuota.mock.calls.length - offCommits).toBe(offCommits);
    const { fitShadow, ...rest } = on.metrics;
    expect(rest).toEqual(off.metrics);
    // SQL matched(3·2) + Python missing(0) + experience partial(3·1) + Tableau pref matched(1·2) = 11 / 20 → 55
    expect(fitShadow).toEqual({
      v: 'fit-score-v1', eligible: true, canonical: 72, shadow: 55, absDiff: 17, bandCanonical: 'Medium', bandShadow: 'Low',
      counts: { matched: 2, partial: 1, missing: 1, unknown: 0 }, required: 3, preferred: 1,
      diag: { rowsIn: 5, rowsRejected: 0, keywordsExcluded: 1, duplicatesMerged: 0, conflictingDuplicates: 0, aliasMerged: 0, unverifiedMatchDowngraded: 0, listOnlyEvidence: 0, statusDefaulted: 0, priorityDefaulted: 0, categoryDefaulted: 0, schemaViolations: 1 },
      inputMode: 'text',
    });
  });

  it('FIT_SCORE_AUTHORITY=true does not switch the score', async () => {
    const off = await run({});
    const both = await run({ FIT_SCORE_SHADOW: 'true', FIT_SCORE_AUTHORITY: 'true' });
    expect(both.res).toEqual(off.res);
    expect(both.res.body.matchScore).toBe(72);
  });

  it('a shadow failure never fails the analysis: 200, same body, reason "error" with no message', async () => {
    const off = await run({});
    shadowThrows = true;
    const on = await run({ FIT_SCORE_SHADOW: 'true' });
    expect(on.res).toEqual(off.res);
    expect(on.metrics.fitShadow).toEqual({ v: 'fit-score-v1', eligible: false, reason: 'error' });
  });

  it('records the input mode (image)', async () => {
    const { metrics } = await run({ FIT_SCORE_SHADOW: 'true' }, { cvData: 'data:image/png;base64,AAAA', cvMimeType: 'image/png' });
    expect(metrics.fitShadow).toMatchObject({ inputMode: 'image' });
  });

  it('malformed model table → ineligible with reason, analysis still 200', async () => {
    vi.stubEnv('FIT_SCORE_SHADOW', 'true');
    generateContent.mockReset().mockResolvedValueOnce(reply('not a table'));
    const res = await analyze();
    expect(res.status).toBe(200);
    expect(loggedMetrics().fitShadow).toMatchObject({ eligible: false, reason: 'malformed_rows', shadow: null });
  });

  it('vi (default UI language): localized return path carries the same shadow of the canonical rows', async () => {
    const viRun = async (env: Record<string, string>) => {
      vi.unstubAllEnvs();
      for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
      // analyze reply, then the localize call fails → localizeAnalysis falls back (never throws)
      generateContent.mockReset().mockResolvedValueOnce(reply()).mockRejectedValueOnce(new Error('503'));
      const res = await analyze({ language: 'vi' });
      return { res, metrics: loggedMetrics(), calls: generateContent.mock.calls.length };
    };
    const en = await run({ FIT_SCORE_SHADOW: 'true' });
    const off = await viRun({});
    const on = await viRun({ FIT_SCORE_SHADOW: 'true' });
    expect(on.res).toEqual(off.res);
    expect(on.res.status).toBe(200);
    expect([off.calls, on.calls]).toEqual([2, 2]);
    expect(off.metrics).not.toHaveProperty('fitShadow');
    expect(on.metrics.fitShadow).toEqual(en.metrics.fitShadow);
  });

  it('analyzeCV result (what history and recruiter candidate rows store) is identical ON vs OFF', async () => {
    const call = async (on: boolean) => {
      vi.unstubAllEnvs();
      if (on) vi.stubEnv('FIT_SCORE_SHADOW', 'true');
      generateContent.mockReset().mockResolvedValueOnce(reply());
      vi.spyOn(crypto, 'randomUUID').mockReturnValue(KEY);
      return analyzeCV(JD, CV, 'text/plain', 'cv.txt', 'en');
    };
    const off = await call(false);
    const on = await call(true);
    expect(on.result).toEqual(off.result);
    expect(off).not.toHaveProperty('fitShadow');
    expect(on.fitShadow).toMatchObject({ eligible: true, shadow: 55 });
  });
});

describe('fitShadow privacy', () => {
  const ENUMS: Record<string, string[]> = {
    v: ['fit-score-v1'],
    reason: ['no_scorable_rows', 'malformed_rows', 'too_many_rows', 'error'],
    bandCanonical: ['High', 'Medium', 'Low'],
    bandShadow: ['High', 'Medium', 'Low'],
    inputMode: ['text', 'pdf_text', 'inline_pdf', 'image'],
  };
  const check = (value: unknown, key = ''): void => {
    if (value !== null && typeof value === 'object') for (const [k, v] of Object.entries(value)) check(v, k);
    else if (typeof value === 'string') expect(ENUMS[key] ?? []).toContain(value);
    else expect(value === null || typeof value === 'number' || typeof value === 'boolean').toBe(true);
  };
  it('carries only numbers, booleans and enum strings — no CV/JD/requirement/evidence text', async () => {
    for (const throws of [false, true]) {
      shadowThrows = throws;
      const { metrics } = await run({ FIT_SCORE_SHADOW: 'true' });
      check(metrics.fitShadow);
      const json = JSON.stringify(metrics.fitShadow);
      for (const leak of ['SQL', 'Python', 'Tableau', 'Acme', 'Globex', 'example.com', '0912', 'Nguyen', 'Analyst', 'boom', 'user-1', KEY]) {
        expect(json).not.toContain(leak);
      }
    }
  });
});
