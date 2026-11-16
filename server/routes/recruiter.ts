import { checkAccountAccess } from '../../_server-lib/accountLock.js';
import { Router } from 'express';
import { getUserFromBearerToken } from '../../_server-lib/payment/supabaseAdmin';
import { saveCandidateAnalysisForUser } from '../../_server-lib/recruiter/saveAnalysis.js';

const router = Router();

router.post('/save-analysis', async (req, res) => {
  try {
    const authHeader =
      typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined;

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
    console.error('recruiter/save-analysis error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

export default router;
