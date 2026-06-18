import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getUserFromBearerToken, getSupabaseAdmin } from '../../_server-lib/payment/supabaseAdmin.js';
import { initSentryServer, Sentry } from '../../_server-lib/sentry.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  initSentryServer();

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const authHeader =
      typeof req.headers.authorization === 'string'
        ? req.headers.authorization
        : undefined;

    const user = await getUserFromBearerToken(authHeader);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const body = req.body as {
      candidateId?: string;
      analysisResult?: Record<string, unknown>;
      matchScore?: number;
      status?: string;
    } | undefined;

    const candidateId = body?.candidateId;
    const analysisResult = body?.analysisResult;
    const matchScore = typeof body?.matchScore === 'number' ? body.matchScore : 0;
    const status = body?.status === 'error' ? 'error' : 'done';

    if (!candidateId || !analysisResult) {
      return res.status(400).json({ error: 'Missing candidateId or analysisResult' });
    }

    const { error: rpcError } = await getSupabaseAdmin().rpc('save_candidate_analysis', {
      p_candidate_id: candidateId,
      p_analysis_result: analysisResult,
      p_match_score: matchScore,
      p_status: status,
    });

    if (rpcError) {
      console.error('save_candidate_analysis failed:', rpcError);
      return res.status(500).json({
        error: 'Không lưu được kết quả phân tích',
        detail: rpcError.message,
      });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'recruiter/save-analysis' } });
    console.error('recruiter/save-analysis error:', err);
    const message = err instanceof Error ? err.message : 'Server error';
    return res.status(500).json({ error: 'Server error', detail: message });
  }
}
