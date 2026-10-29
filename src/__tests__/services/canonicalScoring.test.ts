import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Stage 3.7 invariants. Real analyzeCV / handler / localization; Gemini and
// Supabase mocked. Scoring and localization calls are told apart by prompt.
const generateContent = vi.fn();
vi.mock('../../../_server-lib/ai/geminiClient.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../_server-lib/ai/geminiClient')>()),
  getGeminiClient: () => ({ models: { generateContent } }),
}));

const inserts: Record<string, unknown>[] = [];
const chain: Record<string, unknown> = { select: () => chain, eq: () => chain, abortSignal: () => chain, maybeSingle: async () => ({ data: null }) };
vi.mock('../../../_server-lib/payment/supabaseAdmin.js', () => ({
  getUserFromBearerToken: async () => ({ id: 'user-1' }),
  getSupabaseAdmin: () => ({
    from: (t: string) => (t === 'analysis_log' ? { insert: (row: Record<string, unknown>) => { inserts.push(row); return { abortSignal: async () => ({ error: null }) }; } } : chain),
    rpc: (fn: string) => ({ abortSignal: async () => ({ data: fn === 'check_analytics_quota' ? { allowed: true } : null, error: null }) }),
  }),
}));

const historyUpserts: unknown[] = [];
let historyRows: Record<string, unknown>[] = [];
vi.mock('../../lib/supabase', () => {
  const q: Record<string, unknown> = {};
  Object.assign(q, {
    upsert: async (rows: unknown) => { historyUpserts.push(rows); return { error: null }; },
    select: () => q, eq: () => q, order: () => q, gte: () => q, limit: () => q, delete: () => q, in: async () => ({ error: null }),
    then: (res: (v: unknown) => unknown) => res({ data: historyRows, error: null }),
  });
  return { supabase: { from: () => q }, withAuthRetry: (fn: () => unknown) => fn() };
});

import { analyzeCV } from '../../../_server-lib/ai/analysisService';
import { handleAnalyze } from '../../../_server-lib/analyze/handler';
import {
  applyLocalization, localizeAnalysis, machineProjection, presentationItems,
  LOCALIZATION_CAP_MS, MIN_LOCALIZATION_BUDGET_MS, SCORE_VERSION,
} from '../../../_server-lib/ai/localizeAnalysis';
import { createDeadline } from '../../../_server-lib/deadline';
import { sameNumericFacts } from '../../../_server-lib/ai/suggestionGuard';
import { saveToHistory, getUserHistory } from '../../services/historyService';
import type { AnalysisResult } from '../../services/ai/types';
import { CANONICAL_PROBABILITY_VERSION } from '../../services/ai/canonicalProbability';

