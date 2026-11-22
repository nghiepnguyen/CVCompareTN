import { afterEach, describe, expect, it, vi } from 'vitest';

const CV = 'Nguyen Van Sec2 leak.person@example.com Secret Corp';
const PROSE = /Nguyen|leak\.person|Secret Corp/;
// Mocked client only: no Gemini call.
const gemini = vi.hoisted(() => ({ generateContent: vi.fn() }));
vi.mock('../ai/geminiClient.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../ai/geminiClient.js')>()),
  getGeminiClient: () => ({ models: { generateContent: gemini.generateContent } }),
}));

import { classifyAiFailure } from '../deadline.js';
import { analyzeCV } from '../ai/analysisService.js';
import { generateParsedCV } from '../ai/parseCvService.js';
import { parseRewriteText } from '../ai/rewriteService.js';

async function errorFrom(fn: () => unknown): Promise<unknown> {
  try {
    await fn();
  } catch (err) {
    return err;
  }
  throw new Error('expected a throw');
}

afterEach(() => vi.restoreAllMocks());

describe('malformed AI JSON errors carry no model output (SEC-2)', () => {
  it.each([
    ['rewrite', () => parseRewriteText(`note {"fullRewrittenCV": "${CV}" broken}`)],
    ['parse-cv', () => generateParsedCV(CV, 'text/plain', 'vi', 30_000)],
  ])('%s: categorical SyntaxError, same failure category as before', async (_name, fn) => {
    gemini.generateContent.mockResolvedValue({ text: `note {"name": "${CV}" broken}`, usageMetadata: {} });
    const err = await errorFrom(fn);
    expect(err).toBeInstanceOf(SyntaxError);
    expect((err as Error).message).toBe('Malformed JSON in Gemini response');
    expect(JSON.stringify({ message: (err as Error).message, stack: (err as Error).stack })).not.toMatch(PROSE);
    expect(classifyAiFailure(err)).toBe('gemini_error');
  });
});

describe('analyze: unknown provider error text never leaves analyzeCV (SEC-2)', () => {
  it.each([
    ['Error without status', () => new Error(`upstream echoed the prompt: ${CV}`)],
    ['plain object', () => ({ message: `upstream echoed the prompt: ${CV}` })],
  ])('%s: fixed message, gemini_error, nothing logged with provider text', async (_name, make) => {
    gemini.generateContent.mockRejectedValue(make());
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = await errorFrom(() => analyzeCV('JD text', CV, 'text/plain', 'cv.txt', 'vi', 30_000));
    expect((err as Error).message).toBe('Could not perform analysis with Gemini. Please try again later.');
    expect(JSON.stringify({ message: (err as Error).message, stack: (err as Error).stack })).not.toMatch(PROSE);
    expect(classifyAiFailure(err)).toBe('gemini_error');
    expect(logged).toHaveBeenCalled();
    expect(JSON.stringify(logged.mock.calls.map((args) => args.map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : a))))).not.toMatch(PROSE);
  });

  it('still maps provider status and timeouts to their categories', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    gemini.generateContent.mockRejectedValue(Object.assign(new Error(`quota ${CV}`), { status: 429 }));
    expect(classifyAiFailure(await errorFrom(() => analyzeCV('JD', CV, 'text/plain', 'cv.txt', 'vi', 30_000)))).toBe('gemini_rate_limited');
    gemini.generateContent.mockRejectedValue(new Error(`DEADLINE_EXCEEDED ${CV}`));
    const timeout = await errorFrom(() => analyzeCV('JD', CV, 'text/plain', 'cv.txt', 'vi', 30_000));
    expect(classifyAiFailure(timeout)).toBe('gemini_timeout');
    expect((timeout as Error).message).not.toMatch(PROSE);
  });
});
