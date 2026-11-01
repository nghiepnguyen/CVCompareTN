import { getUserFromBearerToken } from '../payment/supabaseAdmin.js';
import { generateFullRewrite } from '../ai/rewriteService.js';
import { withTimeout } from '../withTimeout.js';
import { checkAiAccess } from '../accountLock.js';
import { logAnalysisAttempt } from '../analysisLog.js';
import { resolveStorageRef } from '../storage/tempFile.js';
import { stripInvisibleControls } from '../untrustedText.js';
import { GEMINI_REWRITE_MODEL } from '../ai/geminiClient.js';
import { generateCoverLetter, MAX_COVER_LETTER_CV_CHARS, serializeParsedCvForCoverLetter } from '../ai/coverLetterService.js';
import type { CoverLetterGuardMetrics } from '../ai/suggestionGuard.js';
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

type Access = { ok: true; userId: string } | { ok: false; result: HandlerResult };

async function authorize(
  authHeader: string | undefined,
  kind: 'rewrite' | 'cover_letter',
  deadline: ReturnType<typeof createDeadline>
): Promise<Access> {
  const user = await withTimeout(
    getUserFromBearerToken(authHeader),
    Math.min(AUTH_TIMEOUT_MS, deadline.remainingMs()),
    'Auth verification'
  ).catch((err) => {
    console.warn('Auth verification failed:', err.message);
    return null;
  });

  if (!user) {
    return { ok: false, result: { status: 401, body: { error: 'Authentication required' } } };
  }
  const access = await checkAiAccess(user.id, kind, Math.min(AUTH_TIMEOUT_MS, deadline.remainingMs()), deadline.signal(AUTH_TIMEOUT_MS));
  if (access === 'locked') return { ok: false, result: { status: 403, body: { error: 'Account locked' } } };
  if (access === 'unavailable') return { ok: false, result: { status: 503, body: { error: 'Account verification unavailable' } } };
  if (access === 'rate_limited') return { ok: false, result: { status: 429, body: { error: 'Too many requests. Please try again later.' } } };
  return { ok: true, userId: user.id };
}

/**
 * POST /api/rewrite-cv. `action` absent or 'rewrite' = Full CV rewrite
 * (unchanged contract); 'cover_letter' = P1A cover letter; anything else 400.
 */
export async function handleRewriteCv(
  authHeader: string | undefined,
  body: unknown
): Promise<HandlerResult> {
  const action = (body as { action?: unknown } | null)?.action;
  if (action === 'cover_letter') return handleCoverLetter(authHeader, body);
  if (action !== undefined && action !== 'rewrite') return { status: 400, body: { error: 'Invalid action' } };
  return handleFullRewrite(authHeader, body);
}

async function handleFullRewrite(
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

  // Before the empty check so guards, jdTitle and logs all see the same JD.
  const jd = b.jd && stripInvisibleControls(b.jd).trim();
  let cvData = b.cvData?.trim();
  const cvMimeType = b.cvMimeType?.trim() || 'text/plain';
  const language: 'vi' | 'en' = b.language === 'en' ? 'en' : 'vi';
  const cvDataStoragePath = b.cvDataStoragePath?.trim() || undefined;

  if (!jd) return { status: 400, body: { error: 'Missing jd' } };
  if (!cvData && !cvDataStoragePath) return { status: 400, body: { error: 'Missing cvData' } };

  const access = await authorize(authHeader, 'rewrite', deadline);
  if ('result' in access) return access.result;
  const user = { id: access.userId };

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
      body: { error: 'Không thể tải file CV. Vui lòng tải lại file.' },
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
    const message = isTimeout ? TIMEOUT_MESSAGE : 'Không thể viết lại CV. Vui lòng thử lại.';
    return { status: isTimeout ? 504 : 500, body: { error: message, retryable: isTimeout } };
  }
}

const COVER_LETTER_TIMEOUT_MESSAGE = 'Cover letter generation is taking too long. Please try again. (Timeout)';

/**
 * P1A cover letter: CV facts come from the client's ParsedCV (serialized here,
 * the exact text the model sees and the validator checks), the JD is role
 * context only. Same auth/lock/deadline as Full CV, its own hourly cap, and
 * every analysis_log row carries guard_metrics.coverLetter. Nothing is
 * persisted and no analysis field is read or written.
 */
async function handleCoverLetter(authHeader: string | undefined, body: unknown): Promise<HandlerResult> {
  const deadline = createDeadline(TOTAL_BUDGET_MS);
  const aiDeadline = deadline.reserve(POST_RESERVE_MS);
  const b = (body ?? {}) as { jd?: unknown; parsedCV?: unknown; language?: unknown };
  const jd = typeof b.jd === 'string' ? stripInvisibleControls(b.jd).trim() : '';
  const language: 'vi' | 'en' = b.language === 'en' ? 'en' : 'vi';
  const cvText = serializeParsedCvForCoverLetter(b.parsedCV);

  if (!jd) return { status: 400, body: { error: 'Missing jd' } };
  if (!cvText) return { status: 400, body: { error: 'Missing parsedCV' } };
  if (cvText.length > MAX_COVER_LETTER_CV_CHARS) return { status: 413, body: { error: 'CV too large' } };

  const access = await authorize(authHeader, 'cover_letter', deadline);
  if ('result' in access) return access.result;
  const userId = access.userId;

  const logFailure = (category: string, geminiCalls: CoverLetterGuardMetrics['geminiCalls'], withModel: boolean) =>
    logAnalysisAttempt(
      userId, 'error', 'rewrite', `[cover_letter:${category}]`,
      withModel ? { model: GEMINI_REWRITE_MODEL } : undefined,
      { v: 1, coverLetter: { language, outcome: 'error', category, geminiCalls } },
      deadline
    );

  if (aiDeadline.remainingMs() < MIN_GEMINI_BUDGET_MS) {
    await logFailure('request_budget_exhausted', 0, false);
    return { status: 504, body: { error: COVER_LETTER_TIMEOUT_MESSAGE, retryable: true } };
  }

  try {
    const { content, usage, fidelityFallback, guardMetrics } = await generateCoverLetter(jd, cvText, language, aiDeadline.remainingMs());
    await logAnalysisAttempt(userId, 'success', 'rewrite', undefined, usage, { v: 1, coverLetter: guardMetrics }, deadline);
    return { status: 200, body: fidelityFallback ? { content: '', language, fidelityFallback } : { content, language } };
  } catch (err) {
    console.error('Cover letter failed:', err instanceof Error ? err.name : 'error');
    const category = aiFailureCategory(err);
    const isTimeout = category !== 'gemini_error';
    await logFailure(category, category === 'request_budget_exhausted' ? 0 : 1, category !== 'request_budget_exhausted');
    return {
      status: isTimeout ? 504 : 500,
      body: { error: isTimeout ? COVER_LETTER_TIMEOUT_MESSAGE : 'Không thể tạo thư ứng tuyển. Vui lòng thử lại.', retryable: isTimeout },
    };
  }
}
