import { describe, it, expect, vi, beforeEach } from 'vitest';

// Characterizes production analyzeCV post-model path at 5776735 (no change to it).
// Gemini is a local mock; under the offline config every real network path throws.
const generateContent = vi.fn();
vi.mock('../../../_server-lib/ai/geminiClient.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../_server-lib/ai/geminiClient')>()),
  getGeminiClient: () => ({ models: { generateContent } }),
}));

import { analyzeCV } from '../../../_server-lib/ai/analysisService';

const CV = 'Frontend Developer 01/2021 – Present. Built React SPA in TypeScript. Implemented Figma designs.';
const JD = 'Frontend Developer. Requirements: React, TypeScript, Figma. Nice to have: Next.js.';

const raw = (over: Record<string, unknown> = {}) => ({
  jobTitle: 'Frontend Developer',
  matchScore: 88,
  categoryScores: { skills: 85, softSkills: 80, hardSkills: 80, technicalSkills: 85, experience: 90, tools: 85, languageSkills: 0, education: 70 },
  matchingPoints: [{ category: 'Technical Skills', content: 'React SPA' }],
  missingGaps: [{ category: 'Tools', content: 'The CV does not show Next.js', impact: 'Low' }],
  mainFactor: 'Strong React/TypeScript evidence',
  atsKeywords: ['React', 'TypeScript', 'Figma'],
  rewriteSuggestions: [],
  detailedComparison: {
    skills: [{ requirement: 'TypeScript', status: 'matched', cvEvidence: 'Built React SPA in TypeScript', priority: 'required' }],
    tools: [
      { requirement: 'React', status: 'matched', cvEvidence: 'Built React SPA', priority: 'required' },
      { requirement: 'Next.js', status: 'missing', priority: 'nice-to-have' },
    ],
    experience: [], education: [], keywords: [],
  },
  formatAssessment: { analysisAvailable: false, overallAtsParseabilityScore: 0, hasMultiColumnLayout: false, hasTablesOrGraphics: false, hasStandardSectionHeadings: false, contactInfoInHeaderFooter: false, fontConsistencyIssue: false, dateFormatConsistent: false, isLikelyScannedImage: false, formatIssues: [] },
  ...over,
});
const reply = (obj: unknown) => ({ text: JSON.stringify(obj), usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 } });
const strip = (r: Record<string, unknown>) => { const { id: _i, timestamp: _t, ...rest } = r; return rest; };

describe('current pipeline (characterization, offline)', () => {
  beforeEach(() => generateContent.mockReset());

  it('same raw model response ×20 → 1 distinct canonical result (post-model determinism)', async () => {
    generateContent.mockImplementation(async () => reply(raw()));
    const outs = new Set<string>();
    for (let i = 0; i < 20; i++) outs.add(JSON.stringify(strip((await analyzeCV(JD, CV, 'text/plain', 'cv', 'en')).result as unknown as Record<string, unknown>)));
    expect(outs.size).toBe(1);
    expect(generateContent).toHaveBeenCalledTimes(20);
  });

  it('matchScore is the raw model number: categories/rows never feed it', async () => {
    generateContent.mockImplementation(async () => reply(raw({ matchScore: 41 })));
    const { result } = await analyzeCV(JD, CV, 'text/plain', 'cv', 'en');
    expect(result.matchScore).toBe(41); // all required rows matched, yet 41 stands
    expect(result.passProbability).toBe('Low');
  });

  // A2.2: production is canonical-en-v2 (M3-B R0) — validate, then round half-up once.
  it.each([
    [82.5, 83],
    [59.5, 60],
    [0, 0],
    [100, 100],
  ])('model matchScore %j → stored integer %j (canonical-en-v2)', async (input, expected) => {
    generateContent.mockImplementation(async () => reply(raw({ matchScore: input })));
    const { result } = await analyzeCV(JD, CV, 'text/plain', 'cv', 'en');
    expect(result.matchScore).toBe(expected);
    expect(result.scoreVersion).toBe('canonical-en-v2');
  });

  it.each([
    [150, 'out_of_range'],
    [-5, 'out_of_range'],
    ['77', 'not_a_number'],
    ['abc', 'not_a_number'],
    [undefined, 'missing'],
    [null, 'missing'],
  ])('model matchScore %j → rejected (%s), never coerced or clamped', async (input, reason) => {
    generateContent.mockImplementation(async () => reply(raw({ matchScore: input })));
    await expect(analyzeCV(JD, CV, 'text/plain', 'cv', 'en')).rejects.toMatchObject({ name: 'InvalidAiOutputError', reason });
  });

  it('an invalid row status is normalized to "missing" (absence), not "unknown"', async () => {
    generateContent.mockImplementation(async () => reply(raw({ detailedComparison: { skills: [{ requirement: 'Go', status: 'unsure', priority: 'required' }], tools: [], experience: [], education: [], keywords: [] } })));
    const { result } = await analyzeCV(JD, CV, 'text/plain', 'cv', 'en');
    expect(result.detailedComparison!.skills[0].status).toBe('missing');
  });

  it('the request carries no temperature/seed/topP (provider defaults)', async () => {
    generateContent.mockImplementation(async () => reply(raw()));
    await analyzeCV(JD, CV, 'text/plain', 'cv', 'en');
    const cfg = generateContent.mock.calls[0][0].config;
    expect(cfg).not.toHaveProperty('temperature');
    expect(cfg).not.toHaveProperty('seed');
    expect(cfg).not.toHaveProperty('topP');
    expect(cfg.thinkingConfig).toEqual({ thinkingBudget: 1024 });
  });

  it('the prompt embeds the current month, so the request changes monthly', async () => {
    generateContent.mockImplementation(async () => reply(raw()));
    await analyzeCV(JD, CV, 'text/plain', 'cv', 'en');
    expect(generateContent.mock.calls[0][0].contents[0].parts[0].text).toMatch(/Current month: \d{2}\/\d{4}/);
  });
});
