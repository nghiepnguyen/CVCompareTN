import { getUserFromBearerToken } from '../payment/supabaseAdmin.js';
import { generateFullRewrite } from '../ai/rewriteService.js';
import { withTimeout } from '../withTimeout.js';
import { logAnalysisAttempt } from '../analysisLog.js';
import { resolveStorageRef } from '../storage/tempFile.js';
import { GEMINI_REWRITE_MODEL } from '../ai/geminiClient.js';
import {
  aiFailureCategory,
  ControlledError,
  createDeadline,
  MIN_GEMINI_BUDGET_MS,
  POST_RESERVE_MS,
  TOTAL_BUDGET_MS,
} from '../deadline.js';

export type HandlerResult = { status: number; body: Record<string, unknown> };

const AUTH_TIMEOUT_MS = 4_000;
const TIMEOUT_MESSAGE = 'CV rewrite is taking too long. Please try again. (Timeout)';

export async function handleRewriteCv(
  authHeader: string | undefined,
  body: unknown
): Promise<HandlerResult> {
  // Same single request deadline as _server-lib/analyze/handler.ts: both
  // rewrite calls (and the retry decision) run against the AI deadline, the
  // log row against what is left of the request.
  const deadline = createDeadline(TOTAL_BUDGET_MS);
  const aiDeadline = deadline.reserve(POST_RESERVE_MS);
  const b = (body ?? {}) as {
    jd?: string;
    cvData?: string;
    cvMimeType?: string;
    language?: string;
    cvDataStoragePath?: string;
  };

  const jd = b.jd?.trim();
  let cvData = b.cvData?.trim();
  const cvMimeType = b.cvMimeType?.trim() || 'text/plain';
  const language: 'vi' | 'en' = b.language === 'en' ? 'en' : 'vi';
  const cvDataStoragePath = b.cvDataStoragePath?.trim() || undefined;

  if (!jd) return { status: 400, body: { error: 'Missing jd' } };
  if (!cvData && !cvDataStoragePath) return { status: 400, body: { error: 'Missing cvData' } };

  const user = await withTimeout(
    getUserFromBearerToken(authHeader),
    Math.min(AUTH_TIMEOUT_MS, deadline.remainingMs()),
    'Auth verification'
  ).catch((err) => {
    console.warn('Auth verification failed:', err.message);
    return null;
  });

  if (!user) {
    return { status: 401, body: { error: 'Authentication required' } };
  }

  // Same path is reused by the client's other calls (analyze/parse-cv) for
  // this CV, so cleanup is the client's job after all of them settle.
  // Failures below get a categorical analysis_log row (no raw error text).
  const logFailure = (category: string, withModel = false) =>
    logAnalysisAttempt(user.id, 'error', 'rewrite', `[${category}]`, withModel ? { model: GEMINI_REWRITE_MODEL } : undefined, undefined, deadline);

  try {
    if (cvDataStoragePath) {
      cvData = await resolveStorageRef(cvDataStoragePath, user.id, aiDeadline.reserve(MIN_GEMINI_BUDGET_MS));
    }
  } catch (err) {
    const category = err instanceof ControlledError ? err.category : 'storage_error';
    await logFailure(category);
    if (category === 'storage_timeout') return { status: 504, body: { error: TIMEOUT_MESSAGE, retryable: true } };
    return {
      status: 400,
      body: { error: err instanceof Error ? err.message : 'Failed to load uploaded file' },
    };
  }

  if (aiDeadline.remainingMs() < MIN_GEMINI_BUDGET_MS) {
    await logFailure('request_budget_exhausted');
    return { status: 504, body: { error: TIMEOUT_MESSAGE, retryable: true } };
  }

  try {
    const { fullRewrittenCV, usage, fidelityFallback, guardMetrics } = await generateFullRewrite(
      jd,
      cvData as string,
      cvMimeType,
      language,
      aiDeadline.remainingMs()
    );
    await logAnalysisAttempt(user.id, 'success', 'rewrite', undefined, usage, { v: 1, fullCv: guardMetrics }, deadline);
    // fidelityFallback: no rewrite passed the factual check; the client shows
    // a retry message instead of a CV.
    return { status: 200, body: fidelityFallback ? { fullRewrittenCV: '', fidelityFallback } : { fullRewrittenCV } };
  } catch (err) {
    console.error('CV rewrite failed:', err);
    const category = aiFailureCategory(err);
    const isTimeout = category !== 'gemini_error';
    await logFailure(category, category !== 'request_budget_exhausted'); // model only if Gemini ran
    const message = category === 'request_budget_exhausted' ? TIMEOUT_MESSAGE : err instanceof Error ? err.message : 'Server error';
    return { status: isTimeout ? 504 : 500, body: { error: message, retryable: isTimeout } };
  }
}
