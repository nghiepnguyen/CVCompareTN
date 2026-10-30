import { handleStorage } from '../_server-lib/storage/handler.js';
import { runStorageCleanup, validCleanupSecret } from '../_server-lib/storage/cleanup.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleExtractPdf } from '../_server-lib/pdf/handler.js';
import { initSentryServer, Sentry } from '../_server-lib/sentry.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  initSentryServer();

  if (req.query?.resource === 'storage') {
    res.setHeader('Cache-Control', 'private, no-store');
    const auth = typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined;
    if (req.method === 'GET' && req.query?.action === 'cleanup') {
      if (!validCleanupSecret(auth)) return res.status(401).json({ error: 'Unauthorized' });
      try {
        const result = await runStorageCleanup();
        return res.status(result.failed ? 503 : 200).json(result);
      }
      catch (err) { Sentry.captureException(err); return res.status(500).json({ error: 'Cleanup failed' }); }
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const result = await handleStorage(auth, req.body);
    return res.status(result.status).json(result.body);
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const authHeader =
      typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined;
    const result = await handleExtractPdf(authHeader, req.body);
    return res.status(result.status).json(result.body);
  } catch (error: unknown) {
    Sentry.captureException(error, { tags: { route: 'extract-pdf' } });
    console.error('PDF extraction error:', error);
    return res.status(500).json({ error: 'Không thể trích xuất PDF. Vui lòng thử lại.' });
  }
}
