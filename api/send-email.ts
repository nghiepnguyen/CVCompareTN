import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleSendFeedback, handleSendWelcomeEmail } from '../_server-lib/email/handlers.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  const { type } = req.body ?? {};

  try {
    if (type === 'feedback') {
      const result = await handleSendFeedback(req.body);
      return res.status(result.status).json(result.body);
    }
    if (type === 'welcome') {
      const result = await handleSendWelcomeEmail(req.body);
      return res.status(result.status).json(result.body);
    }
    return res.status(400).json({ success: false, message: 'Invalid type. Use "feedback" or "welcome".' });
  } catch (error: unknown) {
    console.error('send-email [%s] error:', type, error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}
