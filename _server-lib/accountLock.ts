import { getSupabaseAdmin } from './payment/supabaseAdmin.js';
import { withTimeout } from './withTimeout.js';

/** Same rule as the UI gate in src/app/AppContent.tsx: admins are never locked. */
export function isLockedProfile(p: { has_permission?: boolean | null; role?: string | null } | null | undefined): boolean {
  return p?.has_permission === false && p.role !== 'admin';
}

/**
 * True when an admin has locked this account. Fails open (false) on lookup
 * error/timeout: a DB hiccup must not take AI endpoints down for everyone.
 */
export async function isAccountLocked(userId: string, timeoutMs: number, signal?: AbortSignal): Promise<boolean> {
  try {
    const query = getSupabaseAdmin().from('profiles').select('has_permission, role').eq('id', userId);
    const { data } = await withTimeout(
      (signal ? query.abortSignal(signal) : query).maybeSingle() as unknown as Promise<{
        data: { has_permission: boolean; role: string } | null;
      }>,
      timeoutMs,
      'Account lock check'
    );
    return isLockedProfile(data);
  } catch (err) {
    console.warn('Account lock check skipped:', err instanceof Error ? err.message : err);
    return false;
  }
}