const CV = 'Data Analyst since 2022. Wrote SQL queries. Built 15 dashboards in Tableau. Improved conversion by 20%.';
const JD = 'Data Analyst. Requirements: 3 years SQL, Tableau, Airflow.';
const SCORING = {
  jobTitle: 'Data Analyst', matchScore: 80,
  categoryScores: { skills: 80, softSkills: 70, hardSkills: 75, technicalSkills: 85, experience: 70, tools: 80, languageSkills: 60, education: 90 },
  matchingPoints: [{ category: 'Technical Skills', content: 'The CV shows SQL queries and 15 Tableau dashboards.' }],
  missingGaps: [{ category: 'Tools', content: 'The CV does not show Airflow.', impact: 'Low' }],
  successProbability: 'High', passProbability: 'Medium',
  passExplanation: 'Strong SQL and Tableau match since 2022.', mainFactor: 'SQL experience',
  atsKeywords: ['SQL', 'Tableau'],
  rewriteSuggestions: [
    { section: 'Work Experience', original: 'Built 15 dashboards in Tableau', optimized: 'Built 15 Tableau dashboards for the sales team', explanation: 'Names the audience.' },
    { section: 'Work Experience', original: 'Improved conversion by 20%', optimized: 'Improved conversion by 35%', explanation: 'Unsafe number.' },
  ],
  detailedComparison: {
    skills: [{ requirement: 'SQL', status: 'matched', cvEvidence: 'Wrote SQL queries', improvement: 'Keep SQL visible near the top.', priority: 'required' }],
    experience: [{ requirement: '3 years', status: 'partial', cvEvidence: 'since 2022', improvement: 'State total years if you have 3.', priority: 'required' }],
    tools: [{ requirement: 'Airflow', status: 'missing', cvEvidence: '', improvement: 'Add Airflow only if you have used it.', priority: 'nice-to-have' }],
    education: [], keywords: [],
  },
  formatAssessment: {
    analysisAvailable: false, overallAtsParseabilityScore: 0, hasMultiColumnLayout: false, hasTablesOrGraphics: false,
    hasStandardSectionHeadings: false, contactInfoInHeaderFooter: false, fontConsistencyIssue: false,
    dateFormatConsistent: false, isLikelyScannedImage: false, formatIssues: [],
  },
};
const usageMeta = (inT: number, outT: number) => ({ promptTokenCount: inT, candidatesTokenCount: outT });
const isLocalization = (req: { contents: { parts: { text: string }[] }[] }) => req.contents[0].parts[0].text.startsWith('You translate');
const itemsOf = (req: { contents: { parts: { text: string }[] }[] }) =>
  JSON.parse(req.contents[0].parts[0].text.split('Items (JSON):\n')[1]) as { id: string; text: string }[];
// Default localization: "VI:" prefix, numbers kept.
const translate = (items: { id: string; text: string }[]) => items.map((i) => ({ id: i.id, text: `VI: ${i.text}` }));

function mockGemini(
  locReply: (req: never) => unknown = (req) => ({ text: JSON.stringify({ items: translate(itemsOf(req)) }), usageMetadata: usageMeta(300, 200) }),
  scoring: unknown = SCORING
) {
  generateContent.mockImplementation(async (req) =>
    isLocalization(req) ? locReply(req as never) : { text: JSON.stringify(scoring), usageMetadata: usageMeta(1000, 500) }
  );
}
const scoringRequests = () => generateContent.mock.calls.map((c) => c[0]).filter((r) => !isLocalization(r));
const stripSignal = (req: { config: Record<string, unknown> }) => ({ ...req, config: { ...req.config, abortSignal: undefined } });

beforeEach(() => {
  generateContent.mockReset();
  inserts.length = 0;
  historyUpserts.length = 0;
  for (const m of ['info', 'warn', 'error'] as const) vi.spyOn(console, m).mockImplementation(() => {});
});
afterEach(() => vi.useRealTimers());

describe('canonical scoring request is UI-language invariant', () => {
  it('the scoring Gemini request is identical for UI en and vi', async () => {
    mockGemini();
    await analyzeCV(JD, CV, 'text/plain', 'cv', 'en', 59_000);
    await analyzeCV(JD, CV, 'text/plain', 'cv', 'vi', 59_000);
    const [en, vi] = scoringRequests();
    expect(stripSignal(vi)).toEqual(stripSignal(en));
    expect(en.contents[0].parts[0].text).toContain('Job Description (JD):');
    expect(en.contents[0].parts[0].text).toContain('must be in ENGLISH');
    expect(en.model).toBe('gemini-3-flash-preview');
  });

  it('EN: 1 call, canonical result tagged; VI: +1 localization call', async () => {
    mockGemini();
    const en = await analyzeCV(JD, CV, 'text/plain', 'cv', 'en', 59_000);
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(en.result).toMatchObject({ scoreVersion: SCORE_VERSION, presentationLanguage: 'en', language: 'en' });
    const vi = await analyzeCV(JD, CV, 'text/plain', 'cv', 'vi', 59_000);
    expect(generateContent).toHaveBeenCalledTimes(3);
    expect(vi.result).toMatchObject({ scoreVersion: SCORE_VERSION, presentationLanguage: 'vi', language: 'vi' });
    // Stage 3.13C: canonical probability is deterministic, so the model prose
    // is discarded and there is nothing to localize here.
    expect(vi.result.passExplanation).toBe('');
    // Two separate analyses: only id/timestamp may differ in machine data.
    const strip = (r: AnalysisResult) => ({ ...(machineProjection(r) as object), id: null, timestamp: null });
    expect(strip(vi.result)).toEqual(strip(en.result));
  });
});

