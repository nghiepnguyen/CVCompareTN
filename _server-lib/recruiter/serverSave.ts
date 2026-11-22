import { getSupabaseAdmin } from '../payment/supabaseAdmin.js';
import { withTimeout } from '../withTimeout.js';
import type { Deadline } from '../deadline.js';

/**
 * M2-Q Phase 1B: recruiter results are saved by /api/analyze itself through
 * the M2-D3 fenced save. Since M2-Q 2C the save runs inside the quota commit
 * (commitAndSaveCandidate in ../quota/monthlyQuota.ts, one transaction). The
 * candidate row is the result store: a lost response leaves the row 'done'
 * under this attempt, and the browser's fallback save under the same attempt
 * id is an idempotent replay. userId must come from the verified bearer token.
 */

const DB_TIMEOUT_MS = 3_000;

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

/**
 * M3-B R0: the candidate leaves 'analyzing' when its attempt produced no valid
 * result. Same fence as the browser's releaseCandidateAnalysis (id + attempt +
 * 'analyzing'), so it never touches a newer attempt or a saved result, and a
 * second release (browser or replay) is a no-op. The ownership gate already
 * bound this attempt to this user before Gemini ran. Never throws.
 */
export async function failCandidateAttempt(
  candidateId: string,
  attemptId: string,
  errorMessage: string,
  deadline: Deadline
): Promise<'released' | 'not_owner' | 'failed'> {
  const timeoutMs = Math.min(DB_TIMEOUT_MS, deadline.remainingMs());
  if (timeoutMs <= 0) return 'failed';
  try {
    const { data, error } = await withTimeout(
      getSupabaseAdmin()
        .from('candidate_cvs')
        .update({ status: 'error', error_message: errorMessage })
        .eq('id', candidateId)
        .eq('analysis_attempt_id', attemptId)
        .eq('status', 'analyzing')
        .select('id')
        .abortSignal(deadline.signal(DB_TIMEOUT_MS)) as unknown as Promise<{ data: unknown[] | null; error: { message?: string } | null }>,
      timeoutMs,
      'candidate failure transition'
    );
    if (error) {
      console.warn('Candidate failure transition failed:', error.message);
      return 'failed';
    }
    return (data ?? []).length > 0 ? 'released' : 'not_owner';
  } catch (err) {
    console.warn('Candidate failure transition unavailable:', err instanceof Error ? err.message : err);
    return 'failed';
  }
}
