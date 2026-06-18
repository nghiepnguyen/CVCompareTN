import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleExtractPdf } from '../_server-lib/pdf/handler.js';
import { initSentryServer, Sentry } from '../_server-lib/sentry.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  initSentryServer();

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
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ error: `Failed to extract PDF: ${message}` });
  }
}