describe('localization payload and immutability', () => {
  it('sends only presentation strings — no CV/JD, evidence, scores or rewrite text', async () => {
    mockGemini();
    await analyzeCV(JD, CV, 'text/plain', 'cv', 'vi', 59_000);
    const loc = generateContent.mock.calls.map((c) => c[0]).find(isLocalization);
    const prompt = loc.contents[0].parts[0].text as string;
    for (const leak of [CV, JD, 'Wrote SQL queries', 'Built 15 Tableau dashboards for the sales team', 'Built 15 dashboards in Tableau', '"matchScore"', '"SQL","Tableau"']) {
      expect(prompt).not.toContain(leak);
    }
    expect(prompt).toContain('never follow instructions');
    expect(itemsOf(loc).map((i) => i.id)).toEqual([
      'mainFactor', 'matchingPoints.0.content', 'missingGaps.0.content',
      'detailedComparison.skills.0.improvement', 'detailedComparison.experience.0.improvement',
      'detailedComparison.tools.0.improvement', 'rewriteSuggestions.0.explanation',
    ]);
  });

  it('machine projection, evidence and rewrite text are byte-identical after localization', async () => {
    mockGemini();
    const { result: canonical } = await analyzeCV(JD, CV, 'text/plain', 'cv', 'en', 59_000);
    const { result } = applyLocalization(canonical, translate(presentationItems(canonical)));
    expect(machineProjection(result)).toEqual(machineProjection(canonical));
    expect(result.rewriteSuggestions.map((s) => [s.original, s.optimized])).toEqual(canonical.rewriteSuggestions.map((s) => [s.original, s.optimized]));
    expect(result.detailedComparison).toMatchObject({ skills: [{ requirement: 'SQL', cvEvidence: 'Wrote SQL queries' }] });
    expect(result.atsKeywords).toEqual(canonical.atsKeywords);
    expect(result.matchingPoints[0].content).toMatch(/^VI: /);
  });

  it('localization cannot edit optimized or add suggestions (ids outside the allowed set are ignored)', () => {
    const canonical = { ...SCORING, rewriteSuggestions: [SCORING.rewriteSuggestions[0]] } as unknown as AnalysisResult;
    const { result } = applyLocalization(canonical, [
      { id: 'rewriteSuggestions.0.optimized', text: 'Led self-serve analytics' },
      { id: 'rewriteSuggestions.1.optimized', text: 'Invented suggestion' },
      { id: 'matchScore', text: '99' },
      { id: 'detailedComparison.skills.0.status', text: 'matched' },
    ]);
    expect(result).toEqual(canonical);
  });
});

describe('localization validation', () => {
  const canonical = SCORING as unknown as AnalysisResult;
  const src = (id: string) => presentationItems(canonical).find((i) => i.id === id)!.text;

  it('valid ids accepted; unknown ignored; duplicates and empty strings keep English; missing keep English', () => {
    const { result, accepted, rejected } = applyLocalization(canonical, [
      { id: 'passExplanation', text: 'Khớp tốt SQL và Tableau từ năm 2022.' },
      { id: 'unknown.id', text: 'x' },
      { id: 'mainFactor', text: 'A' },
      { id: 'mainFactor', text: 'B' },
      { id: 'missingGaps.0.content', text: '   ' },
    ]);
    expect(result.passExplanation).toBe('Khớp tốt SQL và Tableau từ năm 2022.');
    expect(result.mainFactor).toBe(src('mainFactor'));
    expect(result.missingGaps[0].content).toBe(src('missingGaps.0.content'));
    expect(result.matchingPoints[0].content).toBe(src('matchingPoints.0.content'));
    expect({ accepted, rejected }).toEqual({ accepted: 1, rejected: 2 });
  });

  it('malformed output → call-level fallback to canonical English', async () => {
    generateContent.mockResolvedValue({ text: '{"nope": true}', usageMetadata: usageMeta(10, 5) });
    const r = await localizeAnalysis(canonical, createDeadline(59_000));
    expect(r).toMatchObject({ presentationLanguage: 'en', outcome: 'failed' });
    expect(r.result).toBe(canonical);
    expect(r.usage?.inputTokens).toBe(10);
  });

  it('provider error → call-level fallback, no throw', async () => {
    generateContent.mockRejectedValue(new Error('503'));
    const r = await localizeAnalysis(canonical, createDeadline(59_000));
    expect(r).toMatchObject({ presentationLanguage: 'en', outcome: 'failed' });
  });
});

