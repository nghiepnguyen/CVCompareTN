import { describe, it, expect, vi, beforeEach } from 'vitest';

const { send, getUser, limit, subject } = vi.hoisted(() => ({
  send: vi.fn(),
  getUser: vi.fn(),
  limit: vi.fn(),
  subject: vi.fn(),
}));

vi.mock('resend', () => ({
  Resend: class {
    emails = { send };
  },
}));
vi.mock('../../payment/supabaseAdmin.js', () => ({
  getUserFromBearerToken: (h: string | undefined) => getUser(h),
}));
vi.mock('../../rateLimit.js', () => ({ enforceRateLimit: limit, rateLimitSubject: subject }));

import { handleSendWelcomeEmail } from '../handlers.js';

describe('handleSendWelcomeEmail', () => {
  beforeEach(() => {
    send.mockReset().mockResolvedValue({ error: null });
    getUser.mockReset();
    limit.mockReset().mockResolvedValue(true);
    subject.mockReset().mockReturnValue(null);
    process.env.RESEND_API_KEY = 'test-key';
  });

  it('returns 401 without a valid token and does not send', async () => {
    getUser.mockResolvedValue(null);
    const r = await handleSendWelcomeEmail({ type: 'welcome', userName: 'A' }, undefined);
    expect(r.status).toBe(401);
    expect(send).not.toHaveBeenCalled();
  });

  it('sends only to the token user email, ignoring body userEmail', async () => {
    getUser.mockResolvedValue({ id: 'u1', email: 'a@x.com' });
    const r = await handleSendWelcomeEmail(
      { type: 'welcome', userEmail: 'victim@y.com', userName: 'A' },
      'Bearer t'
    );
    expect(r.status).toBe(200);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].to).toEqual(['a@x.com']);
  });

  it('returns 400 when token user has no email', async () => {
    getUser.mockResolvedValue({ id: 'u1' });
    const r = await handleSendWelcomeEmail({ userName: 'A' }, 'Bearer t');
    expect(r.status).toBe(400);
    expect(send).not.toHaveBeenCalled();
  });

  it('returns 429 and does not send when the shared limiter denies the user', async () => {
    getUser.mockResolvedValue({ id: '550e8400-e29b-41d4-a716-446655440000', email: 'a@x.com' });
    subject.mockReturnValue('u:550e8400-e29b-41d4-a716-446655440000');
    limit.mockResolvedValue(false);
    const r = await handleSendWelcomeEmail({ userName: 'A' }, 'Bearer t');
    expect(r.status).toBe(429);
    expect(limit).toHaveBeenCalledWith({
      bucket: 'send_email_welcome',
      subject: 'u:550e8400-e29b-41d4-a716-446655440000',
    });
    expect(send).not.toHaveBeenCalled();
  });
});
