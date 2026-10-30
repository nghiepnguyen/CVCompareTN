import axios from 'axios';

export interface RecaptchaResult {
  ok: boolean;
  error?: string;
  status?: 400 | 403 | 503;
}

export async function verifyRecaptcha(
  token: string,
  expectedAction: 'feedback' | 'extract_pdf',
  threshold = 0.5
): Promise<RecaptchaResult> {
  if (typeof token !== 'string' || !token.trim() || token.length > 4096) {
    return { ok: false, status: 400, error: 'Invalid reCAPTCHA token' };
  }
  const secretKey = process.env.RECAPTCHA_SECRET_KEY?.trim();
  if (!secretKey) {
    return { ok: false, status: 503, error: 'reCAPTCHA not configured' };
  }

  const allowedHosts = (process.env.RECAPTCHA_ALLOWED_HOSTNAMES ?? 'cvfit.pro,www.cvfit.pro')
    .split(',').map(host => host.trim().toLowerCase()).filter(Boolean);
  const params = new URLSearchParams({ secret: secretKey, response: token });

  try {
    const { data } = await axios.post<{
      success?: boolean; score?: number; hostname?: string; action?: string;
    }>('https://www.google.com/recaptcha/api/siteverify', params, { timeout: 5000 });

    if (
      data?.success !== true ||
      typeof data.score !== 'number' || !Number.isFinite(data.score) ||
      data.score < threshold || data.score > 1 ||
      data.action !== expectedAction ||
      typeof data.hostname !== 'string' || !allowedHosts.includes(data.hostname.toLowerCase())
    ) {
      return { ok: false, status: 403, error: 'reCAPTCHA verification failed' };
    }
    return { ok: true };
  } catch {
    return { ok: false, status: 503, error: 'reCAPTCHA verification unavailable' };
  }
}
