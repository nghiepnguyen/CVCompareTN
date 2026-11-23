import { describe, it, expect, vi, afterEach } from 'vitest';
import { analyzeCV, InvalidAiOutputError } from '../../../_server-lib/ai/analysisService';
import { classifyResponse } from '../a2Runner';
import { PARITY_CASES } from './parityCases';

// A2.2 fetch-level parity: the live runner sees raw REST JSON from plain fetch,
// while production sees what the real @google/genai SDK builds from that JSON.
// Here production analyzeCV runs through the REAL SDK (fetch stubbed locally,
// fake key) and must agree with classifyResponse on the same raw body.
describe('A2.2 response parity through the real SDK REST conversion (offline)', () => {
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.GEMINI_API_KEY; });

  async function production(raw: unknown) {
    process.env.GEMINI_API_KEY = 'fake-key-for-offline-capture';
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify(raw), { status: 200, headers: { 'content-type': 'application/json' } }));
    try {
      const { result } = await analyzeCV('JD: SQL required.', 'CV: SQL reports (synthetic).', 'text/plain', 'cv', 'en');
      return { valid: true, matchScore: result.matchScore };
    } catch (e) {
      if (e instanceof InvalidAiOutputError) return { valid: false, reason: e.reason };
      throw e;
    }
  }

  it.each(PARITY_CASES)('%s', async (_label, raw) => {
    expect(classifyResponse(JSON.parse(JSON.stringify(raw)))).toEqual(await production(raw));
  });
});
