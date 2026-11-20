import { getSupabaseAdmin } from '../payment/supabaseAdmin.js';
import { withTimeout } from '../withTimeout.js';
import type { Deadline } from '../deadline.js';
import type { AnalysisResult } from '../../src/services/ai/types.js';
import { toHistoryRow } from '../../src/lib/historyRow.js';

/**
 * M3-A: a personal result is written to the user's existing `history` row by
 * /api/analyze, ONLY after the quota commit is confirmed (A4). It is the same
 * row, columns and retention the browser upsert already writes; a lost
 * response leaves it there and the browser finds it by its request key
 * (= analysis_id). userId must come from the verified bearer token.
 * Never throws and never runs past the request deadline.
 */
const DB_TIMEOUT_MS = 3_000;

export async function saveHistoryRow(
  userId: string,
  result: AnalysisResult,
  deadline: Deadline
): Promise<'saved' | 'failed'> {
  const timeoutMs = Math.min(DB_TIMEOUT_MS, deadline.remainingMs());
  if (timeoutMs <= 0) return 'failed';
  try {
    const { error } = await withTimeout(
      getSupabaseAdmin()
        .from('history')
        .upsert(toHistoryRow(userId, result), { onConflict: 'user_id,analysis_id' })
        .abortSignal(deadline.signal(DB_TIMEOUT_MS)) as unknown as Promise<{ error: { message?: string } | null }>,
      timeoutMs,
      'history save'
    );
    if (error) {
      console.warn('Server history save failed:', error.message);
      return 'failed';
    }
    return 'saved';
  } catch (err) {
    console.warn('Server history save unavailable:', err instanceof Error ? err.message : err);
    return 'failed';
  }
}
