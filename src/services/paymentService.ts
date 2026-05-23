import { supabase } from '../lib/supabase';

export type CreateCheckoutResponse = {
  checkoutUrl: string;
  orderCode: number;
};

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

  const body = (await response.json()) as CreateCheckoutResponse & { error?: string };
  if (!response.ok) {
    throw new Error(body.error || 'Không tạo được link thanh toán');
  }
  if (!body.checkoutUrl) {
    throw new Error('Phản hồi thanh toán không hợp lệ');
  }
  return body;
}
