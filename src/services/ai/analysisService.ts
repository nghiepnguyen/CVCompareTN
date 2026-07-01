import type { AnalysisResult } from './types.js';

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

export async function analyzeCV(
  jd: string,
  cvData: string,
  cvMimeType: string,
  cvName?: string,
  language: 'vi' | 'en' = 'vi',
  recaptchaToken?: string,
  authToken?: string
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
    body: JSON.stringify({ jd, cvData, cvMimeType, cvName, language, recaptchaToken }),
    // 55s client-side timeout: gives server 45s for AI + ~10s for auth/quota/network
    signal: AbortSignal.timeout(55_000),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error || `Phân tích thất bại (HTTP ${res.status})`);
  }

  return res.json() as Promise<AnalysisResult>;
}
