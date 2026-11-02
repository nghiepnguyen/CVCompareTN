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

export type CoverLetterResponse = {
  content: string;
  language: 'vi' | 'en';
  fidelityFallback: boolean;
  // JD-verified names the letter was validated with; sent back for review.
  employerName: string;
  roleTitle: string;
};

/** Thrown with the HTTP status so the UI can pick a translated message. */
export class CoverLetterRequestError extends Error {
  constructor(readonly status: number) {
    super(`Cover letter failed (HTTP ${status})`);
  }
}

/** P1A: POST /api/rewrite-cv action=cover_letter. Never touches the analysis result. */
export async function generateCoverLetter(
  jd: string,
  parsedCV: ParsedCV,
  language: 'vi' | 'en',
  authToken?: string
): Promise<CoverLetterResponse> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  const res = await fetch('/api/rewrite-cv', {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'cover_letter', jd, parsedCV, language }),
    // Same 65s server deadline as rewrite.
    signal: AbortSignal.timeout(75_000),
  });
  if (!res.ok) throw new CoverLetterRequestError(res.status);
  const data = (await res.json()) as { content?: string; language?: 'vi' | 'en'; fidelityFallback?: boolean; employerName?: string; roleTitle?: string };
  return {
    content: data.content || '',
    language: data.language === 'en' ? 'en' : 'vi',
    fidelityFallback: data.fidelityFallback === true,
    employerName: data.employerName || '',
    roleTitle: data.roleTitle || '',
  };
}

export type ApplicationReviewFinding = {
  category: 'unsupported_claim' | 'numeric_claim' | 'consistency' | 'requirement_gap' | 'relevance' | 'tone';
  severity: 'high' | 'medium' | 'low';
  message: string;
  source: 'cover_letter' | 'cv';
};
export type ApplicationReviewResponse = {
  verdict: 'ready' | 'review';
  findings: ApplicationReviewFinding[];
  revisedCoverLetter?: string;
};

/**
 * P1B: POST /api/rewrite-cv action=application_review. Advisory only; the
 * requirement list is context for omissions, never sent back or changed.
 * Errors reuse CoverLetterRequestError (status only).
 */
export async function reviewApplication(
  input: {
    jd: string;
    parsedCV: ParsedCV;
    coverLetter: string;
    language: 'vi' | 'en';
    employerName: string;
    roleTitle: string;
    requirements: { requirement: string; status: string; priority?: string; cvEvidence?: string }[];
  },
  authToken?: string
): Promise<ApplicationReviewResponse> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  const res = await fetch('/api/rewrite-cv', {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'application_review', ...input }),
    signal: AbortSignal.timeout(75_000),
  });
  if (!res.ok) throw new CoverLetterRequestError(res.status);
  const data = (await res.json()) as Partial<ApplicationReviewResponse>;
  return {
    verdict: data.verdict === 'ready' ? 'ready' : 'review',
    findings: Array.isArray(data.findings) ? data.findings : [],
    ...(data.revisedCoverLetter && { revisedCoverLetter: data.revisedCoverLetter }),
  };
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
