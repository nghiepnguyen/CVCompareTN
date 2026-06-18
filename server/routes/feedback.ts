import { Router } from 'express';
import { handleSendFeedback } from '../../_server-lib/email/handlers';

const router = Router();

router.post('/', async (req, res) => {
  try {
    const result = await handleSendFeedback(req.body);
    return res.status(result.status).json(result.body);
  } catch (error: unknown) {
    console.error('Feedback submission error:', error);
    return res.status(500).json({ success: false, message: `System error: ${error instanceof Error ? error.message : String(error)}` });
  }
});

export default router;
