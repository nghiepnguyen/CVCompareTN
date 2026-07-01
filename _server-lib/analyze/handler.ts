import { getUserFromBearerToken, getSupabaseAdmin } from '../payment/supabaseAdmin.js';
import { analyzeCV } from '../ai/analysisService.js';
import { verifyRecaptcha } from '../recaptcha.js';

export type HandlerResult = { status: number; body: Record<string, unknown> };

// Timeouts for Supabase operations — keep them short to preserve budget for AI analysis.
const AUTH_TIMEOUT_MS = 4_000;
const QUOTA_CHECK_TIMEOUT_MS = 5_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export async function handleAnalyze(
  authHeader: string | undefined,
  body: unknown
): Promise<HandlerResult> {
  const b = (body ?? {}) as {
    jd?: string;
    cvData?: string;
    cvMimeType?: string;
    cvName?: string;
    language?: string;
    recaptchaToken?: string;
  };

  const jd = b.jd?.trim();
  const cvData = b.cvData?.trim();
  const cvMimeType = b.cvMimeType?.trim() || 'text/plain';
  const cvName = b.cvName?.trim() || 'Unnamed CV';
  const language: 'vi' | 'en' = b.language === 'en' ? 'en' : 'vi';
  const recaptchaToken = b.recaptchaToken;

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
    if (!recaptchaToken) {
      return { status: 401, body: { error: 'Authentication or reCAPTCHA token required' } };
    }
    const captcha = await verifyRecaptcha(recaptchaToken);
    if (!captcha.ok) {
      return { status: captcha.status ?? 403, body: { error: captcha.error } };
    }
  }

  if (userId) {
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
  }

  try {
    const result = await analyzeCV(jd, cvData, cvMimeType, cvName, language);

    if (userId) {
      void (async () => {
        try {
          await getSupabaseAdmin().rpc('increment_usage_count', { user_id: userId });
        } catch (err) {
          console.error('increment_usage_count failed:', err);
        }
      })();
    }

    return { status: 200, body: result as unknown as Record<string, unknown> };
  } catch (analysisError) {
    console.error('Analysis failed:', analysisError);
    const message =
      analysisError instanceof Error ? analysisError.message : 'Analysis failed';
    const isTimeout = message.includes('(Timeout)');
    return {
      status: isTimeout ? 504 : 500,
      body: {
        error: message,
        retryable: isTimeout,
      },
    };
  }
}
