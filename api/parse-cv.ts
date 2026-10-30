import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleParseCv } from '../_server-lib/parseCv/handler.js';
import { initSentryServer, Sentry } from '../_server-lib/sentry.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  initSentryServer();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authHeader =
      typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined;
    const result = await handleParseCv(authHeader, req.body);
    return res.status(result.status).json(result.body);
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'parse-cv' } });
    console.error('parse-cv error:', err);
    return res.status(500).json({ error: 'Không thể đọc thông tin CV. Vui lòng thử lại.' });
  }
}
