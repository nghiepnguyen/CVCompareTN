import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handlePaymentConfirm } from './lib/handlers.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const result = await handlePaymentConfirm(
      req.headers.authorization as string | undefined,
      req.body
    );
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error('payment/confirm error:', err);
    return res.status(500).json({ error: 'Xác nhận thanh toán thất bại' });
  }
}
