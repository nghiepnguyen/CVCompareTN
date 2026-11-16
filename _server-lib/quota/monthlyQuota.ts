import { getSupabaseAdmin } from '../payment/supabaseAdmin.js';
import { withTimeout } from '../withTimeout.js';
import type { Deadline } from '../deadline.js';

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

export type ReserveResult =
  | { status: 'reserved'; reservationId: string }
  | { status: 'denied'; used: number; limit: number }
  | { status: 'duplicate'; state: string }
  | { status: 'unavailable' };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidIdempotencyKey(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

async function callRpc(name: string, args: Record<string, unknown>, deadline: Deadline): Promise<Record<string, unknown>> {
  const timeoutMs = Math.min(RPC_TIMEOUT_MS, deadline.remainingMs());
  if (timeoutMs <= 0) throw new Error(`${name}: request deadline reached`);
  const { data, error } = await withTimeout(
    getSupabaseAdmin().rpc(name, args).abortSignal(deadline.signal(RPC_TIMEOUT_MS)) as unknown as Promise<{
      data: unknown;
      error: { message?: string } | null;
    }>,
    timeoutMs,
    name
  );
  if (error) throw new Error(`${name}: ${error.message ?? 'rpc error'}`);
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

async function settle(name: string, args: Record<string, unknown>, ok: (row: Record<string, unknown>) => boolean, deadline: Deadline): Promise<boolean> {
  for (let attempt = 0; attempt < SETTLE_ATTEMPTS; attempt++) {
    try {
      if (ok(await callRpc(name, args, deadline))) return true;
      return false; // a definitive answer (e.g. conflict) is not retried
    } catch (err) {
      console.warn(`${name} attempt ${attempt + 1} failed:`, err instanceof Error ? err.message : err);
      const wait = SETTLE_BACKOFF_MS[attempt];
      if (wait === undefined || deadline.remainingMs() <= wait) break;
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  return false;
}

/** True only when the charge is recorded (committed, including replay/waived). */
export function commitMonthlyQuota(userId: string, reservationId: string, deadline: Deadline): Promise<boolean> {
  return settle(
    'commit_analytics_quota',
    { p_user_id: userId, p_reservation_id: reservationId },
    (row) => row.status === 'committed',
    deadline
  );
}

/** Best effort: an unsettled reservation is recovered by TTL expiry as 'uncertain'. */
export function releaseMonthlyQuota(userId: string, reservationId: string, outcome: ReleaseOutcome, deadline: Deadline): Promise<boolean> {
  return settle(
    'release_analytics_quota',
    { p_user_id: userId, p_reservation_id: reservationId, p_outcome: outcome },
    (row) => typeof row.status === 'string' && row.status !== 'not_found',
    deadline
  );
}
