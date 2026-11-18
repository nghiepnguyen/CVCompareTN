import { getUserFromBearerToken } from '../payment/supabaseAdmin.js';
import { Sentry } from '../sentry.js';
import { getAccountProfile, getEffectivePlan, isLockedProfile, checkHourlyAiLimit } from '../accountLock.js';
import { analyzeCV } from '../ai/analysisService.js';
import { GEMINI_ANALYZE_MODEL } from '../ai/geminiClient.js';
import { withTimeout } from '../withTimeout.js';
import { logAnalysisAttempt } from '../analysisLog.js';
import { MAX_BATCH_BY_PLAN } from '../../src/lib/planLimits.js';
import { resolveStorageRef } from '../storage/tempFile.js';
import { stripInvisibleControls } from '../untrustedText.js';
import { reserveAiCall } from '../rateLimit.js';
import {
  commitMonthlyQuota,
  isValidIdempotencyKey,
  releaseMonthlyQuota,
  reserveMonthlyQuota,
  type ReleaseOutcome,
} from '../quota/monthlyQuota.js';
import { checkCandidateAttempt, saveCandidateResult } from '../recruiter/serverSave.js';
import { checkInputSize } from '../inputLimits.js';
import {
  aiFailureResponse,
  classifyAiFailure,
  ControlledError,
  createDeadline,
  MIN_GEMINI_BUDGET_MS,
  POST_RESERVE_MS,
  TOTAL_BUDGET_MS,
} from '../deadline.js';

export type HandlerResult = { status: number; body: Record<string, unknown> };

// Timeouts for Supabase operations — keep them short to preserve budget for AI analysis.
const AUTH_TIMEOUT_MS = 4_000;
const PLAN_CHECK_TIMEOUT_MS = 4_000;

// One request deadline (TOTAL_BUDGET_MS, see _server-lib/deadline.ts) from the
// first line of handleAnalyze: every step — storage, plan/quota checks,
// Gemini, usage increment, telemetry — is capped by what is left of it, so the
// handler answers with JSON well before the client (75s) gives up. Gemini works
// against an AI deadline POST_RESERVE_MS earlier, keeping time for the
// increment, the log row and the response. Vercel's maxDuration (300s) is only
// a safety ceiling; no step is meant to run toward it.
const STORAGE_TIMEOUT_MESSAGE = 'Tải file CV quá thời gian. Vui lòng thử lại. (Timeout)';
const ANALYZE_BUSY_MESSAGE = 'Hệ thống AI đang quá tải. Vui lòng thử lại sau ít phút.';
const ANALYZE_TIMEOUT_MESSAGE =
  'Quá trình phân tích đang mất nhiều thời gian hơn bình thường. Vui lòng thử lại với JD ngắn hơn hoặc CV đơn giản hơn. (Timeout)';