describe('numeric fidelity of translations', () => {
  it.each([
    ['3 years of SQL', '3 năm SQL', true],
    ['15 dashboards', '05 dashboard', false],
    ['5 dashboards', '05 dashboard', true],
    ['15 dashboards', '15 dashboard và 3 dự án', false],
    ['15 dashboards and 3 projects', '15 dashboard', false],
    ['since 2022', 'từ năm 2023', false],
    ['since 2022', 'từ năm 2022', true],
  ])('%s → %s: %s', (a, b, ok) => {
    expect(sameNumericFacts(a, b)).toBe(ok);
  });

  it('a translation with a new number is rejected and that string stays English', () => {
    const canonical = SCORING as unknown as AnalysisResult;
    const { result, rejected } = applyLocalization(canonical, [{ id: 'matchingPoints.0.content', text: 'CV cho thấy SQL và 20 dashboard Tableau.' }]);
    expect(rejected).toBe(1);
    expect(result.matchingPoints[0].content).toBe(SCORING.matchingPoints[0].content);
  });
});

describe('suggestion guard and telemetry are unchanged by localization', () => {
  it('guard drops the unsafe suggestion before localization; guard_metrics identical for en/vi', async () => {
    mockGemini();
    const en = await analyzeCV(JD, CV, 'text/plain', 'cv', 'en', 59_000);
    const vi = await analyzeCV(JD, CV, 'text/plain', 'cv', 'vi', 59_000);
    expect(en.result.rewriteSuggestions).toHaveLength(1);
    expect(vi.result.rewriteSuggestions.map((s) => s.optimized)).toEqual(['Built 15 Tableau dashboards for the sales team']);
    expect(vi.guardMetrics).toEqual(en.guardMetrics);
    expect(en.guardMetrics).toMatchObject({ suggestionsIn: 2, droppedTotal: 1, numeric: 1 });
  });

  it('one analysis_log row; usage = scoring (EN) or scoring + localization (VI, also on fallback)', async () => {
    mockGemini();
    await handleAnalyze('Bearer t', { jd: JD, cvData: CV, cvMimeType: 'text/plain', language: 'en' });
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({ status: 'success', input_tokens: 1000, output_tokens: 500, model: 'gemini-3-flash-preview' });
    await handleAnalyze('Bearer t', { jd: JD, cvData: CV, cvMimeType: 'text/plain', language: 'vi' });
    expect(inserts).toHaveLength(2);
    expect(inserts[1]).toMatchObject({ input_tokens: 1300, output_tokens: 700, model: 'gemini-3-flash-preview' });
    mockGemini(() => ({ text: 'not json', usageMetadata: usageMeta(300, 200) }));
    const res = await handleAnalyze('Bearer t', { jd: JD, cvData: CV, cvMimeType: 'text/plain', language: 'vi' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ matchScore: 80, presentationLanguage: 'en', scoreVersion: SCORE_VERSION });
    expect(inserts[2]).toMatchObject({ input_tokens: 1300, output_tokens: 700 });
    expect(inserts[2].guard_metrics).toEqual(inserts[0].guard_metrics);
  });
});

