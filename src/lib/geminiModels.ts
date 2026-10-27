// Gemini models in use and their paid-tier pricing (USD per 1M tokens,
// prompts <=200k — ai.google.dev/gemini-api/docs/pricing). Shared by the
// server routing (_server-lib/ai/geminiClient.ts) and the admin cost report.
// Keep dependency-free: _server-lib imports it with a `.js` suffix, and an
// extensionless import here would break Node ESM on Vercel.
export const GEMINI_PRICING = {
  'gemini-3-flash-preview': { inputPer1M: 0.5, outputPer1M: 3.0 },
  'gemini-3.5-flash-lite': { inputPer1M: 0.3, outputPer1M: 2.5 },
} as const;

export type GeminiModel = keyof typeof GEMINI_PRICING;

// analysis_log rows written before the `model` column existed. Every row with
// token data (tracking began 2026-07-04) ran on gemini-3-flash-preview, which
// was the only model in production from 2026-07-02 until per-workload routing.
export const LEGACY_LOG_MODEL: GeminiModel = 'gemini-3-flash-preview';

export function isGeminiModel(model: string): model is GeminiModel {
  return Object.prototype.hasOwnProperty.call(GEMINI_PRICING, model);
}
