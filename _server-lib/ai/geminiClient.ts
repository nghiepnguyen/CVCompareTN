import { GoogleGenAI } from '@google/genai';

export const GEMINI_MODEL = 'gemini-3-flash-preview';

// Gemini 3 defaults to dynamic (unbounded) thinking, which risks blowing the
// 50s wall-clock deadline shared with Vercel's 60s maxDuration. Cap it low
// instead of disabling outright, to keep some reasoning quality.
export const GEMINI_THINKING_BUDGET = 1024;

export function getGeminiClient(): GoogleGenAI {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error('GEMINI_API_KEY is not configured on this server.');
  // No SDK-level timeout — our Promise.race in analysisService.ts is the sole
  // timeout controller, ensuring DEADLINE_EXCEEDED never reaches the client.
  return new GoogleGenAI({
    apiKey: key,
  });
}

export type TokenUsage = { inputTokens: number; outputTokens: number };

// Output tokens include thoughtsTokenCount — this model runs with a thinking
// budget (see GEMINI_THINKING_BUDGET) and Google bills thinking tokens as output.
export function extractTokenUsage(usageMetadata?: {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
}): TokenUsage {
  return {
    inputTokens: usageMetadata?.promptTokenCount ?? 0,
    outputTokens: (usageMetadata?.candidatesTokenCount ?? 0) + (usageMetadata?.thoughtsTokenCount ?? 0),
  };
}
