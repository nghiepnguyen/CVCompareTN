import { extractText } from 'unpdf';
import { getUserFromBearerToken } from '../payment/supabaseAdmin.js';
import { verifyRecaptcha } from '../recaptcha.js';

export type HandlerResult = { status: number; body: Record<string, unknown> };

const MAX_PDF_SIZE = 10 * 1024 * 1024; // 10MB decoded
const PDF_HEADER = Buffer.from('%PDF-');

function isPdfBuffer(buffer: Buffer): boolean {
  return buffer.length >= 5 && buffer.subarray(0, 5).equals(PDF_HEADER);
}

export async function handleExtractPdf(
  authHeader: string | undefined,
  body: unknown
): Promise<HandlerResult> {
  const b = (body ?? {}) as { base64Data?: string; recaptchaToken?: string };

  const user = await getUserFromBearerToken(authHeader);

  if (!user) {
    const { recaptchaToken } = b;
    if (!recaptchaToken) {
      return { status: 401, body: { error: 'Authentication or reCAPTCHA token required' } };
    }
    const captcha = await verifyRecaptcha(recaptchaToken);
    if (!captcha.ok) {
      return { status: captcha.status ?? 403, body: { error: captcha.error } };
    }
  }

  const { base64Data } = b;
  if (!base64Data) {
    return { status: 400, body: { error: 'Missing base64Data' } };
  }

  const base64Content = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
  const buffer = Buffer.from(base64Content, 'base64');

  if (buffer.length > MAX_PDF_SIZE) {
    return { status: 400, body: { error: `PDF too large (max ${MAX_PDF_SIZE / (1024 * 1024)}MB)` } };
  }

  if (!isPdfBuffer(buffer)) {
    return { status: 400, body: { error: 'File is not a valid PDF' } };
  }

  const { text } = await extractText(new Uint8Array(buffer), { mergePages: true });

  return { status: 200, body: { text } };
}
