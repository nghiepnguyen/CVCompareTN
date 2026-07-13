import { getUserFromBearerToken, getSupabaseAdmin } from '../payment/supabaseAdmin.js';
import { analyzeCV } from '../ai/analysisService.js';
import { withTimeout } from '../withTimeout.js';
import { logAnalysisAttempt } from '../analysisLog.js';
import { MAX_BATCH_BY_PLAN } from '../../src/lib/planLimits.js';
import { resolveStorageRef } from '../storage/tempFile.js';

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

// Wall-clock budget for the whole handler, measured from the first line of
// handleAnalyze. Vercel hard-kills the function at maxDuration=60s with no
// JSON body (client sees a bare HTTP 504). Previously each step (auth/quota/
// analyze) had its own independent timeout and recaptcha had none at all —
// their worst cases could sum past 60s. Using a single deadline and handing
// analyzeCV whatever is actually left guarantees the total never exceeds the
// budget regardless of how long the earlier steps took.
const TOTAL_BUDGET_MS = 50_000;
const MIN_ANALYZE_BUDGET_MS = 10_000;

export async function handleAnalyze(
  authHeader: string | undefined,
  body: unknown
): Promise<HandlerResult> {
  const requestStart = Date.now();
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
    await logAnalysisAttempt(null, 'error', 'analyze', 'Missing jd (job description)');
    return { status: 400, body: { error: 'Missing jd (job description)' } };
  }
  if (!cvData && !cvDataStoragePath) {
    await logAnalysisAttempt(null, 'error', 'analyze', 'Missing cvData');
    return { status: 400, body: { error: 'Missing cvData' } };
  }

  const user = await withTimeout(
    getUserFromBearerToken(authHeader),
    AUTH_TIMEOUT_MS,
    'Auth verification'
  ).catch((err) => {
    console.warn('Auth verification failed:', err.message);
    return null;
  });
  const userId = user?.id ?? null;

  if (!userId) {
    await logAnalysisAttempt(null, 'error', 'analyze', 'Authentication required');
    return { status: 401, body: { error: 'Authentication required' } };
  }

  // Client uploaded the raw file to Storage instead of inlining base64 (large
  // files) — resolve it into the same base64 shape analyzeCV already expects.
  // Same path is reused by the client's follow-up rewrite/parse-cv calls, so
  // cleanup is the client's job (after all three settle), not this handler's.
  try {
    if (cvDataStoragePath) {
      cvData = await resolveStorageRef(cvDataStoragePath, userId);
    }
    if (cvPdfStoragePath) {
      cvPdfInlineData = await resolveStorageRef(cvPdfStoragePath, userId);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load uploaded file';
    await logAnalysisAttempt(userId, 'error', 'analyze', message);
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
        .maybeSingle() as unknown as Promise<{
          data: { plan: string; plan_expires_at: string | null; role: string } | null;
        }>,
      PLAN_CHECK_TIMEOUT_MS,
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
        await logAnalysisAttempt(userId, 'error', 'analyze', message);
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
      }) as unknown as Promise<{ data: unknown; error: unknown }>,
      QUOTA_CHECK_TIMEOUT_MS,
      'Quota check'
    );
    if (quotaError) {
      console.error('Quota check error:', quotaError);
    } else if (quota && typeof quota === 'object') {
      const q = quota as { allowed?: boolean; used?: number; limit?: number };
      if (!q.allowed) {
        await logAnalysisAttempt(userId, 'error', 'analyze', 'Monthly analysis limit exceeded');
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

  const remainingBudgetMs = TOTAL_BUDGET_MS - (Date.now() - requestStart);
  if (remainingBudgetMs < MIN_ANALYZE_BUDGET_MS) {
    await logAnalysisAttempt(userId, 'error', 'analyze', 'Preflight timeout: no budget left before calling analyzeCV');
    return {
      status: 504,
      body: {
        error:
          'Quá trình phân tích đang mất nhiều thời gian hơn bình thường. Vui lòng thử lại với JD ngắn hơn hoặc CV đơn giản hơn. (Timeout)',
        retryable: true,
      },
    };
  }

  try {
    const { result, usage } = await analyzeCV(
      jd, cvData as string, cvMimeType, cvName, language, remainingBudgetMs, cvPdfInlineData
    );

    try {
      const { error: incrementError } = await withTimeout(
        getSupabaseAdmin().rpc('increment_usage_count', { user_id: userId }) as unknown as Promise<{
          data: unknown;
          error: unknown;
        }>,
        INCREMENT_TIMEOUT_MS,
        'Usage increment'
      );
      if (incrementError) console.error('increment_usage_count failed:', incrementError);
    } catch (err) {
      console.error('increment_usage_count failed:', err);
    }
    await logAnalysisAttempt(userId, 'success', 'analyze', undefined, usage);

    return { status: 200, body: result as unknown as Record<string, unknown> };
  } catch (analysisError) {
    console.error('Analysis failed:', analysisError);
    const message =
      analysisError instanceof Error ? analysisError.message : 'Analysis failed';
    const isTimeout = message.includes('(Timeout)');
    await logAnalysisAttempt(userId, 'error', 'analyze', message);
    return {
      status: isTimeout ? 504 : 500,
      body: {
        error: message,
        retryable: isTimeout,
      },
    };
  }
}
