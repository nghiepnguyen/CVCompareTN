import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../payment/supabaseAdmin.js', () => ({
  getSupabaseAdmin: () => ({ rpc: mocks.rpc }),
}));

import {
  clientIpFromHeaders,
  enforceRateLimit,
  normalizeIp,
  rateLimitSubject,
} from '../rateLimit.js';

beforeEach(() => {
  mocks.rpc.mockReset();
  vi.stubEnv('RATE_LIMIT_SALT', 'test-salt');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('normalizeIp', () => {
  it.each([
    ['203.0.113.7', '203.0.113.7'],
    ['203.0.113.7:443', '203.0.113.7'],
    ['::ffff:203.0.113.7', '203.0.113.7'],
    ['[2001:db8::1]:443', '2001:db8::1'],
    [' 2001:DB8::1 ', '2001:db8::1'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeIp(input)).toBe(expected);
  });

  it.each([null, undefined, '', 'not-an-ip', '1.2.3.4.5', '[invalid'])('rejects %s', (input) => {
    expect(normalizeIp(input as string | null | undefined)).toBeNull();
  });
});

describe('clientIpFromHeaders', () => {
  it('uses the leftmost sanitised forwarded hop on Vercel', () => {
    expect(clientIpFromHeaders({ 'x-forwarded-for': '203.0.113.7, 198.51.100.9' })).toBe('203.0.113.7');
    expect(clientIpFromHeaders({ 'x-forwarded-for': 'spoofed, 203.0.113.7' })).toBe('203.0.113.7');
  });

  it('falls back to x-real-ip when the forwarded header is absent', () => {
    expect(clientIpFromHeaders({ 'x-real-ip': '198.51.100.4' })).toBe('198.51.100.4');
  });

  it('accepts array headers and ignores invalid values', () => {
    expect(clientIpFromHeaders({ 'x-forwarded-for': ['junk', '203.0.113.7'] })).toBe('203.0.113.7');
  });

  it('returns null without usable headers', () => {
    expect(clientIpFromHeaders(undefined)).toBeNull();
    expect(clientIpFromHeaders({})).toBeNull();
    expect(clientIpFromHeaders({ 'x-forwarded-for': 'unknown' })).toBeNull();
  });
});

describe('rateLimitSubject', () => {
  it('prefers the signed-in user id', () => {
    const subject = rateLimitSubject('A1B2C3D4-E5F6-4789-8ABC-DEF012345678', '203.0.113.7');
    expect(subject).toBe('u:a1b2c3d4-e5f6-4789-8abc-def012345678');
  });

  it('hashes anonymous IPs and never stores the raw value', () => {
    const subject = rateLimitSubject(null, '203.0.113.7');
    expect(subject).toMatch(/^ip:[0-9a-f]{32}$/);
    expect(subject).not.toContain('203.0.113.7');
    expect(rateLimitSubject(null, '203.0.113.7')).toBe(subject);
    expect(rateLimitSubject(null, '203.0.113.8')).not.toBe(subject);
  });

  it('falls back to the service-role key when no dedicated salt is set', () => {
    vi.stubEnv('RATE_LIMIT_SALT', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
    expect(rateLimitSubject(null, '203.0.113.7')).toMatch(/^ip:[0-9a-f]{32}$/);
  });

  it('skips anonymous limiting without a hashing secret', () => {
    vi.stubEnv('RATE_LIMIT_SALT', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    expect(rateLimitSubject(null, '203.0.113.7')).toBeNull();
  });

  it('ignores invalid ids and IPs', () => {
    expect(rateLimitSubject('owner', 'not-an-ip')).toBeNull();
    expect(rateLimitSubject()).toBeNull();
  });
});

describe('enforceRateLimit', () => {
  it('allows without a subject and does not call the database', async () => {
    expect(await enforceRateLimit({ bucket: 'storage', subject: null })).toBe(true);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('passes bucket limits to the RPC and returns its decision', async () => {
    mocks.rpc.mockResolvedValue({ data: [{ allowed: true, remaining: 4, retry_after: 0 }], error: null });
    expect(await enforceRateLimit({ bucket: 'send_email_feedback', subject: 'u:abc' })).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith('consume_api_rate_limit', {
      p_subject: 'u:abc',
      p_bucket: 'send_email_feedback',
      p_limit: 5,
      p_window_seconds: 3600,
    });

    mocks.rpc.mockResolvedValue({ data: [{ allowed: false, remaining: 0, retry_after: 60 }], error: null });
    expect(await enforceRateLimit({ bucket: 'storage', subject: 'u:abc' })).toBe(false);
  });

  it('fails open on RPC errors and malformed responses', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'private upstream detail' } });
    expect(await enforceRateLimit({ bucket: 'storage', subject: 'u:abc' })).toBe(true);

    mocks.rpc.mockResolvedValue({ data: [{ allowed: 'yes' }], error: null });
    expect(await enforceRateLimit({ bucket: 'storage', subject: 'u:abc' })).toBe(true);
  });

  it('bounds stalled lookups and keeps the API available', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.useFakeTimers();
    mocks.rpc.mockImplementation(() => new Promise(() => {}));
    const pending = enforceRateLimit({ bucket: 'extract_pdf', subject: 'ip:abc' });
    await vi.advanceTimersByTimeAsync(1500);
    expect(await pending).toBe(true);
  });
});
