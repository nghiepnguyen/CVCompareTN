import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import { getUserFromBearerToken, getSupabaseAdmin } from '../_server-lib/payment/supabaseAdmin.js';
import { analyzeCV } from '../_server-lib/ai/analysisService.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authHeader =
      typeof req.headers.authorization === 'string'
        ? req.headers.authorization
        : undefined;
    const user = await getUserFromBearerToken(authHeader);
    const userId = user?.id ?? null;

    const body = req.body as {
      jd?: string;
      cvData?: string;
      cvMimeType?: string;
      cvName?: string;
      language?: string;
      recaptchaToken?: string;
    } | undefined;

    const jd = body?.jd?.trim();
    const cvData = body?.cvData?.trim();
    const cvMimeType = body?.cvMimeType?.trim() || 'text/plain';
    const cvName = body?.cvName?.trim() || 'Unnamed CV';
    const language: 'vi' | 'en' = body?.language === 'en' ? 'en' : 'vi';
    const recaptchaToken = body?.recaptchaToken;

    if (!jd) return res.status(400).json({ error: 'Missing jd (job description)' });
    if (!cvData) return res.status(400).json({ error: 'Missing cvData' });

    // For anonymous users, reCAPTCHA is required
    if (!userId) {
      if (!recaptchaToken) {
        return res.status(401).json({ error: 'Authentication or reCAPTCHA token required' });
      }
      const isLocal =
        process.env.NODE_ENV !== 'production' ||
        (req.headers.host ?? '').includes('localhost');
      if (!isLocal) {
        const secretKey = process.env.RECAPTCHA_SECRET_KEY?.trim();
        if (!secretKey) {
          return res.status(503).json({ error: 'reCAPTCHA not configured' });
        }
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

    // Quota check (authenticated users only)
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

    // Increment usage count (fire-and-forget — start BEFORE sending response so it doesn't block)
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
    console.error('analyze error:', err);
    const message = err instanceof Error ? err.message : 'Server error';
    return res.status(500).json({ error: message });
  }
}
