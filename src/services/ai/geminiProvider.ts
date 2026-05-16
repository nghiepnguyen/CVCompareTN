import { GoogleGenAI } from "@google/genai";

let geminiApiKey =
  (import.meta.env.VITE_GEMINI_API_KEY as string)?.trim() ||
  (import.meta.env.GEMINI_API_KEY as string)?.trim() ||
  "";

let configFetchPromise: Promise<string> | null = null;

async function loadKeyFromConfig(): Promise<string> {
  if (configFetchPromise) return configFetchPromise;

  configFetchPromise = (async () => {
    try {
      const res = await fetch("/api/config");
      if (!res.ok) return "";
      const data = (await res.json()) as Record<string, string | undefined>;
      return (data.GEMINI_API_KEY || data.VITE_GEMINI_API_KEY || "").trim();
    } catch (err) {
      console.error("[Gemini] Không tải được /api/config:", err);
      return "";
    }
  })();

  return configFetchPromise;
}

export async function ensureApiKey(): Promise<string> {
  if (geminiApiKey) return geminiApiKey;

  const fromConfig = await loadKeyFromConfig();
  if (fromConfig) geminiApiKey = fromConfig;

  return geminiApiKey;
}

export async function getGeminiClient() {
  const apiKey = await ensureApiKey();
  if (!apiKey) {
    throw new Error(
      "Thiếu API Key Gemini. Thêm GEMINI_API_KEY hoặc VITE_GEMINI_API_KEY trên Vercel (project cvcompare) rồi redeploy."
    );
  }
  return new GoogleGenAI({ apiKey });
}

export const GEMINI_MODEL = "gemini-3-flash-preview";
