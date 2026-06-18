import { Router } from 'express';
import { getUserFromBearerToken, getSupabaseAdmin } from '../../_server-lib/payment/supabaseAdmin';

const router = Router();

router.post('/save-analysis', async (req, res) => {
  try {
    const authHeader =
      typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined;

    const user = await getUserFromBearerToken(authHeader);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { candidateId, analysisResult, matchScore, status } = req.body as {
      candidateId?: string;
      analysisResult?: Record<string, unknown>;
      matchScore?: number;
      status?: string;
    };

    if (!candidateId || !analysisResult) {
      return res.status(400).json({ error: 'Missing candidateId or analysisResult' });
    }

    const { error: rpcError } = await getSupabaseAdmin().rpc('save_candidate_analysis', {
      p_candidate_id: candidateId,
      p_analysis_result: analysisResult,
      p_match_score: typeof matchScore === 'number' ? matchScore : 0,
      p_status: status === 'error' ? 'error' : 'done',
    });

    if (rpcError) {
      console.error('save_candidate_analysis failed:', rpcError);
      return res.status(500).json({ error: 'Không lưu được kết quả phân tích', detail: rpcError.message });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('recruiter/save-analysis error:', err);
    const message = err instanceof Error ? err.message : 'Server error';
    return res.status(500).json({ error: 'Server error', detail: message });
  }
});

export default router;
