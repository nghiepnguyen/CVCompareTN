import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import { extractText } from 'unpdf';
import { getUserFromBearerToken } from '../_server-lib/payment/supabaseAdmin.js';
import { initSentryServer, Sentry } from '../_server-lib/sentry.js';

const MAX_PDF_SIZE = 10 * 1024 * 1024; // 10MB decoded
const PDF_HEADER = Buffer.from('%PDF-');

function isPdfBuffer(buffer: Buffer): boolean {
  return buffer.length >= 5 && buffer.subarray(0, 5).equals(PDF_HEADER);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  initSentryServer();

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const authHeader =
    typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined;
  const user = await getUserFromBearerToken(authHeader);

  if (!user) {
    const { recaptchaToken } = (req.body ?? {}) as { recaptchaToken?: string };
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
      const captchaRes = await axios.post<{ success: boolean; score: number }>(
        'https://www.google.com/recaptcha/api/siteverify',
        params
      );
      const { success, score } = captchaRes.data;
      if (!success || score < 0.5) {
        return res.status(403).json({ error: 'reCAPTCHA verification failed' });
      }
    }
  }

  const { base64Data } = req.body;
  if (!base64Data) {
    return res.status(400).json({ error: 'Missing base64Data' });
  }

  try {
    const base64Content = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
    const buffer = Buffer.from(base64Content, 'base64');

    if (buffer.length > MAX_PDF_SIZE) {
      return res.status(400).json({ error: `PDF too large (max ${MAX_PDF_SIZE / (1024 * 1024)}MB)` });
    }

    if (!isPdfBuffer(buffer)) {
      return res.status(400).json({ error: 'File is not a valid PDF' });
    }

    const { text } = await extractText(new Uint8Array(buffer), { mergePages: true });

    return res.status(200).json({ text });
  } catch (error: unknown) {
    Sentry.captureException(error, { tags: { route: 'extract-pdf' } });
    console.error('PDF extraction error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ error: `Failed to extract PDF: ${message}` });
  }
}
