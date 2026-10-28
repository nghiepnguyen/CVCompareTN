import type { AnalysisResult, ParsedCV } from './types.js';

export async function rewriteFullCV(
  jd: string,
  cvData: string,
  cvMimeType: string,
  language: 'vi' | 'en' = 'vi',
  authToken?: string,
  cvDataStoragePath?: string
): Promise<{ fullRewrittenCV: string; fidelityFallback: boolean }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  const res = await fetch('/api/rewrite-cv', {
    method: 'POST',
    headers,
    body: JSON.stringify({ jd, cvData, cvMimeType, language, cvDataStoragePath }),
    // Server answers within its 65s request deadline (_server-lib/deadline.ts);
    // 75s here leaves room for the response to arrive.
    signal: AbortSignal.timeout(75_000),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || `Rewrite failed (HTTP ${res.status})`);
  }

  const data = (await res.json()) as { fullRewrittenCV: string; fidelityFallback?: boolean };
  return { fullRewrittenCV: data.fullRewrittenCV || '', fidelityFallback: data.fidelityFallback === true };
}

export async function parseCV(
  cvData: string,
  cvMimeType: string,
  language: 'vi' | 'en' = 'vi',
  authToken?: string,
  cvPdfInlineData?: string,
  cvPdfStoragePath?: string,
  cvDataStoragePath?: string
): Promise<ParsedCV | undefined> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  const res = await fetch('/api/parse-cv', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      cvData, cvMimeType, language, cvPdfInlineData, cvPdfStoragePath, cvDataStoragePath,
    }),
    // Server answers within its 65s request deadline (_server-lib/deadline.ts);
    // 75s here leaves room for the response to arrive before we give up client-side.
    signal: AbortSignal.timeout(75_000),
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
  authToken?: string,
  cvPdfInlineData?: string,
  batchTotal?: number,
  cvPdfStoragePath?: string,
  cvDataStoragePath?: string
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
    body: JSON.stringify({
      jd, cvData, cvMimeType, cvName, language, cvPdfInlineData, batchTotal,
      cvPdfStoragePath, cvDataStoragePath,
    }),
    // Server answers within its 65s request deadline (_server-lib/deadline.ts);
    // 75s here leaves room for the response to arrive before we give up client-side.
    signal: AbortSignal.timeout(75_000),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error || `Phân tích thất bại (HTTP ${res.status})`);
  }

  return res.json() as Promise<AnalysisResult>;
}
