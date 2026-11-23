import { describe, it, expect, vi, afterEach } from 'vitest';
import { analyzeCV } from '../../../_server-lib/ai/analysisService';
import { buildRequest, configHash } from '../a2Runner';
import { A2_FIXTURES } from '../a2Fixtures';

// The benchmark must send byte-for-byte what production analyzeCV sends via the
// real @google/genai SDK. fetch is intercepted locally (canned reply); nothing
// leaves the process (and the offline guard blocks any other path).
describe('A2 request parity with production analyzeCV (offline)', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); delete process.env.GEMINI_API_KEY; });

  it.each(A2_FIXTURES.map((f) => [f.id, f] as const))('%s: runner body/url == SDK body/url', async (_id, f) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-22T03:00:00Z'));
    process.env.GEMINI_API_KEY = 'fake-key-for-offline-capture';
    const captured: { url: string; body: unknown }[] = [];
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      captured.push({ url: String(input instanceof Request ? input.url : input), body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"matchScore":70}' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 } }), { status: 200, headers: { 'content-type': 'application/json' } });
    });

    await analyzeCV(f.jd, f.cv, 'text/plain', 'cv', 'en');
    expect(captured).toHaveLength(1);
    const mine = buildRequest(f, '11/2026');
    expect(captured[0].url).toBe(mine.url);
    expect(captured[0].body).toEqual(mine.body);
  });

  it('config hash is stable for a pinned month and changes when the month changes', () => {
    expect(configHash('11/2026')).toBe(configHash('11/2026'));
    expect(configHash('12/2026')).not.toBe(configHash('11/2026'));
  });
});
