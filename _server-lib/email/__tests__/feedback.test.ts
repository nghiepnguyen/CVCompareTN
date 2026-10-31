import { beforeEach, describe, expect, it, vi } from 'vitest';

const { send, limit, subject, verifyCaptcha } = vi.hoisted(() => ({
  send: vi.fn(),
  limit: vi.fn(),
  subject: vi.fn(),
  verifyCaptcha: vi.fn(),
}));

vi.mock('resend', () => ({
  Resend: class {
    emails = { send };
  },
}));
vi.mock('../../rateLimit.js', () => ({ enforceRateLimit: limit, rateLimitSubject: subject }));
vi.mock('../../recaptcha.js', () => ({ verifyRecaptcha: verifyCaptcha }));

import { handleSendFeedback } from '../handlers.js';

const validBody = {
  token: 'captcha-token',
  rating: 5,
  title: 'Sản phẩm tốt',
  content: 'Phân tích hữu ích',
  userEmail: 'a@x.com',
};

beforeEach(() => {
  send.mockReset().mockResolvedValue({ error: null });
  limit.mockReset().mockResolvedValue(true);
  subject.mockReset().mockReturnValue('ip:hashed');
  verifyCaptcha.mockReset().mockResolvedValue({ ok: true });
  process.env.RESEND_API_KEY = 'test-key';
});

describe('handleSendFeedback', () => {
  it('returns 429 before reCAPTCHA and Resend when the shared limiter denies the IP', async () => {
    limit.mockResolvedValue(false);
    const r = await handleSendFeedback(validBody, { ip: '203.0.113.7' });
    expect(r.status).toBe(429);
    expect(subject).toHaveBeenCalledWith(null, '203.0.113.7');
    expect(limit).toHaveBeenCalledWith({ bucket: 'send_email_feedback', subject: 'ip:hashed' });
    expect(verifyCaptcha).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('sends after reCAPTCHA when the limiter allows the IP', async () => {
    const r = await handleSendFeedback(validBody, { ip: '203.0.113.7' });
    expect(r.status).toBe(200);
    expect(verifyCaptcha).toHaveBeenCalledWith('captcha-token', 'feedback');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid input before consuming a rate-limit slot', async () => {
    const r = await handleSendFeedback({ ...validBody, userEmail: 'not-an-email' }, { ip: '203.0.113.7' });
    expect(r.status).toBe(400);
    expect(limit).not.toHaveBeenCalled();
    expect(verifyCaptcha).not.toHaveBeenCalled();
  });
});
