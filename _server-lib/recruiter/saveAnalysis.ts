import { getSupabaseAdmin } from '../payment/supabaseAdmin.js';
import { isValidIdempotencyKey } from '../quota/monthlyQuota.js';

export type SaveAnalysisResult = { status: number; body: Record<string, unknown> };

const rpcFailure = (code?: string): SaveAnalysisResult =>
  code === '42501'
    ? { status: 403, body: { error: 'Forbidden' } }
    : code === 'P0002'
      ? { status: 404, body: { error: 'Candidate not found' } }
      : { status: 500, body: { error: 'Không lưu được kết quả phân tích' } };

/**
 * Shared by api/recruiter/save-analysis.ts and server/routes/recruiter.ts.
 * `userId` must come from the verified bearer token, never from the body.
 * With `attemptId` (M2-D3 clients) the save is fenced by the attempt that owns
 * the row; without it (clients deployed before M2-D3) the legacy RPC runs.
 */
export async function saveCandidateAnalysisForUser(userId: string, rawBody: unknown): Promise<SaveAnalysisResult> {
  const body = rawBody as {
    candidateId?: string;
    analysisResult?: Record<string, unknown>;
    matchScore?: number;
    status?: string;
    attemptId?: unknown;
  } | undefined;

  const candidateId = body?.candidateId;
  const analysisResult = body?.analysisResult;
  const matchScore = typeof body?.matchScore === 'number' ? body.matchScore : 0;

  if (!candidateId || !analysisResult) {
    return { status: 400, body: { error: 'Missing candidateId or analysisResult' } };
  }
  if (body?.attemptId !== undefined && !isValidIdempotencyKey(body.attemptId)) {
    return { status: 400, body: { error: 'Invalid attemptId' } };
  }

  if (body?.attemptId !== undefined) {
    const { data, error } = await getSupabaseAdmin().rpc('save_candidate_analysis_attempt', {
      p_user_id: userId,
      p_candidate_id: candidateId,
      p_attempt_id: body.attemptId,
      p_analysis_result: analysisResult,
      p_match_score: matchScore,
    });
    if (error) {
      console.error('save_candidate_analysis_attempt failed:', error);
      return rpcFailure(error.code);
    }
    if ((data as { result?: string } | null)?.result === 'superseded') {
      return { status: 409, body: { error: 'Superseded by a newer saved analysis', code: 'superseded' } };
    }
    return { status: 200, body: { success: true } };
  }

  const { error } = await getSupabaseAdmin().rpc('save_candidate_analysis', {
    p_user_id: userId,
    p_candidate_id: candidateId,
    p_analysis_result: analysisResult,
    p_match_score: matchScore,
    p_status: body?.status === 'error' ? 'error' : 'done',
  });
  if (error) {
    console.error('save_candidate_analysis failed:', error);
    return rpcFailure(error.code);
  }
  return { status: 200, body: { success: true } };
}
