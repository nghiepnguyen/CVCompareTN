import type { AnalysisResult, ParsedCV } from './types.js';

/**
 * Non-2xx from /api/analyze, /api/parse-cv or the Full CV rewrite. Keeps the
 * HTTP status and the server's `retryable` flag (M2-A P2-5) so the UI can pick
 * a localized message; `message` stays the server text for compatibility.
 */
export class AiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
    readonly body: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AiRequestError';
  }
}

async function aiRequestError(res: Response, fallback: string): Promise<AiRequestError> {
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const message = typeof body.error === 'string' && body.error ? body.error : fallback;
  return new AiRequestError(message, res.status, body.retryable === true, body);
}

type AiErrorStrings = {
  aiErrorAuthRequired: string;
  aiErrorAccountLocked: string;
  aiErrorInputTooLarge: string;
  aiErrorRateLimited: string;
  aiErrorBusy: string;
  aiErrorTimeout: string;
  aiErrorDuplicateRequest: string;
  aiErrorQuotaUnavailable: string;
  monthlyUsageLimitExceeded: string;
};

/** Localized text for a failed AI request; other errors keep their message. */
export function localizeAiError(err: unknown, t: AiErrorStrings): string {
  if (!(err instanceof AiRequestError)) return err instanceof Error ? err.message : String(err);
  switch (err.status) {
    case 401: return t.aiErrorAuthRequired;
    case 403: return t.aiErrorAccountLocked;
    case 413: return t.aiErrorInputTooLarge.replace('{max}', String(err.body.maxChars ?? ''));
    case 409: return t.aiErrorDuplicateRequest;
    case 429: return typeof err.body.limit === 'number' ? t.monthlyUsageLimitExceeded : t.aiErrorRateLimited;
    case 503:
      if (err.body.code === 'quota_unavailable' || err.body.code === 'quota_settlement_unavailable') return t.aiErrorQuotaUnavailable;
      return err.retryable ? t.aiErrorBusy : err.message;
    case 504: return t.aiErrorTimeout;
    default: return err.message;
  }
}

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

  if (!res.ok) throw await aiRequestError(res, `Rewrite failed (HTTP ${res.status})`);

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

/** P2C: POST /api/rewrite-cv action=follow_up. Server reads the saved snapshot; only the id (and an explicit language) is sent. */
export async function generateFollowUpDraft(
  input: { applicationId: string; language?: 'vi' | 'en' },
  authToken?: string
): Promise<{ content: string; language: 'vi' | 'en'; fidelityFallback: boolean }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  const res = await fetch('/api/rewrite-cv', {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'follow_up', ...input }),
    signal: AbortSignal.timeout(75_000),
  });
  if (!res.ok) throw new CoverLetterRequestError(res.status);
  const data = (await res.json()) as { content?: string; language?: 'vi' | 'en'; fidelityFallback?: boolean };
  return { content: data.content || '', language: data.language === 'en' ? 'en' : 'vi', fidelityFallback: data.fidelityFallback === true };
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

  if (!res.ok) throw await aiRequestError(res, `CV parsing failed (HTTP ${res.status})`);

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
  cvDataStoragePath?: string,
  idempotencyKey: string = crypto.randomUUID()
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
      // M2-C2: one key per CV per run; the server meters each key once.
      // The recruiter flow passes its claim attempt id (M2-D3).
      idempotencyKey,
    }),
    // Server answers within its 65s request deadline (_server-lib/deadline.ts);
    // 75s here leaves room for the response to arrive before we give up client-side.
    signal: AbortSignal.timeout(75_000),
  });

  if (!res.ok) throw await aiRequestError(res, `Phân tích thất bại (HTTP ${res.status})`);

  return res.json() as Promise<AnalysisResult>;
}
