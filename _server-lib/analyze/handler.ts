import { getUserFromBearerToken, getSupabaseAdmin } from '../payment/supabaseAdmin.js';
import { analyzeCV } from '../ai/analysisService.js';
import { withTimeout } from '../withTimeout.js';
import { logAnalysisAttempt } from '../analysisLog.js';

export type HandlerResult = { status: number; body: Record<string, unknown> };

// Timeouts for Supabase operations — keep them short to preserve budget for AI analysis.
const AUTH_TIMEOUT_MS = 4_000;
const QUOTA_CHECK_TIMEOUT_MS = 5_000;

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
  };

  const jd = b.jd?.trim();
  const cvData = b.cvData?.trim();
  const cvMimeType = b.cvMimeType?.trim() || 'text/plain';
  const cvName = b.cvName?.trim() || 'Unnamed CV';
  const language: 'vi' | 'en' = b.language === 'en' ? 'en' : 'vi';
  const cvPdfInlineData = b.cvPdfInlineData?.trim() || undefined;

  if (!jd) return { status: 400, body: { error: 'Missing jd (job description)' } };
  if (!cvData) return { status: 400, body: { error: 'Missing cvData' } };

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
    return { status: 401, body: { error: 'Authentication required' } };
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
      jd, cvData, cvMimeType, cvName, language, remainingBudgetMs, cvPdfInlineData
    );

    void (async () => {
      try {
        await getSupabaseAdmin().rpc('increment_usage_count', { user_id: userId });
      } catch (err) {
        console.error('increment_usage_count failed:', err);
      }
    })();
    logAnalysisAttempt(userId, 'success', 'analyze', undefined, usage);

    return { status: 200, body: result as unknown as Record<string, unknown> };
  } catch (analysisError) {
    console.error('Analysis failed:', analysisError);
    const message =
      analysisError instanceof Error ? analysisError.message : 'Analysis failed';
    const isTimeout = message.includes('(Timeout)');
    logAnalysisAttempt(userId, 'error', 'analyze', message);
    return {
      status: isTimeout ? 504 : 500,
      body: {
        error: message,
        retryable: isTimeout,
      },
    };
  }
}
