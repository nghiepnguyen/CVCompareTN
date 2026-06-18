import { Router } from 'express';
import { handleExtractPdf } from '../../_server-lib/pdf/handler';

const router = Router();

router.post('/', async (req, res) => {
  try {
    const authHeader =
      typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined;
    const result = await handleExtractPdf(authHeader, req.body);
    return res.status(result.status).json(result.body);
  } catch (error: unknown) {
    console.error('PDF extraction error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ error: `Failed to extract PDF: ${message}` });
  }
});

export default router;
