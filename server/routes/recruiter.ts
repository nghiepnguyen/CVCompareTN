import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';

const router = Router();

router.post('/save-analysis', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.slice(7);
    const supabaseUrl = process.env.SUPABASE_URL?.trim();
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!supabaseUrl || !serviceRoleKey) {
      return res.status(503).json({ error: 'Service configuration missing' });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: userData, error: userError } = await adminClient.auth.getUser(token);
    if (userError || !userData?.user) {
      return res.status(401).json({ error: 'Invalid token' });
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

    const { error: rpcError } = await adminClient.rpc('save_candidate_analysis', {
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