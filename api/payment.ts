import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors, handlePreflight, rejectOversizedBody, BODY_LIMITS } from '../_server-lib/http/guard.js';
import { handlePaymentCreate, handlePaymentConfirm, handlePaymentWebhook } from '../_server-lib/payment/handlers.js';
import type { PlanType } from '../_server-lib/payment/payos.js';
import { initSentryServer, Sentry } from '../_server-lib/sentry.js';

/**
 * Unified payment handler — dispatches by URL path segment.
 *
 * Vercel rewrite maps /api/payment/{action} → /api/payment.ts
 * The original path is still available via req.url, so we parse the last segment.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  initSentryServer();

  applyCors(req, res);
  if (handlePreflight(req, res)) return;

  // Parse action from the last path segment (e.g., /api/payment/create → create)
  const urlPath = new URL(req.url || '', `https://${req.headers.host}`).pathname;
  const segments = urlPath.replace(/\/$/, '').split('/');
  const action = segments[segments.length - 1] || '';

  if (rejectOversizedBody(req, res, BODY_LIMITS.json)) return;

  switch (action) {
    case 'create': {
      if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  if (rejectOversizedBody(req, res, BODY_LIMITS.json)) return;
      try {
        const authHeader =
          typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined;
        const body = req.body as { planType?: string } | undefined;
        const planType: PlanType = body?.planType === 'recruiter' ? 'recruiter' : 'pro';
        const result = await handlePaymentCreate(authHeader, planType);
        return res.status(result.status).json(result.body);
      } catch (err) {
        Sentry.captureException(err, { tags: { route: 'payment/create' } });
        console.error('payment/create error:', err);
        // Vercel may freeze the function after the response; send the event first.
        await Sentry.flush(2000);
        const message = err instanceof Error ? err.message : 'Server error';
        if (message.includes('not configured')) {
          return res.status(503).json({
            error: 'Cấu hình thanh toán chưa sẵn sàng trên server',
          });
        }
        return res.status(500).json({
          error: 'Không tạo được link thanh toán',
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
        Sentry.captureException(err, { tags: { route: 'payment/confirm' } });
        console.error('payment/confirm error:', err);
        await Sentry.flush(2000);
        return res.status(500).json({ error: 'Xác nhận thanh toán thất bại' });
      }
    }

    case 'webhook': {
      if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });
      try {
        const result = await handlePaymentWebhook(req.body);
        return res.status(result.status).json(result.body);
      } catch (err) {
        Sentry.captureException(err, { tags: { route: 'payment/webhook' } });
        console.error('payment/webhook error:', err);
        await Sentry.flush(2000);
        return res.status(500).json({ error: 'Webhook processing failed' });
      }
    }

    default:
      return res.status(404).json({ error: 'Unknown payment action', action });
  }
}