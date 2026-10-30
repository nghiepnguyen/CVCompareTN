import { Router } from 'express';
import { handleParseCv } from '../../_server-lib/parseCv/handler';

const router = Router();

router.post('/', async (req, res) => {
  try {
    const authHeader =
      typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined;
    const result = await handleParseCv(authHeader, req.body);
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error('parse-cv route error:', err);
    return res.status(500).json({ error: 'Không thể đọc thông tin CV. Vui lòng thử lại.' });
  }
});

export default router;
