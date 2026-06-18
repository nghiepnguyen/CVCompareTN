import axios from 'axios';

export interface RecaptchaResult {
  ok: boolean;
  error?: string;
  status?: 400 | 403 | 503;
}

export async function verifyRecaptcha(
  token: string,
  threshold = 0.5
): Promise<RecaptchaResult> {
  if (process.env.NODE_ENV !== 'production') {
    return { ok: true };
  }

  const secretKey = process.env.RECAPTCHA_SECRET_KEY?.trim();
  if (!secretKey) {
    return { ok: false, status: 503, error: 'reCAPTCHA not configured' };
  }

  const params = new URLSearchParams();
  params.append('secret', secretKey);
  params.append('response', token);

  const { data } = await axios.post<{ success: boolean; score?: number; 'error-codes'?: string[]; hostname?: string }>(
    'https://www.google.com/recaptcha/api/siteverify',
    params
  );

  if (!data.success) {
    console.error('reCAPTCHA failed:', { errorCodes: data['error-codes'], hostname: data.hostname });
    return { ok: false, status: 403, error: 'reCAPTCHA verification failed' };
  }
  if (data.score !== undefined && data.score < threshold) {
    console.error('reCAPTCHA low score:', { score: data.score, threshold, hostname: data.hostname });
    return { ok: false, status: 403, error: 'reCAPTCHA verification failed' };
  }

  return { ok: true };
}
