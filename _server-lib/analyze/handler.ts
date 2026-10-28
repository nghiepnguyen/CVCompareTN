import { getUserFromBearerToken, getSupabaseAdmin } from '../payment/supabaseAdmin.js';
import { analyzeCV } from '../ai/analysisService.js';
import { GEMINI_ANALYZE_MODEL } from '../ai/geminiClient.js';
import { withTimeout } from '../withTimeout.js';
import { logAnalysisAttempt } from '../analysisLog.js';
import { MAX_BATCH_BY_PLAN } from '../../src/lib/planLimits.js';
import { resolveStorageRef } from '../storage/tempFile.js';
import {
  aiFailureCategory,
  ControlledError,
  createDeadline,
  MIN_GEMINI_BUDGET_MS,
  POST_RESERVE_MS,
  TOTAL_BUDGET_MS,
} from '../deadline.js';

// Inlined instead of importing src/services/userService.ts — that module
// transitively imports src/lib/supabase.ts via an extensionless specifier,
// which Node's ESM loader can't resolve in the Vercel serverless runtime
// (unlike Vite's bundler, which tolerates it client-side). Keep in sync with
// getDisplayEffectivePlan() in src/services/userService.ts.
function getEffectivePlan(profile: {
  plan: string;
  planExpiresAt: string | null;
  role: string;
}): 'free' | 'pro' | 'recruiter' {
  if (profile.role === 'admin') return 'pro';
  if (profile.plan !== 'pro' && profile.plan !== 'recruiter') return 'free';
  if (!profile.planExpiresAt) return profile.plan as 'pro' | 'recruiter';
  return new Date(profile.planExpiresAt) > new Date()
    ? (profile.plan as 'pro' | 'recruiter')
    : 'free';
}

export type HandlerResult = { status: number; body: Record<string, unknown> };

// Timeouts for Supabase operations — keep them short to preserve budget for AI analysis.
const AUTH_TIMEOUT_MS = 4_000;
const QUOTA_CHECK_TIMEOUT_MS = 5_000;
const PLAN_CHECK_TIMEOUT_MS = 4_000;
const INCREMENT_TIMEOUT_MS = 5_000;

