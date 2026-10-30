import { Router } from 'express';
import { handleRewriteCv } from '../../_server-lib/rewriteCv/handler';

const router = Router();

router.post('/', async (req, res) => {
  try {
    const authHeader =
      typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined;
    const result = await handleRewriteCv(authHeader, req.body);
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error('rewrite-cv route error:', err);
    return res.status(500).json({ error: 'Không thể viết lại CV. Vui lòng thử lại.' });
  }
});

export default router;
