import { getUserFromBearerToken } from '../payment/supabaseAdmin.js';
import { generateFullRewrite } from '../ai/rewriteService.js';
import { verifyRecaptcha } from '../recaptcha.js';
import { withTimeout } from '../withTimeout.js';

export type HandlerResult = { status: number; body: Record<string, unknown> };

const AUTH_TIMEOUT_MS = 4_000;
const RECAPTCHA_TIMEOUT_MS = 5_000;
// Wall-clock budget from the first line of the handler — mirrors _server-lib/analyze/handler.ts
// so auth + recaptcha + rewrite can never together exceed Vercel's 60s maxDuration.
const TOTAL_BUDGET_MS = 50_000;
const MIN_REWRITE_BUDGET_MS = 10_000;

export async function handleRewriteCv(
  authHeader: string | undefined,
  body: unknown
): Promise<HandlerResult> {
  const requestStart = Date.now();
  const b = (body ?? {}) as {
    jd?: string;
    cvData?: string;
    cvMimeType?: string;
    language?: string;
    recaptchaToken?: string;
  };

  const jd = b.jd?.trim();
  const cvData = b.cvData?.trim();
  const cvMimeType = b.cvMimeType?.trim() || 'text/plain';
  const language: 'vi' | 'en' = b.language === 'en' ? 'en' : 'vi';
  const recaptchaToken = b.recaptchaToken;

  if (!jd) return { status: 400, body: { error: 'Missing jd' } };
  if (!cvData) return { status: 400, body: { error: 'Missing cvData' } };

  const user = await withTimeout(
    getUserFromBearerToken(authHeader),
    AUTH_TIMEOUT_MS,
    'Auth verification'
  ).catch((err) => {
    console.warn('Auth verification failed:', err.message);
    return null;
  });

  if (!user) {
    if (!recaptchaToken) return { status: 401, body: { error: 'Auth or reCAPTCHA required' } };
    const captcha = await withTimeout(
      verifyRecaptcha(recaptchaToken),
      RECAPTCHA_TIMEOUT_MS,
      'reCAPTCHA verification'
    ).catch((err) => {
      console.warn('reCAPTCHA verification failed:', err.message);
      return { ok: false, status: 503 as const, error: 'reCAPTCHA verification unavailable' };
    });
    if (!captcha.ok) return { status: captcha.status ?? 403, body: { error: captcha.error } };
  }

  const remainingBudgetMs = TOTAL_BUDGET_MS - (Date.now() - requestStart);
  if (remainingBudgetMs < MIN_REWRITE_BUDGET_MS) {
    return {
      status: 504,
      body: {
        error: 'CV rewrite is taking too long. Please try again. (Timeout)',
        retryable: true,
      },
    };
  }

  try {
    const fullRewrittenCV = await generateFullRewrite(
      jd,
      cvData,
      cvMimeType,
      language,
      remainingBudgetMs
    );
    return { status: 200, body: { fullRewrittenCV } };
  } catch (err) {
    console.error('CV rewrite failed:', err);
    const message = err instanceof Error ? err.message : 'Server error';
    const isTimeout = message.includes('(Timeout)');
    return { status: isTimeout ? 504 : 500, body: { error: message, retryable: isTimeout } };
  }
}