// One request deadline (TOTAL_BUDGET_MS, see _server-lib/deadline.ts) from the
// first line of handleAnalyze: every step — storage, plan/quota checks,
// Gemini, usage increment, telemetry — is capped by what is left of it, so the
// handler answers with JSON well before the client (75s) gives up. Gemini works
// against an AI deadline POST_RESERVE_MS earlier, keeping time for the
// increment, the log row and the response. Vercel's maxDuration (300s) is only
// a safety ceiling; no step is meant to run toward it.
const STORAGE_TIMEOUT_MESSAGE = 'Tải file CV quá thời gian. Vui lòng thử lại. (Timeout)';
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
  };

  const jd = b.jd?.trim();
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
    const category = err instanceof ControlledError ? err.category : 'storage_error';
    await logAnalysisAttempt(userId, 'error', 'analyze', `[${category}]`, undefined, undefined, deadline);
    if (category === 'storage_timeout') {
      return { status: 504, body: { error: STORAGE_TIMEOUT_MESSAGE, retryable: true } };
    }
    const message = err instanceof Error ? err.message : 'Failed to load uploaded file';
    return { status: 400, body: { error: message } };
  }

  // Re-check batch size server-side — the UI already enforces MAX_BATCH_BY_PLAN,
  // this is defense-in-depth against a caller hitting /api/analyze directly.
  // Fails open on lookup errors: worst case is a caller exceeding their batch
  // limit, which the monthly quota check below still bounds.
  try {
    const { data: profile } = await withTimeout(
      getSupabaseAdmin()
        .from('profiles')
        .select('plan, plan_expires_at, role')
        .eq('id', userId)
        .abortSignal(deadline.signal(PLAN_CHECK_TIMEOUT_MS))
        .maybeSingle() as unknown as Promise<{
          data: { plan: string; plan_expires_at: string | null; role: string } | null;
        }>,
      Math.min(PLAN_CHECK_TIMEOUT_MS, deadline.remainingMs()),
      'Plan check'
    );
    if (profile) {
      const effectivePlan = getEffectivePlan({
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
  } catch (planErr) {
    console.warn('Plan check skipped (timeout):', planErr);
  }

  try {
    const adminClient = getSupabaseAdmin();
    const { data: quota, error: quotaError } = await withTimeout(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      adminClient.rpc('check_analytics_quota', {
        p_user_id: userId,
        p_additional: 1,
      }).abortSignal(deadline.signal(QUOTA_CHECK_TIMEOUT_MS)) as unknown as Promise<{ data: unknown; error: unknown }>,
      Math.min(QUOTA_CHECK_TIMEOUT_MS, deadline.remainingMs()),
      'Quota check'
    );
    if (quotaError) {
      console.error('Quota check error:', quotaError);
    } else if (quota && typeof quota === 'object') {
      const q = quota as { allowed?: boolean; used?: number; limit?: number };
      if (!q.allowed) {
        await logAnalysisAttempt(userId, 'error', 'analyze', 'Monthly analysis limit exceeded', undefined, undefined, deadline);
        return {
          status: 429,
          body: { error: 'Monthly analysis limit exceeded', used: q.used, limit: q.limit },
        };
      }
    }
  } catch (quotaErr) {
    // Quota check timed out — log and proceed (fail-open for paying users)
    console.warn('Quota check skipped (timeout):', quotaErr);
  }

  if (aiDeadline.remainingMs() < MIN_GEMINI_BUDGET_MS) {
    await logAnalysisAttempt(userId, 'error', 'analyze', '[request_budget_exhausted]', undefined, undefined, deadline);
    return { status: 504, body: { error: ANALYZE_TIMEOUT_MESSAGE, retryable: true } };
  }

  try {
    const { result, usage, guardMetrics } = await analyzeCV(
      jd, cvData as string, cvMimeType, cvName, language, aiDeadline.remainingMs(), cvPdfInlineData
    );

    // Fail-open as before: a timed-out or failed increment still returns the result.
    try {
      const { error: incrementError } = await withTimeout(
        getSupabaseAdmin()
          .rpc('increment_usage_count', { user_id: userId })
          .abortSignal(deadline.signal(INCREMENT_TIMEOUT_MS)) as unknown as Promise<{
          data: unknown;
          error: unknown;
        }>,
        Math.min(INCREMENT_TIMEOUT_MS, deadline.remainingMs()),
        'Usage increment'
      );
      if (incrementError) console.error('increment_usage_count failed:', incrementError);
    } catch (err) {
      console.error('increment_usage_count failed:', err);
    }
    await logAnalysisAttempt(userId, 'success', 'analyze', undefined, usage, { v: 1, suggestionGuard: guardMetrics }, deadline);

    return { status: 200, body: result as unknown as Record<string, unknown> };
  } catch (analysisError) {
    console.error('Analysis failed:', analysisError);
    const category = aiFailureCategory(analysisError);
    const isTimeout = category !== 'gemini_error';
    // Persist only the category; the client still gets the existing message.
    const usage = category === 'request_budget_exhausted' ? undefined : { model: GEMINI_ANALYZE_MODEL }; // model only if Gemini ran
    await logAnalysisAttempt(userId, 'error', 'analyze', `[${category}]`, usage, undefined, deadline);
    const message =
      category === 'request_budget_exhausted'
        ? ANALYZE_TIMEOUT_MESSAGE
        : analysisError instanceof Error ? analysisError.message : 'Analysis failed';
    return {
      status: isTimeout ? 504 : 500,
      body: {
        error: message,
        retryable: isTimeout,
      },
    };
  }
}
