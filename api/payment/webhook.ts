import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handlePaymentWebhook } from '../../lib/payment/handlers';

export const config = {
  runtime: 'nodejs',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const result = await handlePaymentWebhook(req.body);
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error('payment/webhook error:', err);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
}
