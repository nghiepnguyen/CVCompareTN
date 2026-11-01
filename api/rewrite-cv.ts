import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors, handlePreflight, rejectOversizedBody, BODY_LIMITS } from '../_server-lib/http/guard.js';
import { handleRewriteCv } from '../_server-lib/rewriteCv/handler.js';
import { initSentryServer, Sentry } from '../_server-lib/sentry.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  initSentryServer();

  applyCors(req, res);
  if (handlePreflight(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (rejectOversizedBody(req, res, BODY_LIMITS.ai)) return;

  try {
    const authHeader =
      typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined;
    const result = await handleRewriteCv(authHeader, req.body);
    return res.status(result.status).json(result.body);
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'rewrite-cv' } });
    console.error('rewrite-cv error:', err);
    // Vercel may freeze the function after the response; send the event first.
    await Sentry.flush(2000);
    return res.status(500).json({ error: 'Không thể viết lại CV. Vui lòng thử lại.' });
  }
}
