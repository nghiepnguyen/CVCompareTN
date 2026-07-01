import { GoogleGenAI } from '@google/genai';

export const GEMINI_MODEL = 'gemini-3.5-flash';

export function getGeminiClient(): GoogleGenAI {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error('GEMINI_API_KEY is not configured on this server.');
  // No SDK-level timeout — our Promise.race in analysisService.ts is the sole
  // timeout controller, ensuring DEADLINE_EXCEEDED never reaches the client.
  return new GoogleGenAI({
    apiKey: key,
  });
}
