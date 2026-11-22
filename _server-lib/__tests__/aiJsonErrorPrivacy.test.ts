import { describe, expect, it, vi } from 'vitest';

const CV = 'Nguyen Van Sec2 leak.person@example.com Secret Corp';
// Mocked client only: no Gemini call. The second parse attempt fails on purpose.
vi.mock('../ai/geminiClient.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../ai/geminiClient.js')>()),
  getGeminiClient: () => ({ models: { generateContent: async () => ({ text: `note {"name": "${CV}" broken}`, usageMetadata: {} }) } }),
}));

import { classifyAiFailure } from '../deadline.js';
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

describe('malformed AI JSON errors carry no model output (SEC-2)', () => {
  it.each([
    ['rewrite', () => parseRewriteText(`note {"fullRewrittenCV": "${CV}" broken}`)],
    ['parse-cv', () => generateParsedCV(CV, 'text/plain', 'vi', 30_000)],
  ])('%s: categorical SyntaxError, same failure category as before', async (_name, fn) => {
    const err = await errorFrom(fn);
    expect(err).toBeInstanceOf(SyntaxError);
    expect((err as Error).message).toBe('Malformed JSON in Gemini response');
    expect(JSON.stringify({ message: (err as Error).message, stack: (err as Error).stack })).not.toMatch(/Nguyen|leak\.person|Secret Corp/);
    expect(classifyAiFailure(err)).toBe('gemini_error');
  });
});
