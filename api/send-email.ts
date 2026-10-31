import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleSendFeedback, handleSendWelcomeEmail } from '../_server-lib/email/handlers.js';
import { clientIpFromHeaders } from '../_server-lib/rateLimit.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  // req.body is a lazy getter that throws on a malformed Content-Type.
  let type: unknown;
  try {
    ({ type } = req.body ?? {});
  } catch {
    return res.status(400).json({ success: false, message: 'Invalid request body' });
  }

  try {
    if (type === 'feedback') {
      const result = await handleSendFeedback(req.body, { ip: clientIpFromHeaders(req.headers) });
      return res.status(result.status).json(result.body);
    }
    if (type === 'welcome') {
      const result = await handleSendWelcomeEmail(req.body, req.headers.authorization);
      return res.status(result.status).json(result.body);
    }
    return res.status(400).json({ success: false, message: 'Invalid type. Use "feedback" or "welcome".' });
  } catch (error: unknown) {
    console.error('send-email [%s] error:', type, error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}
