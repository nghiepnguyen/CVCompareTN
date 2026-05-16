import { GoogleGenAI } from "@google/genai";

let GEMINI_API_KEY = (import.meta.env.VITE_GEMINI_API_KEY as string) || (import.meta.env.GEMINI_API_KEY as string) || '';

export async function ensureApiKey() {
  return GEMINI_API_KEY;
}

export async function getGeminiClient() {
  const apiKey = await ensureApiKey();
  if (!apiKey) {
    throw new Error("Thiếu API Key Gemini. Vui lòng thêm VITE_GEMINI_API_KEY vào .env.local.");
  }
  return new GoogleGenAI({ apiKey });
}

export const GEMINI_MODEL = "gemini-3-flash-preview";
