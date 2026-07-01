import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getUserFromBearerToken } from '../_server-lib/payment/supabaseAdmin.js';
import { verifyRecaptcha } from '../_server-lib/recaptcha.js';
import { generateFullRewrite } from '../_server-lib/ai/rewriteService.js';
import { initSentryServer, Sentry } from '../_server-lib/sentry.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  initSentryServer();

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const b = (req.body ?? {}) as {
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

    if (!jd) return res.status(400).json({ error: 'Missing jd' });
    if (!cvData) return res.status(400).json({ error: 'Missing cvData' });

    const authHeader =
      typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined;
    const user = await getUserFromBearerToken(authHeader).catch(() => null);

    if (!user) {
      if (!recaptchaToken) return res.status(401).json({ error: 'Auth or reCAPTCHA required' });
      const captcha = await verifyRecaptcha(recaptchaToken);
      if (!captcha.ok) return res.status(captcha.status ?? 403).json({ error: captcha.error });
    }

    const fullRewrittenCV = await generateFullRewrite(jd, cvData, cvMimeType, language);
    return res.status(200).json({ fullRewrittenCV });
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'rewrite-cv' } });
    console.error('rewrite-cv error:', err);
    const message = err instanceof Error ? err.message : 'Server error';
    const isTimeout = message.includes('(Timeout)');
    return res.status(isTimeout ? 504 : 500).json({ error: message, retryable: isTimeout });
  }
}
