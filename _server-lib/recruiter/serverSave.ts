import { getSupabaseAdmin } from '../payment/supabaseAdmin.js';
import { withTimeout } from '../withTimeout.js';
import type { Deadline } from '../deadline.js';

/**
 * M2-Q Phase 1B: recruiter results are saved by /api/analyze itself, right
 * after the quota commit, through the same M2-D3 fenced save the browser uses
 * (save_candidate_analysis_attempt). The candidate row is the result store: a
 * lost response leaves the row 'done' under this attempt, and the browser's
 * fallback save under the same attempt id is an idempotent replay.
 * userId must come from the verified bearer token.
 */

const DB_TIMEOUT_MS = 3_000;
// Below this much request budget the save is skipped and left to the browser.
export const SERVER_SAVE_MIN_BUDGET_MS = 1_000;
// Kept free after the save for the success log and the response.
const RESPONSE_MARGIN_MS = 500;

export type CandidateGate = 'owned' | 'not_owner' | 'unavailable';
export type ServerSave = 'saved' | 'superseded' | 'not_owner' | 'failed';

/**
 * Pre-Gemini ownership gate (no quota effect): the candidate belongs to one of
 * this user's campaigns and is currently claimed by this attempt. Same
 * conditions the fenced save checks later; failing early avoids paying for a
 * result the fence would reject. Fails closed.
 */
export async function checkCandidateAttempt(
  userId: string,
  candidateId: string,
  attemptId: string,
  deadline: Deadline
): Promise<CandidateGate> {
  const timeoutMs = Math.min(DB_TIMEOUT_MS, deadline.remainingMs());
  if (timeoutMs <= 0) return 'unavailable';
  try {
    const { data, error } = await withTimeout(
      getSupabaseAdmin()
        .from('candidate_cvs')
        .select('id, recruitment_campaigns!inner(user_id)')
        .eq('id', candidateId)
        .eq('recruitment_campaigns.user_id', userId)
        .eq('analysis_attempt_id', attemptId)
        .eq('status', 'analyzing')
        .abortSignal(deadline.signal(DB_TIMEOUT_MS))
        .maybeSingle() as unknown as Promise<{ data: unknown; error: { message?: string } | null }>,
      timeoutMs,
      'candidate ownership check'
    );
    if (error) {
      console.warn('Candidate ownership check failed:', error.message);
      return 'unavailable';
    }
    return data ? 'owned' : 'not_owner';
  } catch (err) {
    console.warn('Candidate ownership check unavailable:', err instanceof Error ? err.message : err);
    return 'unavailable';
  }
}

/** Never throws: any error or missing budget is 'failed' (the browser saves instead). */
export async function saveCandidateResult(
  userId: string,
  candidateId: string,
  attemptId: string,
  result: Record<string, unknown>,
  deadline: Deadline
): Promise<ServerSave> {
  const timeoutMs = Math.min(DB_TIMEOUT_MS, deadline.remainingMs() - RESPONSE_MARGIN_MS);
  if (deadline.remainingMs() < SERVER_SAVE_MIN_BUDGET_MS || timeoutMs <= 0) return 'failed';
  try {
    const { data, error } = await withTimeout(
      getSupabaseAdmin()
        .rpc('save_candidate_analysis_attempt', {
          p_user_id: userId,
          p_candidate_id: candidateId,
          p_attempt_id: attemptId,
          p_analysis_result: result,
          // Exactly what the browser sends today (no rounding).
          p_match_score: result.matchScore,
        })
        .abortSignal(deadline.signal(timeoutMs)) as unknown as Promise<{ data: unknown; error: { message?: string } | null }>,
      timeoutMs,
      'save_candidate_analysis_attempt'
    );
    if (error) {
      console.warn('Server-side candidate save failed:', error.message);
      return 'failed';
    }
    const outcome = (data as { result?: string } | null)?.result;
    return outcome === 'saved' || outcome === 'superseded' || outcome === 'not_owner' ? outcome : 'failed';
  } catch (err) {
    console.warn('Server-side candidate save unavailable:', err instanceof Error ? err.message : err);
    return 'failed';
  }
}
