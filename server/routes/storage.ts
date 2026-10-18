import { Router } from 'express';
import { handleStorage } from '../../_server-lib/storage/handler';
import { runStorageCleanup, validCleanupSecret } from '../../_server-lib/storage/cleanup';
const router = Router();
router.post('/', async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  const result = await handleStorage(req.headers.authorization, req.body);
  res.status(result.status).json(result.body);
});
router.get('/', async (req, res) => {
  if (req.query.action !== 'cleanup' || !validCleanupSecret(req.headers.authorization)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const result = await runStorageCleanup();
    return res.status(result.failed ? 503 : 200).json(result);
  }
  catch { return res.status(500).json({ error: 'Cleanup failed' }); }
});
export default router;
