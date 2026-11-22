import { getSupabaseAdmin } from '../payment/supabaseAdmin.js';
import { withTimeout } from '../withTimeout.js';
import type { Deadline } from '../deadline.js';
import type { ServerSave } from '../recruiter/serverSave.js';

/**
 * M2-C2 atomic monthly quota (migration 20261116000000). One reservation per
 * /api/analyze request: reserve before any AI work, then exactly one of
 * commit (result delivered) or release (pre_gemini | provider_error | uncertain).
 * userId must come from the verified JWT: the RPCs run as service_role.
 */

const RPC_TIMEOUT_MS = 3_000;
const SETTLE_ATTEMPTS = 3;
const SETTLE_BACKOFF_MS = [150, 400];
// Vercel maxDuration for /api/analyze is 300 s; the reservation must outlive it.
export const QUOTA_RESERVATION_TTL_SECONDS = 360;

export type ReleaseOutcome = 'pre_gemini' | 'provider_error' | 'uncertain';

/**
 * M2-Q 2C settlement outcome. 'failed' only when every attempt got a definitive
 * answer from Postgres (a status reply, or a SQLSTATE error = statement rolled
 * back). A timeout, abort, transport/gateway error or unreadable reply is
 * 'unknown': that statement may still be running and commit later (Postgres
 * does not stop when the HTTP request ends; it runs to completion or to the
 * role's statement_timeout).
 */
export type SettleOutcome = 'committed' | 'failed' | 'unknown';