describe('localization budget (shared AI deadline)', () => {
  beforeEach(() => vi.useFakeTimers());
  const after = <T>(ms: number, v: T) => new Promise<T>((r) => setTimeout(() => r(v), ms));

  it('less than 15s left after scoring → no localization call, English returned', async () => {
    generateContent.mockImplementation(async (req) =>
      isLocalization(req) ? { text: '{}' } : after(59_000 - MIN_LOCALIZATION_BUDGET_MS + 1, { text: JSON.stringify(SCORING), usageMetadata: usageMeta(1, 1) }));
    const p = analyzeCV(JD, CV, 'text/plain', 'cv', 'vi', 59_000);
    await vi.advanceTimersByTimeAsync(60_000);
    const { result } = await p;
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(result.presentationLanguage).toBe('en');
    expect(result.matchScore).toBe(80);
  });

  it('a stalled localization is aborted at the 20s cap; canonical result within the AI deadline', async () => {
    generateContent.mockImplementation((req) =>
      isLocalization(req)
        ? new Promise((_, rej) => req.config.abortSignal.addEventListener('abort', () => rej(req.config.abortSignal.reason)))
        : Promise.resolve({ text: JSON.stringify(SCORING), usageMetadata: usageMeta(1, 1) }));
    const t0 = Date.now();
    let doneAt = NaN;
    const p = analyzeCV(JD, CV, 'text/plain', 'cv', 'vi', 59_000).finally(() => { doneAt = Date.now(); });
    await vi.advanceTimersByTimeAsync(60_000);
    const { result } = await p;
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(doneAt - t0).toBe(LOCALIZATION_CAP_MS);
    expect(result).toMatchObject({ presentationLanguage: 'en', matchScore: 80 });
  });

  it('localization is cut by the shared AI deadline when that comes first', async () => {
    generateContent.mockImplementation((req) =>
      isLocalization(req)
        ? new Promise((_, rej) => req.config.abortSignal.addEventListener('abort', () => rej(req.config.abortSignal.reason)))
        : after(40_000, { text: JSON.stringify(SCORING), usageMetadata: usageMeta(1, 1) }));
    const t0 = Date.now();
    let doneAt = NaN;
    const p = analyzeCV(JD, CV, 'text/plain', 'cv', 'vi', 59_000).finally(() => { doneAt = Date.now(); });
    await vi.advanceTimersByTimeAsync(70_000);
    await p;
    expect(doneAt - t0).toBe(59_000); // 40s scoring + 19s left (< 20s cap)
  });
});

