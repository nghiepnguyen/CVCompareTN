import type { AnalysisResult, ParsedCV } from './types.js';

export async function rewriteFullCV(
  jd: string,
  cvData: string,
  cvMimeType: string,
  language: 'vi' | 'en' = 'vi',
  recaptchaToken?: string,
  authToken?: string
): Promise<string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  const res = await fetch('/api/rewrite-cv', {
    method: 'POST',
    headers,
    body: JSON.stringify({ jd, cvData, cvMimeType, language, recaptchaToken }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || `Rewrite failed (HTTP ${res.status})`);
  }

  const data = (await res.json()) as { fullRewrittenCV: string };
  return data.fullRewrittenCV || '';
}

export async function parseCV(
  jd: string,
  cvData: string,
  cvMimeType: string,
  language: 'vi' | 'en' = 'vi',
  recaptchaToken?: string,
  authToken?: string,
  cvPdfInlineData?: string
): Promise<ParsedCV | undefined> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  const res = await fetch('/api/parse-cv', {
    method: 'POST',
    headers,
    body: JSON.stringify({ jd, cvData, cvMimeType, language, recaptchaToken, cvPdfInlineData }),
    // Server enforces a 50s wall-clock budget (see api/parse-cv.ts); 55s here
    // leaves room for the response to arrive before we give up client-side.
    signal: AbortSignal.timeout(55_000),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || `CV parsing failed (HTTP ${res.status})`);
  }

  const data = (await res.json()) as { parsedCV?: ParsedCV };
  return data.parsedCV;
}

export async function analyzeCV(
  jd: string,
  cvData: string,
  cvMimeType: string,
  cvName?: string,
  language: 'vi' | 'en' = 'vi',
  recaptchaToken?: string,
  authToken?: string,
  cvPdfInlineData?: string
): Promise<AnalysisResult> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers,
    body: JSON.stringify({ jd, cvData, cvMimeType, cvName, language, recaptchaToken, cvPdfInlineData }),
    // Server enforces a 50s wall-clock budget (see _server-lib/analyze/handler.ts);
    // 55s here leaves room for the response to arrive before we give up client-side.
    signal: AbortSignal.timeout(55_000),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error || `Phân tích thất bại (HTTP ${res.status})`);
  }

  return res.json() as Promise<AnalysisResult>;
}
