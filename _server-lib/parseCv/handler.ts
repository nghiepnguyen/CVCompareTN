import { getUserFromBearerToken } from '../payment/supabaseAdmin.js';
import { generateParsedCV } from '../ai/parseCvService.js';
import { withTimeout } from '../withTimeout.js';
import { checkAiAccess } from '../accountLock.js';
import { logAnalysisAttempt } from '../analysisLog.js';
import { resolveStorageRef } from '../storage/tempFile.js';
import { GEMINI_PARSE_MODEL } from '../ai/geminiClient.js';
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
const TIMEOUT_MESSAGE = 'CV parsing is taking too long. Please try again. (Timeout)';

export async function handleParseCv(
  authHeader: string | undefined,
  body: unknown
): Promise<HandlerResult> {
  // Same single request deadline as _server-lib/analyze/handler.ts.
  const deadline = createDeadline(TOTAL_BUDGET_MS);
  const aiDeadline = deadline.reserve(POST_RESERVE_MS);
  const b = (body ?? {}) as {
    cvData?: string;
    cvMimeType?: string;
    language?: string;
    cvPdfInlineData?: string;
    cvPdfStoragePath?: string;
    cvDataStoragePath?: string;
  };

  let cvData = b.cvData?.trim();
  const cvMimeType = b.cvMimeType?.trim() || 'text/plain';
  const language: 'vi' | 'en' = b.language === 'en' ? 'en' : 'vi';
  let cvPdfInlineData = b.cvPdfInlineData?.trim() || undefined;
  const cvPdfStoragePath = b.cvPdfStoragePath?.trim() || undefined;
  const cvDataStoragePath = b.cvDataStoragePath?.trim() || undefined;

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
  const access = await checkAiAccess(user.id, 'parse_cv', Math.min(AUTH_TIMEOUT_MS, deadline.remainingMs()), deadline.signal(AUTH_TIMEOUT_MS));
  if (access === 'locked') return { status: 403, body: { error: 'Account locked' } };
  if (access === 'rate_limited') return { status: 429, body: { error: 'Too many requests. Please try again later.' } };

  // Same path is reused by the client's other calls (analyze/rewrite) for this
  // CV, so cleanup is the client's job after all of them settle.
  // Failures below get a categorical analysis_log row (no raw error text).
  const logFailure = (category: string, withModel = false) =>
    logAnalysisAttempt(user.id, 'error', 'parse_cv', `[${category}]`, withModel ? { model: GEMINI_PARSE_MODEL } : undefined, undefined, deadline);

  const storageDeadline = aiDeadline.reserve(MIN_GEMINI_BUDGET_MS);
  try {
    if (cvDataStoragePath) {
      cvData = await resolveStorageRef(cvDataStoragePath, user.id, storageDeadline);
    }
    if (cvPdfStoragePath) {
      cvPdfInlineData = await resolveStorageRef(cvPdfStoragePath, user.id, storageDeadline);
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
    const { parsedCV, usage } = await generateParsedCV(
      cvData as string, cvMimeType, language, aiDeadline.remainingMs(), cvPdfInlineData
    );
    await logAnalysisAttempt(user.id, 'success', 'parse_cv', undefined, usage, undefined, deadline);
    return { status: 200, body: { parsedCV } };
  } catch (err) {
    console.error('CV parsing failed:', err);
    const category = aiFailureCategory(err);
    const isTimeout = category !== 'gemini_error';
    await logFailure(category, category !== 'request_budget_exhausted'); // model only if Gemini ran
    const message = category === 'request_budget_exhausted' ? TIMEOUT_MESSAGE : err instanceof Error ? err.message : 'Server error';
    return { status: isTimeout ? 504 : 500, body: { error: message, retryable: isTimeout } };
  }
}
