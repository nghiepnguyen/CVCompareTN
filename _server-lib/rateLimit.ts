import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import { getSupabaseAdmin } from './payment/supabaseAdmin.js';
import { withTimeout } from './withTimeout.js';

/**
 * Shared request limits for the Vercel surface. Express uses
 * server/lib/rateLimiter.ts, which only protects `npm start`; serverless
 * instances do not share memory, so counters live in Postgres
 * (public.consume_api_rate_limit, migration 20261101100000).
 *
 * Limits are intentionally coarse: they bound bursts and third-party cost,
 * they are not per-feature quotas (analysis quota stays month-based).
 */
export type RateLimitBucket = 'extract_pdf' | 'storage' | 'send_email_feedback' | 'send_email_welcome';

export const RATE_LIMITS: Record<RateLimitBucket, { limit: number; windowSeconds: number }> = {
  // A recruiter batch of 50 JD PDFs calls this once per file; keep room for two batches.
  extract_pdf: { limit: 120, windowSeconds: 3600 },
  storage: { limit: 120, windowSeconds: 3600 },
  send_email_feedback: { limit: 5, windowSeconds: 3600 },
  send_email_welcome: { limit: 5, windowSeconds: 3600 },
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
