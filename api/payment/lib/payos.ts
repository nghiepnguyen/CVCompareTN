import { createHmac } from 'node:crypto';

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

  return createHmac('sha256', getChecksumKey()).update(checksumData).digest('hex');
}

/** Matches payOSHQ/payos-lib-node sortObjDataByKey + convertObjToQueryStr. */
export function sortObjDataByKey(
  object: Record<string, unknown>
): Record<string, unknown> {
  return Object.keys(object)
    .sort()
    .reduce<Record<string, unknown>>((obj, key) => {
      obj[key] = object[key];
      return obj;
    }, {});
}

export function convertObjToQueryStr(object: Record<string, unknown>): string {
  return Object.keys(object)
    .filter((key) => object[key] !== undefined)
    .map((key) => {
      let value: unknown = object[key];
      if (Array.isArray(value)) {
        value = JSON.stringify(
          value.map((val) =>
            typeof val === 'object' && val !== null
              ? sortObjDataByKey(val as Record<string, unknown>)
              : val
          )
        );
      }
      if (
        value === null ||
        value === undefined ||
        value === 'undefined' ||
        value === 'null'
      ) {
        value = '';
      }
      return `${key}=${value}`;
    })
    .join('&');
}

export function createSignatureFromObject(data: Record<string, unknown>): string {
  const sorted = sortObjDataByKey(data);
  const dataQueryStr = convertObjToQueryStr(sorted);
  return createHmac('sha256', getChecksumKey()).update(dataQueryStr).digest('hex');
}

export type PayosPaymentRequestInfo = {
  status?: string;
  amount?: number;
  amountPaid?: number;
  orderCode?: number;
};

export function isPayosPaymentPaid(info: PayosPaymentRequestInfo): boolean {
  const status = (info.status ?? '').toUpperCase();
  if (status === 'PAID' || status === 'COMPLETED') return true;
  if (
    typeof info.amount === 'number' &&
    typeof info.amountPaid === 'number' &&
    info.amount > 0
  ) {
    return info.amountPaid >= info.amount;
  }
  return false;
}

export async function fetchPaymentRequestInfo(
  orderCode: number
): Promise<PayosPaymentRequestInfo | null> {
  const response = await fetch(`${PAYOS_API_URL}/${orderCode}`, {
    method: 'GET',
    headers: getPayosHeaders(),
  });
  const parsed = await parsePayosJson(response);
  if (parsed.code !== '00' || !parsed.data) return null;
  const data = parsed.data as Record<string, unknown>;
  return {
    status: typeof data.status === 'string' ? data.status : undefined,
    amount: typeof data.amount === 'number' ? data.amount : undefined,
    amountPaid: typeof data.amountPaid === 'number' ? data.amountPaid : undefined,
    orderCode:
      typeof data.orderCode === 'number' ? data.orderCode : Number(orderCode),
  };
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
    'https://cvfit.pro';
  return url.replace(/\/$/, '');
}

async function parsePayosJson(response: Response): Promise<{
  code?: string;
  desc?: string;
  data?: { checkoutUrl?: string };
}> {
  const text = await response.text();
  try {
    return JSON.parse(text) as {
      code?: string;
      desc?: string;
      data?: { checkoutUrl?: string };
    };
  } catch {
    throw new Error(
      `PayOS returned non-JSON (HTTP ${response.status}): ${text.slice(0, 120)}`
    );
  }
}

export async function createPayosPaymentLink(params: {
  orderCode: number;
  buyerEmail: string;
}): Promise<{ checkoutUrl: string; orderCode: number }> {
  const baseUrl = getAppBaseUrl();
  const orderCode = params.orderCode;
  const description = 'cvFit Pro';
  const returnUrl = `${baseUrl}/payment/success?orderCode=${orderCode}`;
  const cancelUrl = `${baseUrl}/payment/cancel`;

  const payosBody: PayosCreateBody = {
    orderCode,
    amount: PRO_PRICE_VND,
    description,
    buyerEmail: params.buyerEmail,
    items: [{ name: 'cvFit Pro 30 ngày', quantity: 1, price: PRO_PRICE_VND }],
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

  const data = await parsePayosJson(response);

  if (data.code !== '00' || !data.data?.checkoutUrl) {
    throw new Error(data.desc || `PayOS create payment failed (HTTP ${response.status})`);
  }

  return { checkoutUrl: data.data.checkoutUrl, orderCode };
}
