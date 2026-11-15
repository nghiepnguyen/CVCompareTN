import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import { getSupabaseAdmin } from './payment/supabaseAdmin.js';
import { withTimeout } from './withTimeout.js';
import { hourlyAiLimit } from './accountLock.js';
import type { Deadline } from './deadline.js';

/**
 * Shared request limits for the Vercel surface. Express uses
 * server/lib/rateLimiter.ts, which only protects `npm start`; serverless
 * instances do not share memory, so counters live in Postgres
 * (public.consume_api_rate_limit, migration 20261101100000).
 *
 * Limits are intentionally coarse: they bound bursts and third-party cost,
 * they are not per-feature quotas (analysis quota stays month-based).
 */
export type RateLimitBucket =
  | 'extract_pdf'
  | 'storage'
  | 'send_email_feedback'
  | 'send_email_welcome'
  | 'admin';

export const RATE_LIMITS: Record<RateLimitBucket, { limit: number; windowSeconds: number }> = {
  // A recruiter batch of 50 JD PDFs calls this once per file; keep room for two batches.
  extract_pdf: { limit: 120, windowSeconds: 3600 },
  storage: { limit: 120, windowSeconds: 3600 },
  send_email_feedback: { limit: 5, windowSeconds: 3600 },
  send_email_welcome: { limit: 5, windowSeconds: 3600 },
  // Admin actions are authenticated and low-volume, but a stolen admin token
  // must still be bounded. 120/15min leaves room for bulk edits.
  admin: { limit: 120, windowSeconds: 15 * 60 },
};

const TIMEOUT_MS = 1500;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Strip ports and IPv4-mapped prefixes; reject anything that is not an IP literal. */
export function normalizeIp(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  let ip = value.trim();
  if (!ip) return null;
  if (ip.startsWith('[')) {
    const close = ip.indexOf(']');
    if (close > 0) ip = ip.slice(1, close);
  } else if (isIP(ip) === 0) {
    const colon = ip.lastIndexOf(':');
    // A single colon means an IPv4 http port; bare IPv6 always has more.
    if (colon > -1 && ip.indexOf(':') === colon) ip = ip.slice(0, colon);
  }
  if (ip.toLowerCase().startsWith('::ffff:') && isIP(ip.slice(7)) === 4) ip = ip.slice(7);
  return isIP(ip) ? ip.toLowerCase() : null;
}

/**
 * Resolve the caller IP from proxy headers. Vercel sanitises `x-forwarded-for`
 * before the handler runs, so its first hop is the client; `x-real-ip` is only
 * a fallback for other deployments. Anonymous traffic also passes reCAPTCHA,
 * so this is defense in depth rather than the primary control.
 */
export function clientIpFromHeaders(
  headers: Record<string, string | string[] | undefined> | undefined
): string | null {
  if (!headers) return null;
  const pick = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const raw = headers['x-forwarded-for'];
  const forwarded = Array.isArray(raw) ? raw.join(',') : raw;
  if (forwarded) {
    for (const hop of forwarded.split(',')) {
      const ip = normalizeIp(hop);
      if (ip) return ip;
    }
  }
  return normalizeIp(pick(headers['x-real-ip']));
}

function hashIp(ip: string): string | null {
  const secret = process.env.RATE_LIMIT_SALT?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secret) return null;
  return createHmac('sha256', secret).update(`cvfit-rate-limit:${ip}`).digest('hex').slice(0, 32);
}

/**
 * `u:<uuid>` for signed-in callers, `ip:<hmac>` otherwise. Raw IPs are never
 * persisted; without a hashing secret anonymous traffic is not limited (the
 * request still has to pass reCAPTCHA where applicable).
 */
export function rateLimitSubject(userId?: string | null, ip?: string | null): string | null {
  if (userId && UUID_RE.test(userId)) return `u:${userId.toLowerCase()}`;
  const normalized = normalizeIp(ip);
  const hash = normalized ? hashIp(normalized) : null;
  return hash ? `ip:${hash}` : null;
}

