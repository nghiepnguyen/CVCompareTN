import { Router } from 'express';
import axios from 'axios';
import { getUserFromBearerToken, getSupabaseAdmin } from '../../_server-lib/payment/supabaseAdmin';
import { analyzeCV } from '../../_server-lib/ai/analysisService';

const router = Router();

router.post('/', async (req, res) => {
  try {
    const authHeader =
      typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined;
    const user = await getUserFromBearerToken(authHeader);
    const userId = user?.id ?? null;

    const body = req.body as {
      jd?: string;
      cvData?: string;
      cvMimeType?: string;
      cvName?: string;
      language?: string;
      recaptchaToken?: string;
    };

    const jd = body.jd?.trim();
    const cvData = body.cvData?.trim();
    const cvMimeType = body.cvMimeType?.trim() || 'text/plain';
    const cvName = body.cvName?.trim() || 'Unnamed CV';
    const language: 'vi' | 'en' = body.language === 'en' ? 'en' : 'vi';
    const recaptchaToken = body.recaptchaToken;

    if (!jd) return res.status(400).json({ error: 'Missing jd' });
    if (!cvData) return res.status(400).json({ error: 'Missing cvData' });

    // reCAPTCHA: bypass in dev (localhost), enforce in production for anonymous users
    if (!userId) {
      if (!recaptchaToken) {
        return res.status(401).json({ error: 'Authentication or reCAPTCHA token required' });
      }
      const isLocal = process.env.NODE_ENV !== 'production';
      if (!isLocal) {
        const secretKey = process.env.RECAPTCHA_SECRET_KEY?.trim();
        if (secretKey) {
          const params = new URLSearchParams();
          params.append('secret', secretKey);
          params.append('response', recaptchaToken);
          const captchaRes = await axios.post(
            'https://www.google.com/recaptcha/api/siteverify',
            params
          );
          const { success, score } = captchaRes.data as { success: boolean; score: number };
          if (!success || score < 0.5) {
            return res.status(403).json({ error: 'reCAPTCHA verification failed' });
          }
        }
      }
    }

    if (userId) {
      const adminClient = getSupabaseAdmin();
      const { data: quota, error: quotaError } = await adminClient.rpc(
        'check_analytics_quota',
        { p_user_id: userId, p_additional: 1 }
      );
      if (quotaError) {
        console.error('Quota check error:', quotaError);
      } else if (quota && !quota.allowed) {
        return res.status(429).json({
          error: 'Monthly analysis limit exceeded',
          used: quota.used,
          limit: quota.limit,
        });
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

    return res.status(200).json(result);
  } catch (err) {
    console.error('analyze route error:', err);
    const message = err instanceof Error ? err.message : 'Server error';
    return res.status(500).json({ error: message });
  }
});

export default router;
