import { describe, it, expect, vi, beforeEach } from 'vitest';

// Real handlers + services; only Gemini and Supabase are mocked, so the
// guard_metrics asserted below is the exact object handed to analysis_log.
const generateContent = vi.fn();
vi.mock('../../../_server-lib/ai/geminiClient.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../_server-lib/ai/geminiClient')>()),
  getGeminiClient: () => ({ models: { generateContent } }),
}));

const insert = vi.fn();
const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: null }) };
vi.mock('../../../_server-lib/payment/supabaseAdmin.js', () => ({
  getUserFromBearerToken: async () => ({ id: 'user-1' }),
  getSupabaseAdmin: () => ({
    from: (table: string) => (table === 'analysis_log' ? { insert } : chain),
    rpc: async (fn: string) => ({ data: fn === 'check_analytics_quota' ? { allowed: true } : null, error: null }),
  }),
}));

import { handleAnalyze } from '../../../_server-lib/analyze/handler';
import { handleRewriteCv } from '../../../_server-lib/rewriteCv/handler';
import { dropUnsupportedSuggestions, rawJdConcepts } from '../../../_server-lib/ai/suggestionGuard';

const CV = 'Data Analyst at Acme. Improved conversion by 20%. Built Tableau dashboards for sales and marketing teams weekly.';
const JD = 'Need self-serve analytics and SQL.';
const sug = (section: string, optimized: string) => ({ section, original: 'orig text', optimized, explanation: 'why' });

const analyzeReply = (rewriteSuggestions: unknown[]) => ({
  text: JSON.stringify({ matchScore: 70, rewriteSuggestions }),
  usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
});
const rewriteReply = (fullRewrittenCV: string) => ({
  text: JSON.stringify({ fullRewrittenCV }),
  usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
});
const SAFE = '# Name\n\n## Experience\n- Improved conversion by 20%';
const UNSAFE = '# Name\n\n## Experience\n- Improved conversion by 35% with self-serve dashboards';

const loggedRow = () => insert.mock.calls.at(-1)![0] as Record<string, unknown>;
const analyze = (cvData: string, cvMimeType = 'text/plain') =>
  handleAnalyze('Bearer t', { jd: JD, cvData, cvMimeType, language: 'en' });
const rewrite = (cvData: string, cvMimeType = 'text/plain') =>
  handleRewriteCv('Bearer t', { jd: JD, cvData, cvMimeType, language: 'en' });