/**
 * Consume one slot and report whether the caller may proceed. Lookup errors
 * and timeouts fail open, matching the existing AI rate-count behavior: a
 * counter outage must not take the API down. The endpoint's other gates
 * (auth, account lock, reCAPTCHA) still apply.
 */
export async function enforceRateLimit(input: {
  bucket: RateLimitBucket;
  subject: string | null;
}): Promise<boolean> {
  if (!input.subject) return true;
  const config = RATE_LIMITS[input.bucket];
  try {
    const response = await withTimeout(
      Promise.resolve(
        getSupabaseAdmin().rpc('consume_api_rate_limit', {
          p_subject: input.subject,
          p_bucket: input.bucket,
          p_limit: config.limit,
          p_window_seconds: config.windowSeconds,
        })
      ),
      TIMEOUT_MS,
      'Rate limit check'
    );
    if (response.error) throw new Error(response.error.message);
    const row = (Array.isArray(response.data) ? response.data[0] : response.data) as
      | { allowed?: unknown }
      | null
      | undefined;
    if (!row || typeof row.allowed !== 'boolean') throw new Error('Invalid rate limit response');
    return row.allowed;
  } catch (err) {
    console.warn('Rate limit check skipped:', err instanceof Error ? err.message : err);
    return true;
  }
}

/**
 * Atomic per-request slot for Gemini work (M2-B). The analysis_log hourly
 * count only sees finished requests, so concurrent requests all passed it
 * (M2-A P1-1). Each request now consumes one slot in its own fixed hourly
 * window before Gemini starts.
 *
 * Bucket names are prefixed `ai_` so they never collide with RATE_LIMITS
 * buckets (rows are keyed by subject + bucket). The limit equals the existing
 * hourly cap for the plan; the monthly quota is untouched and still has a
 * concurrency gap (check-then-increment) until its reserve/refund stage.
 *
 * Unlike enforceRateLimit this FAILS CLOSED: if the slot cannot be verified
 * (no subject, RPC error, timeout, malformed row) no Gemini call is made.
 */
export const AI_RATE_LIMIT_BUCKETS = {
  analyze: 'ai_analyze',
  parse_cv: 'ai_parse_cv',
  rewrite: 'ai_rewrite',
} as const;
export type AiRateLimitKind = keyof typeof AI_RATE_LIMIT_BUCKETS;
export const AI_RATE_LIMIT_WINDOW_SECONDS = 3600;

export async function reserveAiCall(
  userId: string,
  kind: AiRateLimitKind,
  plan: 'free' | 'pro' | 'recruiter',
  deadline: Deadline
): Promise<'ok' | 'rate_limited' | 'unavailable'> {
  const subject = rateLimitSubject(userId);
  if (!subject) return 'unavailable';
  const timeoutMs = Math.min(TIMEOUT_MS, deadline.remainingMs());
  if (timeoutMs <= 0) return 'unavailable';
  try {
    const response = await withTimeout(
      Promise.resolve(
        getSupabaseAdmin()
          .rpc('consume_api_rate_limit', {
            p_subject: subject,
            p_bucket: AI_RATE_LIMIT_BUCKETS[kind],
            p_limit: hourlyAiLimit(plan),
            p_window_seconds: AI_RATE_LIMIT_WINDOW_SECONDS,
          })
          .abortSignal(deadline.signal(TIMEOUT_MS))
      ),
      timeoutMs,
      'AI rate limit reservation'
    );
    if (response.error) throw new Error(response.error.message);
    const row = (Array.isArray(response.data) ? response.data[0] : response.data) as
      | { allowed?: unknown }
      | null
      | undefined;
    if (!row || typeof row.allowed !== 'boolean') throw new Error('Invalid rate limit response');
    return row.allowed ? 'ok' : 'rate_limited';
  } catch (err) {
    console.warn('AI rate limit reservation unavailable:', err instanceof Error ? err.message : err);
    return 'unavailable';
  }
}
