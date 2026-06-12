import { Router } from 'express';
import {
  handlePaymentConfirm,
  handlePaymentCreate,
  handlePaymentWebhook,
} from '../../_server-lib/payment/handlers';

const router = Router();

router.post('/create', async (req, res) => {
  try {
    const body = req.body as { planType?: string } | undefined;
    const planType = body?.planType === 'recruiter' ? 'recruiter' as const : 'pro' as const;
    const result = await handlePaymentCreate(req.headers.authorization, planType);
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error('payment/create error:', err);
    const message = err instanceof Error ? err.message : 'Server error';
    if (message.includes('not configured')) {
      return res.status(500).json({ error: 'Cấu hình thanh toán chưa sẵn sàng' });
    }
    return res.status(500).json({ error: 'Không tạo được link thanh toán' });
  }
});

router.post('/webhook', async (req, res) => {
  try {
    const result = await handlePaymentWebhook(req.body);
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error('payment/webhook error:', err);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
});

router.post('/confirm', async (req, res) => {
  try {
    const result = await handlePaymentConfirm(req.headers.authorization, req.body);
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error('payment/confirm error:', err);
    return res.status(500).json({ error: 'Xác nhận thanh toán thất bại' });
  }
});

export default router;