beforeEach(() => {
  generateContent.mockReset();
  insert.mockReset().mockResolvedValue({ error: null });
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('suggestion guard metrics (analyze)', () => {
  const suggestions = [
    sug('Experience', 'Improved conversion by 35%'),
    sug('Experience', 'Built 12 dashboards'),
    sug('Experience', 'Built self-serve Tableau dashboards'),
    sug('Experience', 'Built Tableau dashboards for sales'),
  ];

  it('counts numeric + numeric + raw-JD drops without changing returned suggestions', async () => {
    generateContent.mockResolvedValueOnce(analyzeReply(suggestions));
    const res = await analyze(CV);
    expect(res.status).toBe(200);
    expect(res.body.rewriteSuggestions).toEqual(dropUnsupportedSuggestions(suggestions, CV, rawJdConcepts(JD, CV)));
    expect(res.body).not.toHaveProperty('guardMetrics');
    expect(loggedRow().guard_metrics).toEqual({
      v: 1,
      suggestionGuard: { suggestionsIn: 4, droppedTotal: 3, skills: 0, numeric: 2, rawJd: 1, factualChecks: true },
    });
  });

  it('records zero counters when nothing is dropped', async () => {
    generateContent.mockResolvedValueOnce(analyzeReply([suggestions[3]]));
    await analyze(CV);
    expect(loggedRow().guard_metrics).toEqual({
      v: 1,
      suggestionGuard: { suggestionsIn: 1, droppedTotal: 0, skills: 0, numeric: 0, rawJd: 0, factualChecks: true },
    });
  });

  it('inline image: factualChecks false, Skills rule still counted', async () => {
    generateContent.mockResolvedValueOnce(analyzeReply([sug('Skills', 'SQL, Python'), suggestions[0]]));
    await analyze('data:image/png;base64,AAAA', 'image/png');
    expect(loggedRow().guard_metrics).toEqual({
      v: 1,
      suggestionGuard: { suggestionsIn: 2, droppedTotal: 1, skills: 1, numeric: 0, rawJd: 0, factualChecks: false },
    });
  });
});

describe('Full CV guard metrics (rewrite)', () => {
  it('first pass valid', async () => {
    generateContent.mockResolvedValueOnce(rewriteReply(SAFE));
    await rewrite(CV);
    expect(loggedRow().guard_metrics).toEqual({
      v: 1,
      fullCv: {
        validationAttempted: true, validationSkipped: false, firstPassValid: true,
        retryOutcome: 'not_needed', fidelityFallback: false, geminiCalls: 1,
      },
    });
  });

  it('first fails, retry recovers', async () => {
    generateContent.mockResolvedValueOnce(rewriteReply(UNSAFE)).mockResolvedValueOnce(rewriteReply(SAFE));
    const res = await rewrite(CV);
    expect(res.body).toEqual({ fullRewrittenCV: SAFE });
    expect(loggedRow().guard_metrics).toEqual({
      v: 1,
      fullCv: {
        validationAttempted: true, validationSkipped: false, firstPassValid: false,
        firstPassViolations: { unsupportedNumber: 1, rawJd: 1 },
        retryOutcome: 'recovered', fidelityFallback: false, geminiCalls: 2,
      },
    });
  });

  it('first and retry fail: invalid + fallback', async () => {
    generateContent.mockResolvedValue(rewriteReply(UNSAFE));
    await rewrite(CV);
    expect(loggedRow().guard_metrics).toEqual({
      v: 1,
      fullCv: {
        validationAttempted: true, validationSkipped: false, firstPassValid: false,
        firstPassViolations: { unsupportedNumber: 1, rawJd: 1 },
        retryOutcome: 'invalid', retryViolations: { unsupportedNumber: 1, rawJd: 1 },
        fidelityFallback: true, geminiCalls: 2,
      },
    });
  });

  it('retry errors: 2 calls, tokens only from the first', async () => {
    generateContent.mockResolvedValueOnce(rewriteReply(UNSAFE)).mockRejectedValueOnce(new Error('503'));
    await rewrite(CV);
    const row = loggedRow();
    expect(row.input_tokens).toBe(10);
    expect(row.guard_metrics).toMatchObject({ fullCv: { retryOutcome: 'error', fidelityFallback: true, geminiCalls: 2 } });
  });

  it('insufficient budget: skipped_budget + fallback, 1 call', async () => {
    const { generateFullRewrite, REWRITE_RETRY_MIN_BUDGET_MS } = await import('../../../_server-lib/ai/rewriteService');
    generateContent.mockResolvedValueOnce(rewriteReply(UNSAFE));
    const r = await generateFullRewrite(JD, CV, 'text/plain', 'en', REWRITE_RETRY_MIN_BUDGET_MS - 1);
    expect(r.guardMetrics).toEqual({
      validationAttempted: true, validationSkipped: false, firstPassValid: false,
      firstPassViolations: { unsupportedNumber: 1, rawJd: 1 },
      retryOutcome: 'skipped_budget', fidelityFallback: true, geminiCalls: 1,
    });
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it('inline image: validation skipped, not counted as valid', async () => {
    generateContent.mockResolvedValueOnce(rewriteReply(UNSAFE));
    await rewrite('data:image/png;base64,AAAA', 'image/png');
    expect(loggedRow().guard_metrics).toEqual({
      v: 1,
      fullCv: {
        validationAttempted: false, validationSkipped: true, firstPassValid: null,
        retryOutcome: 'not_needed', fidelityFallback: false, geminiCalls: 1,
      },
    });
  });
});

describe('privacy of persisted guard_metrics', () => {
  const FORBIDDEN = /^(cv|jd|cvText|concept|matchedForm|original|optimized|fullRewrittenCV|email|phone|section|text)$/i;
  // Every leaf must be a number, boolean, null, or the retryOutcome enum —
  // no free text can reach analysis_log.
  const check = (value: unknown, key = ''): void => {
    if (value !== null && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) {
        expect(k).not.toMatch(FORBIDDEN);
        check(v, k);
      }
    } else if (typeof value === 'string') {
      expect(key).toBe('retryOutcome');
      expect(['not_needed', 'skipped_budget', 'error', 'invalid', 'recovered']).toContain(value);
    } else {
      expect(value === null || typeof value === 'number' || typeof value === 'boolean').toBe(true);
    }
  };

  it('analyze and rewrite rows carry only counters, booleans and the enum', async () => {
    generateContent
      .mockResolvedValueOnce(analyzeReply([sug('Experience', 'Built self-serve dashboards, email a@example.com 0912345678')]))
      .mockResolvedValueOnce(rewriteReply(UNSAFE))
      .mockResolvedValueOnce(rewriteReply(UNSAFE));
    await analyze(`${CV} a@example.com 0912 345 678`);
    const analyzeMetrics = loggedRow().guard_metrics;
    await rewrite(CV);
    const rewriteMetrics = loggedRow().guard_metrics;
    for (const m of [analyzeMetrics, rewriteMetrics]) {
      check(m);
      const json = JSON.stringify(m);
      for (const leak of ['self-serve', '35', 'example.com', '0912', 'Acme', 'Need']) expect(json).not.toContain(leak);
    }
  });

  it('production console omits concept, matchedForm and numbers', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    generateContent
      .mockResolvedValueOnce(analyzeReply([sug('Experience', 'Built self-serve dashboards')]))
      .mockResolvedValueOnce(rewriteReply(UNSAFE))
      .mockResolvedValueOnce(rewriteReply(UNSAFE));
    await analyze(CV);
    await rewrite(CV);
    const out = JSON.stringify(info.mock.calls);
    expect(out).toContain('[suggestionGuard] dropped');
    expect(out).toContain('[fullRewriteGuard] violation');
    // Keys appear escaped (\"concept\") inside the stringified log lines.
    for (const leak of ['self-serve', '\\"concept\\"', '\\"matchedForm\\"', '35']) expect(out).not.toContain(leak);
  });
});

describe('telemetry failure isolation', () => {
  it('analyze and rewrite still succeed when the analysis_log insert fails', async () => {
    insert.mockRejectedValue(new Error('column "guard_metrics" does not exist'));
    generateContent.mockResolvedValueOnce(analyzeReply([])).mockResolvedValueOnce(rewriteReply(SAFE));
    expect((await analyze(CV)).status).toBe(200);
    const res = await rewrite(CV);
    expect(res).toEqual({ status: 200, body: { fullRewrittenCV: SAFE } });
  });

  it('a supabase error result does not break the response either', async () => {
    insert.mockResolvedValue({ error: { message: 'insert failed' } });
    generateContent.mockResolvedValueOnce(rewriteReply(SAFE));
    expect((await rewrite(CV)).status).toBe(200);
  });
});
