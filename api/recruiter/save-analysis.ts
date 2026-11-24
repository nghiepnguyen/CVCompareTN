import { checkAccountAccess } from '../../_server-lib/accountLock.js';
import { applyCors, handlePreflight, rejectOversizedBody, BODY_LIMITS } from '../../_server-lib/http/guard.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getUserFromBearerToken } from '../../_server-lib/payment/supabaseAdmin.js';
import { saveCandidateAnalysisForUser } from '../../_server-lib/recruiter/saveAnalysis.js';
import { initSentryServer, Sentry } from '../../_server-lib/sentry.js';
import { enterVercelFunction } from '../../_server-lib/previewGuard.js';

// P1-D: Vercel entry — fail-closed credential policy (see _server-lib/previewGuard.ts).
enterVercelFunction();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  initSentryServer();

  applyCors(req, res);
  if (handlePreflight(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  if (rejectOversizedBody(req, res, BODY_LIMITS.ai)) return;

  try {
    const authHeader =
      typeof req.headers.authorization === 'string'
        ? req.headers.authorization
        : undefined;

    const user = await getUserFromBearerToken(authHeader);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const access = await checkAccountAccess(user.id);
    if (access === 'locked') return res.status(403).json({ error: 'Account locked' });
    if (access === 'unavailable') return res.status(503).json({ error: 'Account verification unavailable' });

    const result = await saveCandidateAnalysisForUser(user.id, req.body);
    return res.status(result.status).json(result.body);
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'recruiter/save-analysis' } });
    console.error('recruiter/save-analysis error:', err);
    // Vercel may freeze the function after the response; send the event first.
    await Sentry.flush(2000);
    return res.status(500).json({ error: 'Server error' });
  }
}
