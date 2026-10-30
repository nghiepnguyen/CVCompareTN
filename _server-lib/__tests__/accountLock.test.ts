import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ result: vi.fn(), count: vi.fn() }));
vi.mock('../payment/supabaseAdmin.js', () => ({
  getSupabaseAdmin: () => ({ from: (table: string) => {
    const b = { select: () => b, eq: () => b, gte: () => b, abortSignal: () => b, maybeSingle: mocks.result, then: (resolve: (v: unknown) => unknown) => Promise.resolve(mocks.count()).then(resolve) };
    return b;
  } }),
}));
import { checkAccountAccess, checkAiAccess } from '../accountLock.js';

beforeEach(() => {
  mocks.result.mockReset().mockResolvedValue({ data: { role: 'user', has_permission: true, plan: 'free', plan_expires_at: null }, error: null });
  mocks.count.mockReset().mockReturnValue({ count: 0, error: null });
});
afterEach(() => vi.useRealTimers());

describe('server account lock', () => {
  it('allows an active user and exempts admins from the lock', async () => {
    expect(await checkAccountAccess('u1')).toBe('ok');
    mocks.result.mockResolvedValue({ data: { role: 'admin', has_permission: false }, error: null });
    expect(await checkAccountAccess('u1')).toBe('ok');
  });
  it('denies a locked user', async () => {
    mocks.result.mockResolvedValue({ data: { role: 'user', has_permission: false }, error: null });
    expect(await checkAccountAccess('u1')).toBe('locked');
  });
  it.each([{ data: null, error: null }, { data: null, error: { message: 'private' } }, { data: {}, error: null }])('fails closed for missing/error profile: %j', async result => {
    mocks.result.mockResolvedValue(result);
    expect(await checkAccountAccess('u1')).toBe('unavailable');
    expect(await checkAiAccess('u1', 'parse_cv', 100)).toBe('unavailable');
  });
  it('bounds stalled profile checks', async () => {
    vi.useFakeTimers();
    mocks.result.mockImplementation(() => new Promise(() => {}));
    const result = checkAccountAccess('u1');
    await vi.advanceTimersByTimeAsync(4000);
    expect(await result).toBe('unavailable');
  });
});