export type ReserveResult =
  | { status: 'reserved'; reservationId: string }
  | { status: 'denied'; used: number; limit: number }
  | { status: 'duplicate'; state: string }
  | { status: 'unavailable' };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidIdempotencyKey(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

// A Postgres SQLSTATE in the error body means the statement ran and its
// transaction rolled back. PostgREST's own codes (PGRST…), empty codes (fetch,
// abort, gateway HTML) and connection-class states (08…, 57P…: the session
// died, commit status unknown) are not proof of anything.
const DEFINITIVE_SQLSTATE = /^(?!08|57P)[0-9A-Z]{5}$/;
export function isDefinitiveSqlState(code: unknown): boolean {
  return typeof code === 'string' && DEFINITIVE_SQLSTATE.test(code);
}
// The statement rolled back, or was never sent.
class DefinitiveRpcError extends Error {}

async function callRpc(name: string, args: Record<string, unknown>, deadline: Deadline): Promise<Record<string, unknown>> {
  const timeoutMs = Math.min(RPC_TIMEOUT_MS, deadline.remainingMs());
  // Nothing is sent: as definitive as a rollback.
  if (timeoutMs <= 0) throw new DefinitiveRpcError(`${name}: request deadline reached`);
  const { data, error } = await withTimeout(
    getSupabaseAdmin().rpc(name, args).abortSignal(deadline.signal(RPC_TIMEOUT_MS)) as unknown as Promise<{
      data: unknown;
      error: { message?: string; code?: string } | null;
    }>,
    timeoutMs,
    name
  );
  if (error) {
    const msg = `${name}: ${error.message ?? 'rpc error'}`;
    throw isDefinitiveSqlState(error.code) ? new DefinitiveRpcError(msg) : new Error(msg);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(`${name}: malformed response`);
  return data as Record<string, unknown>;
}

/** Fails closed: any error, timeout or unexpected shape → 'unavailable' (no Gemini). */
export async function reserveMonthlyQuota(userId: string, requestKey: string, deadline: Deadline): Promise<ReserveResult> {
  try {
    const row = await callRpc('reserve_analytics_quota', {
      p_user_id: userId,
      p_request_key: requestKey,
      p_ttl_seconds: QUOTA_RESERVATION_TTL_SECONDS,
    }, deadline);
    if (row.status === 'reserved' && typeof row.reservation_id === 'string') {
      return { status: 'reserved', reservationId: row.reservation_id };
    }
    if (row.status === 'denied' && typeof row.used === 'number' && typeof row.limit === 'number') {
      return { status: 'denied', used: row.used, limit: row.limit };
    }
    if (row.status === 'duplicate' && typeof row.state === 'string') {
      return { status: 'duplicate', state: row.state };
    }
    return { status: 'unavailable' };
  } catch (err) {
    console.warn('Quota reservation unavailable:', err instanceof Error ? err.message : err);
    return { status: 'unavailable' };
  }
}

/**
 * Bounded retries of ONE idempotent settle call (same reservation id, same
 * payload): a repeat after an unknown attempt is a replay that the RPC answers
 * from the ledger (committed → replay, never a second charge), not a new
 * billing write. Gemini is never re-run here.
 */
async function settle(
  name: string,
  args: Record<string, unknown>,
  ok: (row: Record<string, unknown>) => boolean,
  deadline: Deadline
): Promise<{ outcome: SettleOutcome; row?: Record<string, unknown> }> {
  let unknown = false;
  for (let attempt = 0; attempt < SETTLE_ATTEMPTS; attempt++) {
    try {
      const row = await callRpc(name, args, deadline);
      // A status answer (e.g. conflict, not_found) is definitive and not retried:
      // neither state can follow a commit that landed.
      return { outcome: ok(row) ? 'committed' : 'failed', row };
    } catch (err) {
      if (!(err instanceof DefinitiveRpcError)) unknown = true;
      console.warn(`${name} attempt ${attempt + 1} failed:`, err instanceof Error ? err.message : err);
      const wait = SETTLE_BACKOFF_MS[attempt];
      if (wait === undefined || deadline.remainingMs() <= wait) break;
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  return { outcome: unknown ? 'unknown' : 'failed' };
}

/** 'committed' only when the charge is recorded (including replay/waived). */
export async function commitMonthlyQuota(userId: string, reservationId: string, deadline: Deadline): Promise<SettleOutcome> {
  return (await settle(
    'commit_analytics_quota',
    { p_user_id: userId, p_reservation_id: reservationId },
    (row) => row.status === 'committed',
    deadline
  )).outcome;
}

/**
 * M2-Q 2C (migration 20261118000000): recruiter commit + fenced result save in
 * one transaction. A commit that lands after this request gave up lands the
 * result too. `save` is only meaningful when committed; a save error keeps the
 * charge and is reported as 'failed' (the browser then saves under the same attempt).
 */
export async function commitAndSaveCandidate(
  userId: string,
  reservationId: string,
  candidateId: string,
  attemptId: string,
  result: Record<string, unknown>,
  deadline: Deadline
): Promise<{ outcome: SettleOutcome; save?: ServerSave }> {
  const { outcome, row } = await settle(
    'commit_analytics_quota_and_save_candidate',
    {
      p_user_id: userId,
      p_reservation_id: reservationId,
      p_candidate_id: candidateId,
      p_attempt_id: attemptId,
      p_analysis_result: result,
      p_match_score: result.matchScore,
    },
    (r) => r.status === 'committed',
    deadline
  );
  if (outcome !== 'committed') return { outcome };
  const save = row?.save;
  return { outcome, save: save === 'saved' || save === 'superseded' || save === 'not_owner' ? save : 'failed' };
}

/** Best effort: an unsettled reservation is recovered by TTL expiry as 'uncertain'. */
export async function releaseMonthlyQuota(userId: string, reservationId: string, outcome: ReleaseOutcome, deadline: Deadline): Promise<boolean> {
  return (await settle(
    'release_analytics_quota',
    { p_user_id: userId, p_reservation_id: reservationId, p_outcome: outcome },
    (row) => typeof row.status === 'string' && row.status !== 'not_found',
    deadline
  )).outcome === 'committed';
}

export type CheckedRelease = 'refunded' | 'not_refunded' | 'unknown';

/**
 * M3-B R0: release whose result the caller reports to the user. 'refunded'
 * only when the ledger row is refunded (this call or an earlier replay);
 * 'not_refunded' when the RPC answered with another state (e.g. the row already
 * expired to 'uncertain'); 'unknown' when no definitive answer arrived — the
 * reservation then follows the existing TTL → uncertain contract.
 */
export async function releaseMonthlyQuotaChecked(userId: string, reservationId: string, outcome: ReleaseOutcome, deadline: Deadline): Promise<CheckedRelease> {
  const { outcome: settled } = await settle(
    'release_analytics_quota',
    { p_user_id: userId, p_reservation_id: reservationId, p_outcome: outcome },
    (row) => row.status === 'refunded',
    deadline
  );
  return settled === 'committed' ? 'refunded' : settled === 'failed' ? 'not_refunded' : 'unknown';
}
