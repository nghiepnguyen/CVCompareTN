// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

vi.mock('../../_server-lib/email/handlers.js', () => ({
  handleSendFeedback: vi.fn(),
  handleSendWelcomeEmail: vi.fn(),
}));

import handler from '../send-email.js';

describe('api/send-email', () => {
  it('answers JSON instead of crashing when the body cannot be parsed (malformed Content-Type)', async () => {
    const req = {
      method: 'POST',
      headers: {},
      get body() { throw new TypeError('invalid media type'); },
    } as unknown as VercelRequest;
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await handler(req, { status } as unknown as VercelResponse);

    expect(status).toHaveBeenCalledWith(400);
  });
});
