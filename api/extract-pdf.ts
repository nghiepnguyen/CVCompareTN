import { handleStorage } from '../_server-lib/storage/handler.js';
import { applyCors, handlePreflight, rejectOversizedBody, BODY_LIMITS } from '../_server-lib/http/guard.js';
import { runStorageCleanup, validCleanupSecret } from '../_server-lib/storage/cleanup.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleExtractPdf } from '../_server-lib/pdf/handler.js';
import { clientIpFromHeaders } from '../_server-lib/rateLimit.js';
import { initSentryServer, Sentry } from '../_server-lib/sentry.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  initSentryServer();

  applyCors(req, res);
  if (handlePreflight(req, res)) return;
  if (rejectOversizedBody(req, res, BODY_LIMITS.pdf)) return;

  if (req.query?.resource === 'storage') {
    res.setHeader('Cache-Control', 'private, no-store');
    const auth = typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined;
    if (req.method === 'GET' && req.query?.action === 'cleanup') {
      if (!validCleanupSecret(auth)) return res.status(401).json({ error: 'Unauthorized' });
      try {
        const result = await runStorageCleanup();
        return res.status(result.failed ? 503 : 200).json(result);
      }
      catch (err) { Sentry.captureException(err); await Sentry.flush(2000); return res.status(500).json({ error: 'Cleanup failed' }); }
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
    const result = await handleExtractPdf(authHeader, req.body, {
      ip: clientIpFromHeaders(req.headers),
    });
    return res.status(result.status).json(result.body);
  } catch (error: unknown) {
    Sentry.captureException(error, { tags: { route: 'extract-pdf' } });
    console.error('PDF extraction error:', error);
    // Vercel may freeze the function after the response; send the event first.
    await Sentry.flush(2000);
    return res.status(500).json({ error: 'Không thể trích xuất PDF. Vui lòng thử lại.' });
  }
}
