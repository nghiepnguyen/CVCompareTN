// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
const payment = { user_id: 'u1', status: 'pending', duration_days: 30, plan: 'pro', amount: 69000 };
vi.mock('../supabaseAdmin.js', () => ({
  getUserFromBearerToken: vi.fn(),
  getSupabaseAdmin: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: payment, error: null }) }) }) }),
    rpc,
    auth: { admin: { getUserById: async () => ({ data: { user: null } }) } },
  }),
}));

import { handlePaymentWebhook } from '../handlers.js';
import { createSignatureFromObject } from '../payos.js';

function ictNow(): string {
  const d = new Date(Date.now() + 7 * 3600_000);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

function webhook(data: Record<string, unknown>, top: Record<string, unknown> = { code: '00', success: true }) {
  return { ...top, data, signature: createSignatureFromObject(data) };
}

const paid = () => ({
  orderCode: 555, amount: 69000, description: 'cvfit pro', transactionDateTime: ictNow(), code: '00', desc: 'success',
});

beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: true, error: null });
  Object.assign(process.env, {
    PAYOS_CLIENT_ID: 'c', PAYOS_API_KEY: 'k', PAYOS_CHECKSUM_KEY: 'checksum', SUPABASE_SERVICE_ROLE_KEY: 's', SUPABASE_URL: 'https://x',
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('PayOS webhook', () => {
  it('activates a signed successful payment', async () => {
    const res = await handlePaymentWebhook(webhook(paid()));
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('activate_pro_plan', expect.objectContaining({ p_order_code: 555 }));
  });

  it('ignores a failed payment even when the unsigned top-level code says success', async () => {
    const res = await handlePaymentWebhook(webhook({ ...paid(), code: '01', desc: 'failed' }, { code: '00', success: true }));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ignored: true });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejects a tampered signature', async () => {
    const body = webhook(paid());
    body.signature = body.signature.replace(/.$/, (c) => (c === '0' ? '1' : '0'));
    const res = await handlePaymentWebhook(body);
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejects a signature of the wrong length without throwing', async () => {
    const res = await handlePaymentWebhook({ ...webhook(paid()), signature: 'abc' });
    expect(res.status).toBe(400);
  });

  it('does not activate when the paid amount differs from the order amount', async () => {
    const res = await handlePaymentWebhook(webhook({ ...paid(), amount: 1000 }));
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
});
