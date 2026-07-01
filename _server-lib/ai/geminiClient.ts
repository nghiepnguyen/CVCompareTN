import { GoogleGenAI } from '@google/genai';

export const GEMINI_MODEL = 'gemini-3.5-flash';

export function getGeminiClient(): GoogleGenAI {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error('GEMINI_API_KEY is not configured on this server.');
  return new GoogleGenAI({
    apiKey: key,
    httpOptions: { timeout: 45_000 },
  });
}
