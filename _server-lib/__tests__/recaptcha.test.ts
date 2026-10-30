import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { verifyRecaptcha } from '../recaptcha.js';

vi.mock('axios', () => ({ default: { post: vi.fn() } }));
const post = vi.mocked(axios.post);
const valid = { success: true, score: 0.9, hostname: 'cvfit.pro', action: 'feedback' };

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('RECAPTCHA_SECRET_KEY', 'fixture-secret');
  vi.stubEnv('RECAPTCHA_ALLOWED_HOSTNAMES', 'cvfit.pro,www.cvfit.pro');
  post.mockReset().mockResolvedValue({ data: valid });
});
afterEach(() => vi.unstubAllEnvs());

describe('verifyRecaptcha', () => {
  it('accepts a valid v3 token and bounds the verification call', async () => {
    expect(await verifyRecaptcha('fixture-token', 'feedback')).toEqual({ ok: true });
    expect(post).toHaveBeenCalledWith(expect.any(String), expect.any(URLSearchParams), { timeout: 5000 });
  });

  it.each([
    { success: false }, { score: 0.1 }, { score: undefined }, { score: NaN },
    { score: 1.1 }, { hostname: undefined }, { hostname: 'cvfit.pro.attacker.test' },
    { action: undefined }, { action: 'extract_pdf' },
  ])('rejects invalid verification fields: %j', async fields => {
    post.mockResolvedValue({ data: { ...valid, ...fields } });
    expect(await verifyRecaptcha('fixture-token', 'feedback')).toMatchObject({ ok: false, status: 403 });
  });

  it('does not bypass verification in development', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    post.mockResolvedValue({ data: { success: false } });
    expect(await verifyRecaptcha('fixture-token', 'feedback')).toMatchObject({ ok: false, status: 403 });
    expect(post).toHaveBeenCalledOnce();
  });

  it('fails closed without a server secret', async () => {
    vi.stubEnv('RECAPTCHA_SECRET_KEY', '');
    expect(await verifyRecaptcha('fixture-token', 'feedback')).toMatchObject({ ok: false, status: 503 });
    expect(post).not.toHaveBeenCalled();
  });

  it('returns a safe service error on network failure', async () => {
    post.mockRejectedValue(new Error('private upstream response'));
    const result = await verifyRecaptcha('fixture-token', 'feedback');
    expect(result).toMatchObject({ ok: false, status: 503 });
    expect(JSON.stringify(result)).not.toContain('private upstream response');
  });

  it('rejects malformed input before contacting Google', async () => {
    expect(await verifyRecaptcha('', 'feedback')).toMatchObject({ ok: false, status: 400 });
    expect(post).not.toHaveBeenCalled();
  });
});
