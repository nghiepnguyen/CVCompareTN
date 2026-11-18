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
 * Every save is fenced by the attempt that owns the row (M2-D3); clients
 * deployed before M2-D3 send no attemptId and are fenced as attempt NULL.
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
  // match_score is an integer column (the result JSON keeps the exact value);
  // the model may return a decimal such as 72.5 (M2-Q 2C).
  const matchScore = typeof body?.matchScore === 'number' ? Math.round(body.matchScore) : 0;

  if (!candidateId || !analysisResult) {
    return { status: 400, body: { error: 'Missing candidateId or analysisResult' } };
  }
  if (body?.attemptId !== undefined && !isValidIdempotencyKey(body.attemptId)) {
    return { status: 400, body: { error: 'Invalid attemptId' } };
  }

  // Pre-M2-D3 clients send no attemptId: they go through the same fence with
  // a NULL attempt, which only matches rows no claim has ever owned. Their
  // legacy 'error' saves are refused (error text never becomes a result).
  if (body?.attemptId === undefined && body?.status === 'error') {
    return { status: 400, body: { error: 'Unsupported legacy error save' } };
  }

  const { data, error } = await getSupabaseAdmin().rpc('save_candidate_analysis_attempt', {
    p_user_id: userId,
    p_candidate_id: candidateId,
    p_attempt_id: body?.attemptId ?? null,
    p_analysis_result: analysisResult,
    p_match_score: matchScore,
  });
  if (error) {
    console.error('save_candidate_analysis_attempt failed:', error);
    return rpcFailure(error.code);
  }
  const result = (data as { result?: string } | null)?.result;
  if (result !== 'saved') {
    // superseded: a newer attempt already saved; not_owner: another attempt owns the row.
    return { status: 409, body: { error: 'Analysis attempt does not own this candidate', code: result ?? 'conflict' } };
  }
  return { status: 200, body: { success: true } };
}
