// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

let pendingCount = 0;
const insert = vi.fn();
vi.mock('../supabaseAdmin.js', () => ({
  getUserFromBearerToken: async () => ({ id: 'u1', email: 'u1@example.test' }),
  getSupabaseAdmin: () => ({
    from: (table: string) => table === 'payments'
      ? {
        insert,
        select: () => {
          const b = { eq: () => b, gte: () => b, then: (r: (v: unknown) => unknown) => Promise.resolve({ count: pendingCount, error: null }).then(r) };
          return b;
        },
      }
      : { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { plan: 'free', plan_expires_at: null } }) }) }) },
  }),
}));

const createPayosPaymentLink = vi.fn();
vi.mock('../payos.js', async (orig) => ({
  ...(await orig<typeof import('../payos.js')>()),
  createPayosPaymentLink: (...a: unknown[]) => createPayosPaymentLink(...a),
}));

import { handlePaymentCreate } from '../handlers.js';

beforeEach(() => {
  pendingCount = 0;
  insert.mockReset().mockResolvedValue({ error: null });
  createPayosPaymentLink.mockReset().mockResolvedValue({ checkoutUrl: 'https://pay.example/x', orderCode: 777 });
  Object.assign(process.env, {
    PAYOS_CLIENT_ID: 'c', PAYOS_API_KEY: 'k', PAYOS_CHECKSUM_KEY: 'checksum', SUPABASE_SERVICE_ROLE_KEY: 's', SUPABASE_URL: 'https://x',
  });
});

describe('payment create', () => {
  it('creates a PayOS link and a pending order', async () => {
    const res = await handlePaymentCreate('Bearer t', 'pro');
    expect(res).toMatchObject({ status: 200, body: { checkoutUrl: 'https://pay.example/x', orderCode: 777 } });
    expect(insert).toHaveBeenCalledOnce();
  });

  it('429 once the user has 5 pending orders in the last 15 minutes, without calling PayOS', async () => {
    pendingCount = 5;
    const res = await handlePaymentCreate('Bearer t', 'pro');
    expect(res.status).toBe(429);
    expect(createPayosPaymentLink).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });
});
