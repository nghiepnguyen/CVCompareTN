import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handlePaymentCreate, handlePaymentConfirm, handlePaymentWebhook } from '../_server-lib/payment/handlers.js';
import type { PlanType } from '../_server-lib/payment/payos.js';

/**
 * Unified payment handler — dispatches by URL path segment.
 *
 * Vercel rewrite maps /api/payment/{action} → /api/payment.ts
 * The original path is still available via req.url, so we parse the last segment.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Parse action from the last path segment (e.g., /api/payment/create → create)
  const urlPath = new URL(req.url || '', `https://${req.headers.host}`).pathname;
  const segments = urlPath.replace(/\/$/, '').split('/');
  const action = segments[segments.length - 1] || '';

  switch (action) {
    case 'create': {
      if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });
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

    case 'confirm': {
      if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });
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

    case 'webhook': {
      if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });
      try {
        const result = await handlePaymentWebhook(req.body);
        return res.status(result.status).json(result.body);
      } catch (err) {
        console.error('payment/webhook error:', err);
        return res.status(500).json({ error: 'Webhook processing failed' });
      }
    }

    default:
      return res.status(404).json({ error: 'Unknown payment action', action });
  }
}