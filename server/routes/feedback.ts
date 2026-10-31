import { Router } from 'express';
import { handleSendFeedback } from '../../_server-lib/email/handlers';
import { clientIpFromHeaders } from '../../_server-lib/rateLimit';

const router = Router();

router.post('/', async (req, res) => {
  try {
    const result = await handleSendFeedback(req.body, { ip: clientIpFromHeaders(req.headers) });
    return res.status(result.status).json(result.body);
  } catch (error: unknown) {
    console.error('Feedback submission error:', error);
    return res.status(500).json({ success: false, message: 'Không thể gửi email. Vui lòng thử lại.' });
  }
});

export default router;
