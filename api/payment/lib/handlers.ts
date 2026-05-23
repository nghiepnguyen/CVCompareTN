import {
  createPayosPaymentLink,
  generateOrderCode,
  PRO_DURATION_DAYS,
  PRO_PRICE_VND,
  verifyWebhookPayload,
} from './payos.js';
import { getMissingPaymentEnv, paymentConfigErrorBody } from './paymentEnv.js';
import { getSupabaseAdmin, getUserFromBearerToken } from './supabaseAdmin.js';

export type PaymentHandlerResult = { status: number; body: Record<string, unknown> };

export async function handlePaymentCreate(
  authHeader: string | undefined
): Promise<PaymentHandlerResult> {
  const missingEnv = getMissingPaymentEnv();
  if (missingEnv) {
    return { status: 503, body: paymentConfigErrorBody(missingEnv) };
  }

  const user = await getUserFromBearerToken(authHeader);
  if (!user) {
    return { status: 401, body: { error: 'Unauthorized' } };
  }
  if (!user.email) {
    return { status: 400, body: { error: 'Tài khoản cần email để thanh toán' } };
  }

  const supabase = getSupabaseAdmin();
  const orderCode = generateOrderCode();

  const { checkoutUrl, orderCode: confirmedCode } = await createPayosPaymentLink({
    orderCode,
    buyerEmail: user.email,
  });

  const { error: insertError } = await supabase.from('payments').insert({
    user_id: user.id,
    order_code: confirmedCode,
    amount: PRO_PRICE_VND,
    plan: 'pro',
    duration_days: PRO_DURATION_DAYS,
    status: 'pending',
  });

  if (insertError) {
    console.error('payments insert failed:', insertError);
    const detail =
      insertError.code === '23503'
        ? 'Tài khoản chưa có hồ sơ (profiles). Đăng xuất và đăng nhập lại.'
        : insertError.message;
    return { status: 500, body: { error: 'Không lưu được đơn thanh toán', detail } };
  }

  return { status: 200, body: { checkoutUrl, orderCode: confirmedCode } };
}

export async function handlePaymentWebhook(
  body: unknown
): Promise<PaymentHandlerResult> {
  const missingEnv = getMissingPaymentEnv();
  if (missingEnv) {
    return { status: 503, body: paymentConfigErrorBody(missingEnv) };
  }

  const payload = body as {
    code?: string;
    data?: Record<string, unknown> & { orderCode?: number };
    signature?: string;
  };

  if (!verifyWebhookPayload(payload)) {
    return { status: 400, body: { error: 'Chữ ký không hợp lệ' } };
  }

  if (payload.code !== '00') {
    return { status: 200, body: { success: true, ignored: true } };
  }

  const orderCode = payload.data?.orderCode;
  if (orderCode == null) {
    return { status: 400, body: { error: 'Thiếu orderCode' } };
  }

  const supabase = getSupabaseAdmin();

  const { data: payment, error: fetchError } = await supabase
    .from('payments')
    .select('user_id, status')
    .eq('order_code', orderCode)
    .maybeSingle();

  if (fetchError || !payment) {
    return { status: 404, body: { error: 'Không tìm thấy đơn hàng' } };
  }

  if (payment.status === 'paid') {
    return { status: 200, body: { success: true, alreadyPaid: true } };
  }

  const { error: rpcError } = await supabase.rpc('activate_pro_plan', {
    p_user_id: payment.user_id,
    p_order_code: orderCode,
    p_duration_days: PRO_DURATION_DAYS,
    p_payos_data: payload.data ?? null,
  });

  if (rpcError) {
    console.error('activate_pro_plan failed:', rpcError);
    return { status: 500, body: { error: 'Kích hoạt Pro thất bại' } };
  }

  return { status: 200, body: { success: true } };
}
