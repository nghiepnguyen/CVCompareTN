import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateFullRewrite } from '../../../_server-lib/ai/suggestionGuard';

const generateContent = vi.fn();
vi.mock('../../../_server-lib/ai/geminiClient.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../_server-lib/ai/geminiClient')>()),
  getGeminiClient: () => ({ models: { generateContent } }),
}));

import { generateFullRewrite, REWRITE_RETRY_MIN_BUDGET_MS } from '../../../_server-lib/ai/rewriteService';

const md = (body: string) => `# Nguyen Van A\nemail@example.com | 0912 345 678\n\n## Work Experience\n### Data Analyst — Acme | 01/2020 – 12/2023\n${body}`;
const check = (originalCvText: string, jd: string, body: string) =>
  validateFullRewrite({ originalCvText, jd, rewrittenCv: md(body) });

describe('validateFullRewrite: numbers', () => {
  const cv = 'Data Analyst at Acme 2020-2023. Improved conversion by 20%. Phone 0912 345 678. Built 3 dashboards.';

  it('passes a number stated in the CV', () => {
    expect(check(cv, '', '- Improved conversion by 20%').valid).toBe(true);
  });

  it('fails a metric the CV never states', () => {
    expect(check(cv, '', '- Improved conversion by 35%')).toEqual({
      valid: false,
      violations: [{ reason: 'unsupported-number', concept: '35' }],
    });
  });

  it('ignores dates, year ranges and ordinary CV numbers', () => {
    expect(check(cv, '', '- Built 3 dashboards (2020–2023), shipped 06/2021').valid).toBe(true);
  });

  it('does not check the contact preamble (re-spaced phone, LinkedIn label)', () => {
    const r = validateFullRewrite({
      originalCvText: `${cv} linkedin.com/in/nva`,
      jd: 'Run LinkedIn campaigns.',
      rewrittenCv: '# Nguyen Van A\n0912345678 | LinkedIn: linkedin.com/in/nva\n\n## Experience\n- Built 3 dashboards',
    });
    expect(r.valid).toBe(true);
  });

  it('flags a re-spaced phone number outside the preamble (accepted numeric-equivalence debt)', () => {
    expect(check(cv, '', '- Contact: 0912345678').valid).toBe(false);
  });
});

describe('validateFullRewrite: raw-JD concepts', () => {
  const jd = 'We need self-serve analytics in BigQuery and strong demand forecasting.';

  it('fails a JD-only hyphenated concept', () => {
    expect(check('Built Tableau dashboards for sales.', jd, '- Built self-serve dashboards').violations).toEqual([
      { reason: 'raw-jd', concept: 'self-serve' },
    ]);
  });

  it('passes when the CV already states the concept', () => {
    expect(check('Built self-serve dashboards for sales.', jd, '- Built self-serve dashboards').valid).toBe(true);
  });

  it('passes a truthful paraphrase without JD-only concepts', () => {
    expect(check('Made Tableau dashboards for the sales team.', jd, '- Designed Tableau dashboards for sales').valid).toBe(true);
  });

  it('known debt: lowercase JD phrases outside the narrow extractor are not blocked', () => {
    expect(check('Built Tableau dashboards.', jd, '- Led demand forecasting with Tableau').valid).toBe(true);
  });
});

const reply = (fullRewrittenCV: string) => ({
  text: JSON.stringify({ fullRewrittenCV }),
  usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 },
});
const CV = 'Data Analyst at Acme. Improved conversion by 20%. Built Tableau dashboards for sales and marketing teams weekly.';
const JD = 'Need self-serve analytics.';
const SAFE = md('- Improved conversion by 20%');
const UNSAFE = md('- Improved conversion by 35% with self-serve dashboards');
const promptOf = (call: number) => generateContent.mock.calls[call][0].contents[0].parts[0].text as string;

describe('generateFullRewrite: validation → one retry → fallback', () => {
  beforeEach(() => {
    generateContent.mockReset();
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('first pass valid: 1 call, no retry', async () => {
    generateContent.mockResolvedValueOnce(reply(SAFE));
    const r = await generateFullRewrite(JD, CV, 'text/plain', 'en');
    expect(r.fullRewrittenCV).toBe(SAFE);
    expect(r.fidelityFallback).toBeUndefined();
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it('first fails, retry passes: returns retry, retry prompt has no raw JD', async () => {
    generateContent.mockResolvedValueOnce(reply(UNSAFE)).mockResolvedValueOnce(reply(SAFE));
    const r = await generateFullRewrite(JD, CV, 'text/plain', 'en');
    expect(r.fullRewrittenCV).toBe(SAFE);
    expect(r.fidelityFallback).toBeUndefined();
    expect(r.usage.inputTokens).toBe(200);
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(promptOf(0)).toContain(JD);
    expect(promptOf(1)).not.toContain(JD);
    expect(promptOf(1)).not.toContain('self-serve');
  });

  it('first and retry fail: empty fallback, max 2 calls', async () => {
    generateContent.mockResolvedValue(reply(UNSAFE));
    const r = await generateFullRewrite(JD, CV, 'text/plain', 'en');
    expect(r).toMatchObject({ fullRewrittenCV: '', fidelityFallback: true });
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it('retry error: fallback instead of throwing', async () => {
    generateContent.mockResolvedValueOnce(reply(UNSAFE)).mockRejectedValueOnce(new Error('503'));
    const r = await generateFullRewrite(JD, CV, 'text/plain', 'en');
    expect(r).toMatchObject({ fullRewrittenCV: '', fidelityFallback: true });
  });

  it('not enough budget left: fallback without retry', async () => {
    generateContent.mockResolvedValueOnce(reply(UNSAFE));
    const r = await generateFullRewrite(JD, CV, 'text/plain', 'en', REWRITE_RETRY_MIN_BUDGET_MS - 1);
    expect(r).toMatchObject({ fullRewrittenCV: '', fidelityFallback: true });
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it('image CV: no source text, validation skipped', async () => {
    generateContent.mockResolvedValueOnce(reply(UNSAFE));
    const r = await generateFullRewrite(JD, 'data:image/png;base64,AAAA', 'image/png', 'en');
    expect(r.fullRewrittenCV).toBe(UNSAFE);
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it('PDF without extractable text (inline fallback): validation skipped', async () => {
    generateContent.mockResolvedValueOnce(reply(UNSAFE));
    const r = await generateFullRewrite(JD, Buffer.from('not a pdf').toString('base64'), 'application/pdf', 'en');
    expect(r.fullRewrittenCV).toBe(UNSAFE);
    expect(generateContent).toHaveBeenCalledTimes(1);
  });
});
