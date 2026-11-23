import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GenerateContentResponse } from '@google/genai';

// A2.2 response-side parity: production analyzeCV (real code, Gemini mocked
// locally) and the runner's classifyResponse must reach the SAME outcome on the
// SAME raw provider response — identical integer score, or identical invalid
// reason. No network: generateContent is a local mock.
const generateContent = vi.fn();
vi.mock('../../../_server-lib/ai/geminiClient.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../_server-lib/ai/geminiClient')>()),
  getGeminiClient: () => ({ models: { generateContent } }),
}));

import { analyzeCV, InvalidAiOutputError } from '../../../_server-lib/ai/analysisService';
import { classifyResponse } from '../a2Runner';
import { PARITY_CASES as CASES } from './parityCases';

async function production(raw: unknown) {
  generateContent.mockResolvedValue(Object.assign(new GenerateContentResponse(), raw));
  try {
    const { result } = await analyzeCV('JD: SQL required.', 'CV: SQL reports (synthetic).', 'text/plain', 'cv', 'en');
    return { valid: true, matchScore: result.matchScore };
  } catch (e) {
    if (e instanceof InvalidAiOutputError) return { valid: false, reason: e.reason };
    throw e;
  }
}

describe('A2.2 response parity: classifyResponse ≡ production analyzeCV (offline)', () => {
  beforeEach(() => generateContent.mockReset());

  it.each(CASES)('%s', async (_label, raw) => {
    expect(classifyResponse(JSON.parse(JSON.stringify(raw)))).toEqual(await production(raw));
  });

  it('covers both outcomes and every production invalid reason', async () => {
    const outs = CASES.map(([, raw]) => classifyResponse(raw));
    const reasons = new Set(outs.flatMap((o) => ('reason' in o ? [o.reason] : [])));
    expect(outs.some((o) => o.valid)).toBe(true);
    expect([...reasons].sort()).toEqual(['blocked', 'incomplete_response', 'malformed_json', 'missing', 'not_a_number', 'out_of_range']);
  });

  it('non-object input never throws (fail closed to invalid)', () => {
    for (const j of [null, undefined, 'x', 42, []]) expect(classifyResponse(j).valid).toBe(false);
  });
});
