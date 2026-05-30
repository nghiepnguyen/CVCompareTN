import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createPayosPaymentLink,
  fetchPaymentRequestInfo,
  generateOrderCode,
  isPayosPaymentPaid,
  PRO_DURATION_DAYS,
  PRO_PRICE_VND,
  verifyWebhookPayload,
} from './payos.js';
import { getMissingPaymentEnv, paymentConfigErrorBody } from './paymentEnv.js';
import { getSupabaseAdmin, getUserFromBearerToken } from './supabaseAdmin.js';
import { sendVipUpgradeEmail } from './vipUpgradeEmail.js';

export type PaymentHandlerResult = { status: number; body: Record<string, unknown> };

function normalizeOrderCode(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) return Math.trunc(n);
  }
  return null;
}

function isWebhookPaymentSuccess(payload: {
  code?: string;
  success?: boolean;
}): boolean {
  if (payload.success === true) return true;
  return payload.code === '00';
}

async function activateProForOrder(
  supabase: SupabaseClient,
  userId: string,
  orderCode: number,
  payosData: Record<string, unknown> | null,
  durationDays: number = PRO_DURATION_DAYS
): Promise<{ activated: boolean; error: string | null }> {
  const { data, error } = await supabase.rpc('activate_pro_plan', {
    p_user_id: userId,
    p_order_code: orderCode,
    p_duration_days: durationDays,
    p_payos_data: payosData,
  });
  if (error) {
    console.error('activate_pro_plan failed:', error);
    return { activated: false, error: error.message };
  }
  return { activated: data === true, error: null };
}

/**
 * Fetch user profile to get display_name and plan_expires_at for email.
 * Returns null if the profile doesn't exist (shouldn't happen after activation).
 */
async function fetchProfileForEmail(
  supabase: SupabaseClient,
  userId: string
): Promise<{ displayName: string | null; planExpiresAt: string | null } | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('display_name, plan_expires_at')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) {
    console.error('fetchProfileForEmail failed:', error);
    return null;
  }

  return {
    displayName: typeof data.display_name === 'string' ? data.display_name : null,
    planExpiresAt: typeof data.plan_expires_at === 'string' ? data.plan_expires_at : null,
  };
}

/**
 * After successful Pro activation, send VIP upgrade notification email.
 * This is non-blocking — email failures don't affect payment success.
 */
async function notifyVipUpgrade(
  supabase: SupabaseClient,
  userId: string,
  userEmail: string,
  durationDays: number
): Promise<void> {
  try {
    const profile = await fetchProfileForEmail(supabase, userId);
    const planExpiresAt = profile?.planExpiresAt
      ? profile.planExpiresAt
      : new Date(Date.now() + durationDays * 86_400_000).toISOString();

    await sendVipUpgradeEmail({
      userEmail,
      userName: profile?.displayName ?? null,
      planName: 'Pro',
      durationDays,
      planExpiresAt,
    });
  } catch (err) {
    // Email is non-critical — log and continue
    console.error('notifyVipUpgrade failed:', err);
  }
}

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
    console.error('PayOS webhook signature mismatch');
    return { status: 400, body: { error: 'Chữ ký không hợp lệ' } };
  }

  if (!isWebhookPaymentSuccess(payload)) {
    return { status: 200, body: { success: true, ignored: true } };
  }

  const orderCode = normalizeOrderCode(payload.data?.orderCode);
  if (orderCode == null) {
    return { status: 400, body: { error: 'Thiếu orderCode' } };
  }

  const supabase = getSupabaseAdmin();

  const { data: payment, error: fetchError } = await supabase
    .from('payments')
    .select('user_id, status, duration_days')
    .eq('order_code', orderCode)
    .maybeSingle();

  if (fetchError || !payment) {
    return { status: 404, body: { error: 'Không tìm thấy đơn hàng' } };
  }

  if (payment.status === 'paid') {
    return { status: 200, body: { success: true, alreadyPaid: true } };
  }

  const durationDays =
    typeof payment.duration_days === 'number' && payment.duration_days > 0
      ? payment.duration_days
      : PRO_DURATION_DAYS;

  const { activated, error: activateError } = await activateProForOrder(
    supabase,
    payment.user_id,
    orderCode,
    (payload.data as Record<string, unknown>) ?? null,
    durationDays
  );

  if (activateError) {
    return { status: 500, body: { error: 'Kích hoạt Pro thất bại', detail: activateError } };
  }

  if (!activated) {
    return { status: 200, body: { success: true, alreadyPaid: true } };
  }

  // Send VIP upgrade email (non-blocking, fire-and-forget)
  // Webhook has user_id from payment record; look up email via admin API
  const { data: userData } = await supabase.auth.admin.getUserById(payment.user_id);
  if (userData?.user?.email) {
    notifyVipUpgrade(supabase, payment.user_id, userData.user.email, durationDays).catch((err) =>
      console.error('Webhook email notification failed:', err)
    );
  }

  return { status: 200, body: { success: true } };
}

/** Fallback when webhook is delayed or signature/env issues blocked activation. */
export async function handlePaymentConfirm(
  authHeader: string | undefined,
  body: unknown
): Promise<PaymentHandlerResult> {
  const missingEnv = getMissingPaymentEnv();
  if (missingEnv) {
    return { status: 503, body: paymentConfigErrorBody(missingEnv) };
  }

  const user = await getUserFromBearerToken(authHeader);
  if (!user) {
    return { status: 401, body: { error: 'Unauthorized' } };
  }

  const orderCode = normalizeOrderCode(
    (body as { orderCode?: unknown })?.orderCode
  );
  if (orderCode == null) {
    return { status: 400, body: { error: 'Thiếu orderCode hợp lệ' } };
  }

  const supabase = getSupabaseAdmin();

  const { data: payment, error: fetchError } = await supabase
    .from('payments')
    .select('user_id, status, duration_days')
    .eq('order_code', orderCode)
    .eq('user_id', user.id)
    .maybeSingle();

  if (fetchError || !payment) {
    return { status: 404, body: { error: 'Không tìm thấy đơn hàng' } };
  }

  if (payment.status === 'paid') {
    return { status: 200, body: { success: true, alreadyPaid: true, plan: 'pro' } };
  }

  const payosInfo = await fetchPaymentRequestInfo(orderCode);
  if (!payosInfo || !isPayosPaymentPaid(payosInfo)) {
    return {
      status: 402,
      body: {
        error: 'PayOS chưa xác nhận thanh toán',
        payosStatus: payosInfo?.status ?? null,
      },
    };
  }

  const durationDays =
    typeof payment.duration_days === 'number' && payment.duration_days > 0
      ? payment.duration_days
      : PRO_DURATION_DAYS;

  const { activated, error: activateError } = await activateProForOrder(
    supabase,
    payment.user_id,
    orderCode,
    payosInfo as unknown as Record<string, unknown>,
    durationDays
  );

  if (activateError) {
    return { status: 500, body: { error: 'Kích hoạt Pro thất bại', detail: activateError } };
  }

  if (!activated) {
    return { status: 200, body: { success: true, alreadyPaid: true, plan: 'pro' } };
  }

  // Send VIP upgrade email (non-blocking, fire-and-forget)
  if (user.email) {
    notifyVipUpgrade(supabase, payment.user_id, user.email, durationDays).catch((err) =>
      console.error('Confirm email notification failed:', err)
    );
  }

  return { status: 200, body: { success: true, plan: 'pro' } };
}