describe('Stage 3.13C canonical probability authority', () => {
  it('discards model-authored probability/explanation and derives from matchScore', async () => {
    mockGemini();
    const { result } = await analyzeCV(JD, CV, 'text/plain', 'cv', 'en', 59_000);
    // SCORING carries matchScore 80 plus conflicting model probabilities.
    expect(result).toMatchObject({
      matchScore: 80,
      passProbability: 'High',
      successProbability: 'High',
      probabilityVersion: CANONICAL_PROBABILITY_VERSION,
      passExplanation: '',
    });
  });

  it('the same matchScore yields the same probability regardless of model opinion', async () => {
    mockGemini(undefined, { ...SCORING, successProbability: 'Low', passProbability: 'Low', passExplanation: 'Model says low.' });
    const low = await analyzeCV(JD, CV, 'text/plain', 'cv', 'en', 59_000);
    mockGemini(undefined, { ...SCORING, successProbability: 'High', passProbability: 'High', passExplanation: 'Model says high.' });
    const high = await analyzeCV(JD, CV, 'text/plain', 'cv', 'en', 59_000);
    expect(low.result.passProbability).toBe('High');
    expect(high.result.passProbability).toBe('High');
    expect(low.result.successProbability).toBe(low.result.passProbability);
    expect(high.result.successProbability).toBe(high.result.passProbability);
    expect(low.result.passExplanation).toBe('');
    expect(high.result.passExplanation).toBe('');
  });

  it('the model contract no longer asks for probability fields', async () => {
    mockGemini();
    await analyzeCV(JD, CV, 'text/plain', 'cv', 'en', 59_000);
    const req = scoringRequests()[0] as unknown as { contents: { parts: { text: string }[] }[]; config: { responseSchema: unknown } };
    const prompt = req.contents[0].parts[0].text;
    const schema = JSON.stringify(req.config.responseSchema);
    for (const field of ['successProbability', 'passProbability', 'passExplanation']) {
      expect(prompt).not.toContain(field);
      expect(schema).not.toContain(field);
    }
  });

  it('history persists probability_version and reads it back; legacy rows stay NULL', async () => {
    const canonical = {
      ...(SCORING as unknown as AnalysisResult),
      id: 'canonical-1',
      timestamp: 1,
      userId: 'user-1',
      passProbability: 'High',
      successProbability: 'High',
      probabilityVersion: CANONICAL_PROBABILITY_VERSION,
      passExplanation: '',
    };
    await saveToHistory(canonical, 'pro');
    const [[saved]] = historyUpserts as Record<string, unknown>[][];
    expect(saved).toMatchObject({ probability_version: CANONICAL_PROBABILITY_VERSION });

    historyRows = [
      { analysis_id: 'legacy', timestamp: '2026-10-01T00:00:00Z', match_score: 70, language: 'vi', success_probability: 'High', pass_probability: 'Medium' },
      { analysis_id: 'canonical-1', timestamp: '2026-10-30T00:00:00Z', match_score: 80, language: 'en', probability_version: CANONICAL_PROBABILITY_VERSION, pass_probability: 'High', success_probability: 'High' },
    ];
    const [legacyRow, canonicalRow] = await getUserHistory('user-1', 'pro');
    expect(legacyRow).not.toHaveProperty('probabilityVersion');
    expect(legacyRow).toMatchObject({ successProbability: 'High', passProbability: 'Medium' });
    expect(canonicalRow).toMatchObject({
      probabilityVersion: CANONICAL_PROBABILITY_VERSION,
      passProbability: 'High',
      successProbability: 'High',
    });
  });
});

describe('history compatibility', () => {
  it('legacy row (no score_version) maps as before; canonical row carries scoreVersion + presentationLanguage', async () => {
    historyRows = [
      { analysis_id: 'old', timestamp: '2026-10-01T00:00:00Z', match_score: 70, language: 'vi' },
      { analysis_id: 'new', timestamp: '2026-10-30T00:00:00Z', match_score: 80, language: 'en', score_version: SCORE_VERSION },
    ];
    const [legacy, canonical] = await getUserHistory('user-1', 'pro');
    expect(legacy).toMatchObject({ id: 'old', matchScore: 70, language: 'vi' });
    expect(legacy).not.toHaveProperty('scoreVersion');
    expect(legacy).not.toHaveProperty('presentationLanguage');
    expect(canonical).toMatchObject({ id: 'new', scoreVersion: SCORE_VERSION, presentationLanguage: 'en', language: 'en' });
  });

  it('saves score_version and the delivered presentation language; legacy results write no score_version', async () => {
    mockGemini(() => ({ text: 'bad', usageMetadata: usageMeta(1, 1) })); // VI requested, fell back to EN
    const { result } = await analyzeCV(JD, CV, 'text/plain', 'cv', 'vi', 59_000);
    await saveToHistory({ ...result, userId: 'user-1' }, 'pro');
    await saveToHistory({ ...(SCORING as unknown as AnalysisResult), id: 'l', timestamp: 0, userId: 'user-1', language: 'vi' }, 'pro');
    const [[saved], [legacy]] = historyUpserts as Record<string, unknown>[][];
    expect(saved).toMatchObject({
      score_version: SCORE_VERSION,
      probability_version: CANONICAL_PROBABILITY_VERSION,
      language: 'en',
      match_score: 80,
    });
    expect(legacy).not.toHaveProperty('score_version');
    expect(legacy).not.toHaveProperty('probability_version');
    expect(legacy).toMatchObject({ language: 'vi' });
  });
});
