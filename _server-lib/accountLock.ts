import { getSupabaseAdmin } from './payment/supabaseAdmin.js';
import { withTimeout } from './withTimeout.js';
import { MAX_BATCH_BY_PLAN } from '../src/lib/planLimits.js';

/** Same rule as the UI gate in src/app/AppContent.tsx: admins are never locked. */
export function isLockedProfile(p: { has_permission?: boolean | null; role?: string | null } | null | undefined): boolean {
  return p?.has_permission === false && p.role !== 'admin';
}

// Inlined instead of importing src/services/userService.ts — that module
// transitively imports src/lib/supabase.ts via an extensionless specifier,
// which Node's ESM loader can't resolve in the Vercel serverless runtime.
// Keep in sync with getDisplayEffectivePlan() in src/services/userService.ts.
export function getEffectivePlan(profile: {
  plan: string;
  planExpiresAt: string | null;
  role: string;
}): 'free' | 'pro' | 'recruiter' {
  if (profile.role === 'admin') return 'pro';
  if (profile.plan !== 'pro' && profile.plan !== 'recruiter') return 'free';
  if (!profile.planExpiresAt) return profile.plan as 'pro' | 'recruiter';
  return new Date(profile.planExpiresAt) > new Date()
    ? (profile.plan as 'pro' | 'recruiter')
    : 'free';
}

const RATE_WINDOW_MS = 60 * 60 * 1000;

/** Hourly calls allowed per AI kind: two full batches for the plan, at least 10. */
export function hourlyAiLimit(plan: 'free' | 'pro' | 'recruiter'): number {
  return Math.max(10, 2 * (MAX_BATCH_BY_PLAN[plan] ?? 1));
}

type ProfileRow = { has_permission: boolean; role: string; plan: string; plan_expires_at: string | null };

/** Missing/error/timeout is not evidence that an account is unlocked. */
export async function getAccountProfile(userId: string, timeoutMs = 4000, signal?: AbortSignal): Promise<ProfileRow> {
  const { data, error } = await withTimeout(
    Promise.resolve(getSupabaseAdmin().from('profiles').select('has_permission, role, plan, plan_expires_at')
      .eq('id', userId).abortSignal(signal ?? AbortSignal.timeout(timeoutMs)).maybeSingle()),
    timeoutMs,
    'Account check'
  );
  if (error || !data || typeof data.has_permission !== 'boolean' || !['user', 'admin'].includes(data.role)) {
    throw new Error('Account verification unavailable');
  }
  return data as ProfileRow;
}

export async function checkAccountAccess(userId: string): Promise<'ok' | 'locked' | 'unavailable'> {
  try {
    return isLockedProfile(await getAccountProfile(userId)) ? 'locked' : 'ok';
  } catch {
    return 'unavailable';
  }
}

/**
 * Gate for /api/rewrite-cv and /api/parse-cv: account lock, then a per-user
 * hourly cap counted from analysis_log (every call writes one row).
 * Account lookup fails closed. The independent rate-count lookup retains its
 * existing fail-open behavior.
 */
export async function checkAiAccess(
  userId: string,
  kind: 'rewrite' | 'parse_cv',
  timeoutMs: number,
  signal?: AbortSignal
): Promise<'ok' | 'locked' | 'rate_limited' | 'unavailable'> {
  let profile: ProfileRow | null = null;
  try {
    profile = await getAccountProfile(userId, timeoutMs, signal);
  } catch {
    return 'unavailable';
  }
  if (isLockedProfile(profile)) return 'locked';

  try {
    const supabase = getSupabaseAdmin();
    const plan = profile
      ? getEffectivePlan({ plan: profile.plan, planExpiresAt: profile.plan_expires_at, role: profile.role })
      : 'free';
    const query = supabase
      .from('analysis_log')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('kind', kind)
      .gte('created_at', new Date(Date.now() - RATE_WINDOW_MS).toISOString());
    const { count } = await withTimeout(
      (signal ? query.abortSignal(signal) : query) as unknown as Promise<{ count: number | null }>,
      timeoutMs,
      'Rate limit check'
    );
    if ((count ?? 0) >= hourlyAiLimit(plan)) return 'rate_limited';
  } catch (err) {
    console.warn('Rate limit check skipped:', err instanceof Error ? err.message : err);
  }
  return 'ok';
}
