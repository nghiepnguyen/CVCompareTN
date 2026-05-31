import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handlePaymentCreate } from './lib/handlers.js';
import type { PlanType } from './lib/payos.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const authHeader =
      typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined;
    const body = req.body as { planType?: string } | undefined;
    const planType: PlanType = body?.planType === 'recruiter' ? 'recruiter' : 'pro';
    const result = await handlePaymentCreate(authHeader, planType);
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error('payment/create error:', err);
    const message = err instanceof Error ? err.message : 'Server error';
    if (message.includes('not configured')) {
      return res.status(503).json({
        error: 'Cấu hình thanh toán chưa sẵn sàng trên server',
        detail: message,
      });
    }
    return res.status(500).json({
      error: 'Không tạo được link thanh toán',
      detail: message,
    });
  }
}
