import { supabase } from '../lib/supabase';

export type CreateCheckoutResponse = {
  checkoutUrl: string;
  orderCode: number;
};

type PaymentApiError = {
  error?: string;
  detail?: string;
  missingEnv?: string;
};

async function parsePaymentApiResponse(
  response: Response
): Promise<PaymentApiError & Partial<CreateCheckoutResponse>> {
  const text = await response.text();
  if (!text) {
    return { error: `Máy chủ trả về rỗng (HTTP ${response.status})` };
  }
  try {
    return JSON.parse(text) as PaymentApiError & Partial<CreateCheckoutResponse>;
  } catch {
    const snippet = text.slice(0, 160).trim();
    if (snippet.startsWith('A server error')) {
      throw new Error(
        'API thanh toán trên Vercel bị lỗi runtime. Kiểm tra biến PAYOS_* và SUPABASE_SERVICE_ROLE_KEY trên Vercel → Settings → Environment Variables, rồi Redeploy.'
      );
    }
    throw new Error(snippet || `Phản hồi không hợp lệ (HTTP ${response.status})`);
  }
}

export async function createProCheckout(): Promise<CreateCheckoutResponse> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    throw new Error('Bạn cần đăng nhập để nâng cấp');
  }

  const response = await fetch('/api/payment/create', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  const body = await parsePaymentApiResponse(response);

  if (!response.ok) {
    const parts = [
      body.error,
      body.missingEnv ? `(thiếu: ${body.missingEnv})` : null,
      body.detail,
    ].filter(Boolean);
    throw new Error(parts.join(' ') || 'Không tạo được link thanh toán');
  }

  if (!body.checkoutUrl) {
    throw new Error('Phản hồi thanh toán không hợp lệ');
  }

  return { checkoutUrl: body.checkoutUrl, orderCode: body.orderCode as number };
}
