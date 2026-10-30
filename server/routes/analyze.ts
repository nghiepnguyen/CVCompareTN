import { Router } from 'express';
import { handleAnalyze } from '../../_server-lib/analyze/handler';

const router = Router();

router.post('/', async (req, res) => {
  try {
    const authHeader =
      typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined;
    const result = await handleAnalyze(authHeader, req.body);
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error('analyze route error:', err);
    return res.status(500).json({ error: 'Không thể phân tích CV. Vui lòng thử lại.' });
  }
});

export default router;
