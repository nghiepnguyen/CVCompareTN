import { GoogleGenAI, ThinkingLevel, type ThinkingConfig } from '@google/genai';
import type { GeminiModel } from '../../src/lib/geminiModels.js';

// Per-workload routing. parse_cv is plain extraction, where flash-lite matched
// preview quality at ~1.5x lower latency (benchmark 2026-10-28,
// scripts/benchmark-gemini-parse-rewrite.ts). analyze/rewrite stay on preview.
export const GEMINI_ANALYZE_MODEL: GeminiModel = 'gemini-3-flash-preview';
export const GEMINI_PARSE_MODEL: GeminiModel = 'gemini-3.5-flash-lite';
export const GEMINI_REWRITE_MODEL: GeminiModel = 'gemini-3-flash-preview';

// Gemini 3 preview defaults to dynamic (unbounded) thinking, which risks
// blowing the shared request deadline (_server-lib/deadline.ts) —
// cap it low instead of disabling outright, to keep some reasoning quality.
// Newer models only document thinkingLevel, so each model gets its own config.
const THINKING_CONFIG: Record<GeminiModel, ThinkingConfig> = {
  'gemini-3-flash-preview': { thinkingBudget: 1024 },
  'gemini-3.5-flash-lite': { thinkingLevel: ThinkingLevel.LOW },
};

export function thinkingConfigFor(model: GeminiModel): ThinkingConfig {
  return THINKING_CONFIG[model];
}

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

// What each AI call reports for analysis_log: tokens plus the model that ran
// and the time spent waiting on the Gemini request itself.
export type AiCallUsage = TokenUsage & { model: GeminiModel; latencyMs: number };

// Output tokens include thoughtsTokenCount — models run with thinking enabled
// (see THINKING_CONFIG) and Google bills thinking tokens as output.
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
