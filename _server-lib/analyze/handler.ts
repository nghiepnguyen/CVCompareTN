import { getUserFromBearerToken, getSupabaseAdmin } from '../payment/supabaseAdmin.js';
import { analyzeCV } from '../ai/analysisService.js';
import { verifyRecaptcha } from '../recaptcha.js';

export type HandlerResult = { status: number; body: Record<string, unknown> };

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

  const user = await getUserFromBearerToken(authHeader);
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
    const adminClient = getSupabaseAdmin();
    const { data: quota, error: quotaError } = await adminClient.rpc('check_analytics_quota', {
      p_user_id: userId,
      p_additional: 1,
    });
    if (quotaError) {
      console.error('Quota check error:', quotaError);
    } else if (quota && !quota.allowed) {
      return {
        status: 429,
        body: { error: 'Monthly analysis limit exceeded', used: quota.used, limit: quota.limit },
      };
    }
  }

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
}