export async function handleAnalyze(
  authHeader: string | undefined,
  body: unknown
): Promise<HandlerResult> {
  const deadline = createDeadline(TOTAL_BUDGET_MS);
  const aiDeadline = deadline.reserve(POST_RESERVE_MS);
  const b = (body ?? {}) as {
    jd?: string;
    cvData?: string;
    cvMimeType?: string;
    cvName?: string;
    language?: string;
    cvPdfInlineData?: string;
    cvPdfStoragePath?: string;
    cvDataStoragePath?: string;
    batchTotal?: number;
    idempotencyKey?: unknown;
    candidateId?: unknown;
  };

  // Before the empty check so guards, jdTitle and logs all see the same JD.
  const jd = b.jd && stripInvisibleControls(b.jd).trim();
  let cvData = b.cvData?.trim();
  const cvMimeType = b.cvMimeType?.trim() || 'text/plain';
  const cvName = b.cvName?.trim() || 'Unnamed CV';
  const language: 'vi' | 'en' = b.language === 'en' ? 'en' : 'vi';
  let cvPdfInlineData = b.cvPdfInlineData?.trim() || undefined;
  const cvPdfStoragePath = b.cvPdfStoragePath?.trim() || undefined;
  const cvDataStoragePath = b.cvDataStoragePath?.trim() || undefined;
  const batchTotal = typeof b.batchTotal === 'number' && b.batchTotal > 0 ? b.batchTotal : 1;

  if (!jd) {
    await logAnalysisAttempt(null, 'error', 'analyze', 'Missing jd (job description)', undefined, undefined, deadline);
    return { status: 400, body: { error: 'Missing jd (job description)' } };
  }
  if (!cvData && !cvDataStoragePath) {
    await logAnalysisAttempt(null, 'error', 'analyze', 'Missing cvData', undefined, undefined, deadline);
    return { status: 400, body: { error: 'Missing cvData' } };
  }
  // D2: one UUID per CV per run, scoped per user by the ledger. Old clients
  // send none and get a server key (no dedupe, still atomically metered).
  if (b.idempotencyKey !== undefined && !isValidIdempotencyKey(b.idempotencyKey)) {
    return { status: 400, body: { error: 'Invalid idempotency key' } };
  }
  const requestKey = isValidIdempotencyKey(b.idempotencyKey) ? b.idempotencyKey : crypto.randomUUID();
  // M2-Q 1B: a recruiter request names its candidate; the claim attempt id is
  // its idempotency key, so a candidate without a client key cannot be fenced.
  if (b.candidateId !== undefined && (!isValidIdempotencyKey(b.candidateId) || !isValidIdempotencyKey(b.idempotencyKey))) {
    return { status: 400, body: { error: 'Invalid candidate request' } };
  }
  const candidateId = b.candidateId as string | undefined;
  const tooLargeInline = checkInputSize({ jd, cvData, cvMimeType });
  if (tooLargeInline) {
    await logAnalysisAttempt(null, 'error', 'analyze', `[input_too_large:${tooLargeInline.body.field}]`, undefined, undefined, deadline);
    return tooLargeInline;
  }

  const user = await withTimeout(
    getUserFromBearerToken(authHeader),
    Math.min(AUTH_TIMEOUT_MS, deadline.remainingMs()),
    'Auth verification'
  ).catch((err) => {
    console.warn('Auth verification failed:', err.message);
    return null;
  });
  const userId = user?.id ?? null;

  if (!userId) {
    await logAnalysisAttempt(null, 'error', 'analyze', 'Authentication required', undefined, undefined, deadline);
    return { status: 401, body: { error: 'Authentication required' } };
  }

  // Re-check batch size server-side — the UI already enforces MAX_BATCH_BY_PLAN,
  // this is defense-in-depth against a caller hitting /api/analyze directly.
  // The profile also carries the account lock, so this lookup must fail closed.
  // `batchTotal` is only the caller's declaration (one request carries one CV);
  // the hourly cap below is the entitlement the server can actually enforce.
  let effectivePlan: 'free' | 'pro' | 'recruiter' = 'free';
  try {
    const profile = await getAccountProfile(userId, Math.min(PLAN_CHECK_TIMEOUT_MS, deadline.remainingMs()), deadline.signal(PLAN_CHECK_TIMEOUT_MS));
    if (isLockedProfile(profile)) {
      await logAnalysisAttempt(userId, 'error', 'analyze', '[account_locked]', undefined, undefined, deadline);
      return { status: 403, body: { error: 'Account locked' } };
    }
    if (profile) {
      effectivePlan = getEffectivePlan({
        plan: profile.plan as 'free' | 'pro' | 'recruiter',
        planExpiresAt: profile.plan_expires_at,
        role: profile.role === 'admin' ? 'admin' : 'user',
      });
      const maxBatch = MAX_BATCH_BY_PLAN[effectivePlan] ?? 1;
      if (batchTotal > maxBatch) {
        const message = `Batch size ${batchTotal} exceeds plan limit (${maxBatch})`;
        await logAnalysisAttempt(userId, 'error', 'analyze', message, undefined, undefined, deadline);
        return { status: 400, body: { error: message } };
      }
    }
  } catch {
    return { status: 503, body: { error: 'Account verification unavailable' } };
  }

  // M2-Q 1B ownership gate, before any quota or slot is taken: only the
  // attempt that currently owns the candidate may run (fails closed).
  if (candidateId) {
    const gate = await checkCandidateAttempt(userId, candidateId, requestKey, deadline);
    if (gate === 'unavailable') {
      return { status: 503, body: { error: 'Candidate verification unavailable', retryable: true } };
    }
    if (gate === 'not_owner') {
      await logAnalysisAttempt(userId, 'error', 'analyze', '[candidate_not_owner]', undefined, undefined, deadline);
      return { status: 409, body: { error: 'Analysis attempt does not own this candidate', code: 'not_owner' } };
    }
  }

  // Count actual analyze calls in the last hour, so understating batchTotal
  // cannot buy more concurrent work than the plan allows. Fail-open matches
  // the rewrite/parse rate-count behavior.
  const hourly = await checkHourlyAiLimit(
    userId,
    'analyze',
    effectivePlan,
    Math.min(PLAN_CHECK_TIMEOUT_MS, deadline.remainingMs()),
    deadline.signal(PLAN_CHECK_TIMEOUT_MS)
  );
  if (hourly === 'rate_limited') {
    await logAnalysisAttempt(userId, 'error', 'analyze', 'Hourly analysis limit exceeded', undefined, undefined, deadline);
    return { status: 429, body: { error: 'Too many requests. Please try again later.' } };
  }

  // M2-C2 monthly quota: atomic reservation before any AI work (D3: fails
  // closed). Exactly one settle per reservation: commit on a delivered
  // result, otherwise release with how far the request got.
  const reservation = await reserveMonthlyQuota(userId, requestKey, deadline);
  if (reservation.status === 'unavailable') {
    await logAnalysisAttempt(userId, 'error', 'analyze', '[quota_unavailable]', undefined, undefined, deadline);
    return { status: 503, body: { error: 'Quota verification unavailable', code: 'quota_unavailable', retryable: true } };
  }
  if (reservation.status === 'duplicate') {
    await logAnalysisAttempt(userId, 'error', 'analyze', '[duplicate_request]', undefined, undefined, deadline);
    return { status: 409, body: { error: 'Duplicate request', code: 'duplicate_request', state: reservation.state } };
  }
  if (reservation.status === 'denied') {
    await logAnalysisAttempt(userId, 'error', 'analyze', 'Monthly analysis limit exceeded', undefined, undefined, deadline);
    return {
      status: 429,
      body: { error: 'Monthly analysis limit exceeded', used: reservation.used, limit: reservation.limit },
    };
  }
  const reservationId = reservation.reservationId;
  const release = (outcome: ReleaseOutcome) => releaseMonthlyQuota(userId, reservationId, outcome, deadline);

  // Atomic hourly slot (M2-B), after the refundable quota reservation so a
  // quota rejection never burns the non-refundable slot. Fails closed.
  const slot = await reserveAiCall(userId, 'analyze', effectivePlan, deadline);
  if (slot !== 'ok') {
    await release('pre_gemini');
    if (slot === 'rate_limited') {
      await logAnalysisAttempt(userId, 'error', 'analyze', '[ai_rate_limited]', undefined, undefined, deadline);
      return { status: 429, body: { error: 'Too many requests. Please try again later.' } };
    }
    await logAnalysisAttempt(userId, 'error', 'analyze', '[rate_limit_unavailable]', undefined, undefined, deadline);
    return { status: 503, body: { error: 'Rate limit verification unavailable', retryable: true } };
  }

  // Client uploaded the raw file to Storage instead of inlining base64 (large
  // files) — resolve it into the same base64 shape analyzeCV already expects.
  // Same path is reused by the client's follow-up rewrite/parse-cv calls, so
  // cleanup is the client's job (after all three settle), not this handler's.
  // Each ref gets ≤ STORAGE_REF_TIMEOUT_MS and must leave MIN_GEMINI_BUDGET_MS
  // on the AI deadline, so slow storage ends in a JSON 504, not a platform kill.
  const storageDeadline = aiDeadline.reserve(MIN_GEMINI_BUDGET_MS);
  try {
    if (cvDataStoragePath) {
      cvData = await resolveStorageRef(cvDataStoragePath, userId, storageDeadline);
    }
    if (cvPdfStoragePath) {
      cvPdfInlineData = await resolveStorageRef(cvPdfStoragePath, userId, storageDeadline);
    }
  } catch (err) {
    await release('pre_gemini');
    const category = err instanceof ControlledError ? err.category : 'storage_error';
    await logAnalysisAttempt(userId, 'error', 'analyze', `[${category}]`, undefined, undefined, deadline);
    if (category === 'storage_timeout') {
      return { status: 504, body: { error: STORAGE_TIMEOUT_MESSAGE, retryable: true } };
    }
    const message = 'Không thể tải file CV. Vui lòng tải lại file.';
    return { status: 400, body: { error: message } };
  }
  const tooLargeStored = cvDataStoragePath ? checkInputSize({ cvData, cvMimeType }) : null;
  if (tooLargeStored) {
    await release('pre_gemini');
    await logAnalysisAttempt(userId, 'error', 'analyze', `[input_too_large:${tooLargeStored.body.field}]`, undefined, undefined, deadline);
    return tooLargeStored;
  }

  if (aiDeadline.remainingMs() < MIN_GEMINI_BUDGET_MS) {
    await release('pre_gemini');
    await logAnalysisAttempt(userId, 'error', 'analyze', '[request_budget_exhausted]', undefined, undefined, deadline);
    return { status: 504, body: { error: ANALYZE_TIMEOUT_MESSAGE, retryable: true } };
  }

  let geminiStarted = false;
  try {
    const { result, usage, guardMetrics, verificationMetrics } = await analyzeCV(
      jd, cvData as string, cvMimeType, cvName, language, aiDeadline.remainingMs(), cvPdfInlineData,
      () => { geminiStarted = true; }
    );

    // Amendment A4: a result is only delivered once its charge is recorded.
    // Unsettled after bounded retries → withheld; the reservation expires and
    // is settled as uncertain (first 2 per cycle forgiven).
    if (!(await commitMonthlyQuota(userId, reservationId, deadline))) {
      Sentry.captureMessage('quota_commit_failed', { level: 'error', tags: { route: 'analyze' } });
      await logAnalysisAttempt(userId, 'error', 'analyze', '[quota_settlement_unavailable]', usage, undefined, deadline);
      return {
        status: 503,
        body: { error: 'Quota settlement unavailable', code: 'quota_settlement_unavailable', retryable: true },
      };
    }
    // M2-Q 1B: settled, so the result may now be stored (fenced by attempt).
    // Never throws; on 'failed' the browser saves under the same attempt id.
    const serverSave = candidateId
      ? await saveCandidateResult(userId, candidateId, requestKey, result as unknown as Record<string, unknown>, deadline)
      : undefined;
    await logAnalysisAttempt(userId, 'success', 'analyze', undefined, usage, { v: 1, suggestionGuard: guardMetrics, requirementVerification: verificationMetrics }, deadline);

    return {
      status: 200,
      body: serverSave ? { ...(result as unknown as Record<string, unknown>), serverSave } : (result as unknown as Record<string, unknown>),
    };
  } catch (analysisError) {
    console.error('Analysis failed:', analysisError);
    const category = classifyAiFailure(analysisError);
    const failure = aiFailureResponse(category);
    // Amendment A8: refund only when no result can exist.
    const outcome: ReleaseOutcome = !geminiStarted
      ? 'pre_gemini'
      : category === 'gemini_rate_limited' || category === 'gemini_unavailable' || category === 'gemini_rejected'
        ? 'provider_error'
        : 'uncertain';
    await release(outcome);
    // Keep provider details out of both telemetry and the response.
    const usage = category === 'request_budget_exhausted' ? undefined : { model: GEMINI_ANALYZE_MODEL }; // model only if Gemini ran
    await logAnalysisAttempt(userId, 'error', 'analyze', `[${category}]`, usage, undefined, deadline);
    const message =
      failure.kind === 'busy'
        ? ANALYZE_BUSY_MESSAGE
        : failure.kind === 'timeout'
          ? ANALYZE_TIMEOUT_MESSAGE
          : 'Không thể phân tích CV. Vui lòng thử lại.';
    return {
      status: failure.status,
      body: {
        error: message,
        retryable: failure.retryable,
      },
    };
  }
}
