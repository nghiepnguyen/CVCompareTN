import crypto from 'crypto';

export const PRO_PRICE_VND = 69000;
export const PRO_DURATION_DAYS = 30;
export const PAYOS_API_URL = 'https://api-merchant.payos.vn/v2/payment-requests';

export type PayosCreateBody = {
  orderCode: number;
  amount: number;
  description: string;
  buyerEmail?: string;
  items: { name: string; quantity: number; price: number }[];
  returnUrl: string;
  cancelUrl: string;
  expiredAt?: number;
};

function getChecksumKey(): string {
  const key = process.env.PAYOS_CHECKSUM_KEY?.trim();
  if (!key) throw new Error('PAYOS_CHECKSUM_KEY is not configured');
  return key;
}

function getPayosHeaders(): Record<string, string> {
  const clientId = process.env.PAYOS_CLIENT_ID?.trim();
  const apiKey = process.env.PAYOS_API_KEY?.trim();
  if (!clientId || !apiKey) {
    throw new Error('PayOS credentials are not configured');
  }
  return {
    'x-client-id': clientId,
    'x-api-key': apiKey,
    'Content-Type': 'application/json',
  };
}

/** Signature for POST /v2/payment-requests (create payment link). */
export function createPaymentRequestSignature(body: {
  amount: number;
  cancelUrl: string;
  description: string;
  orderCode: number;
  returnUrl: string;
}): string {
  const checksumData =
    `amount=${body.amount}` +
    `&cancelUrl=${body.cancelUrl}` +
    `&description=${body.description}` +
    `&orderCode=${body.orderCode}` +
    `&returnUrl=${body.returnUrl}`;

  return crypto.createHmac('sha256', getChecksumKey()).update(checksumData).digest('hex');
}

/** Webhook: sign the `data` object (sorted keys, PayOS SDK convention). */
function objectToSignString(obj: Record<string, unknown>): string {
  const keys = Object.keys(obj).sort();
  return keys
    .filter((key) => {
      const v = obj[key];
      return v !== undefined && v !== null && v !== '';
    })
    .map((key) => `${key}=${obj[key]}`)
    .join('&');
}

export function createSignatureFromObject(data: Record<string, unknown>): string {
  return crypto
    .createHmac('sha256', getChecksumKey())
    .update(objectToSignString(data))
    .digest('hex');
}

export function verifyWebhookPayload(body: {
  code?: string;
  data?: Record<string, unknown>;
  signature?: string;
}): boolean {
  if (!body.data || !body.signature) return false;
  const expected = createSignatureFromObject(body.data);
  return expected === body.signature;
}

export function generateOrderCode(): number {
  return (Date.now() % 1_000_000_000) + Math.floor(Math.random() * 1000);
}

export function getAppBaseUrl(): string {
  const url =
    process.env.APP_URL?.trim() ||
    process.env.VITE_APP_URL?.trim() ||
    'https://cv.thanhnghiep.top';
  return url.replace(/\/$/, '');
}

export async function createPayosPaymentLink(params: {
  orderCode: number;
  buyerEmail: string;
}): Promise<{ checkoutUrl: string; orderCode: number }> {
  const baseUrl = getAppBaseUrl();
  const orderCode = params.orderCode;
  const description = 'CV Compare Pro';
  const returnUrl = `${baseUrl}/payment/success?orderCode=${orderCode}`;
  const cancelUrl = `${baseUrl}/payment/cancel`;

  const payosBody: PayosCreateBody = {
    orderCode,
    amount: PRO_PRICE_VND,
    description,
    buyerEmail: params.buyerEmail,
    items: [{ name: 'CV Compare Pro 30 ngày', quantity: 1, price: PRO_PRICE_VND }],
    returnUrl,
    cancelUrl,
    expiredAt: Math.floor(Date.now() / 1000) + 15 * 60,
  };

  const signature = createPaymentRequestSignature({
    amount: payosBody.amount,
    cancelUrl: payosBody.cancelUrl,
    description: payosBody.description,
    orderCode: payosBody.orderCode,
    returnUrl: payosBody.returnUrl,
  });

  const response = await fetch(PAYOS_API_URL, {
    method: 'POST',
    headers: getPayosHeaders(),
    body: JSON.stringify({ ...payosBody, signature }),
  });

  const data = (await response.json()) as {
    code?: string;
    desc?: string;
    data?: { checkoutUrl?: string };
  };

  if (data.code !== '00' || !data.data?.checkoutUrl) {
    throw new Error(data.desc || 'PayOS create payment failed');
  }

  return { checkoutUrl: data.data.checkoutUrl, orderCode };
}
