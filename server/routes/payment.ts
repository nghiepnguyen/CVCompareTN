import { Router } from 'express';
import { handlePaymentCreate, handlePaymentWebhook } from '../lib/paymentHandlers';

const router = Router();

router.post('/create', async (req, res) => {
  try {
    const result = await handlePaymentCreate(req.headers.authorization);
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

export default router;
