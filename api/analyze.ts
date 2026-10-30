import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleAnalyze } from '../_server-lib/analyze/handler.js';
import { initSentryServer, Sentry } from '../_server-lib/sentry.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  initSentryServer();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authHeader =
      typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined;
    const result = await handleAnalyze(authHeader, req.body);
    return res.status(result.status).json(result.body);
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'analyze' } });
    console.error('analyze error:', err);
    return res.status(500).json({ error: 'Không thể phân tích CV. Vui lòng thử lại.' });
  }
}
