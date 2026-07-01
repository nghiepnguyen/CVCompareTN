import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initSentryServer, Sentry } from '../_server-lib/sentry.js';
import { getUserFromBearerToken, getSupabaseAdmin } from '../_server-lib/payment/supabaseAdmin.js';

/**
 * Unified admin handler — dispatches by URL path segment.
 *
 * Vercel rewrite maps /api/admin/{action} → /api/admin.ts
 * Actions: set-user-role, set-user-plan
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  initSentryServer();

  const urlPath = new URL(req.url || '', `https://${req.headers.host}`).pathname;
  const segments = urlPath.replace(/\/$/, '').split('/');
  const action = segments[segments.length - 1] || '';

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Authenticate the caller
    const authHeader =
      typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined;
    const user = await getUserFromBearerToken(authHeader);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const supabase = getSupabaseAdmin();

    // Double-guard: verify the calling user is an admin.
    // Don't use is_admin() RPC here — the admin client runs as service_role
    // so auth.uid() would be NULL. Query profiles directly instead.
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError || !profile || profile.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: admin access required' });
    }

    switch (action) {
      case 'set-user-role': {
        const { p_user_id, p_role } = (req.body || {}) as {
          p_user_id?: string;
          p_role?: string;
        };

        if (!p_user_id || !p_role) {
          return res.status(400).json({ error: 'Missing p_user_id or p_role' });
        }
        if (p_role !== 'admin' && p_role !== 'user') {
          return res.status(400).json({ error: 'Invalid role. Must be "admin" or "user"' });
        }

        const { error: rpcError } = await supabase.rpc('set_user_role', {
          p_user_id,
          p_role,
        });

        if (rpcError) {
          console.error('set_user_role RPC failed:', rpcError);
          return res.status(500).json({ error: 'Failed to update user role', detail: rpcError.message });
        }

        return res.status(200).json({ success: true });
      }

      case 'set-user-plan': {
        const { p_user_id, p_plan, p_duration_days } = (req.body || {}) as {
          p_user_id?: string;
          p_plan?: string;
          p_duration_days?: number;
        };

        if (!p_user_id || !p_plan) {
          return res.status(400).json({ error: 'Missing p_user_id or p_plan' });
        }
        if (!['free', 'pro', 'recruiter'].includes(p_plan)) {
          return res.status(400).json({ error: 'Invalid plan. Must be "free", "pro", or "recruiter"' });
        }

        const { error: rpcError } = await supabase.rpc('admin_set_user_plan', {
          p_user_id,
          p_plan,
          p_duration_days: p_duration_days ?? 30,
        });

        if (rpcError) {
          console.error('admin_set_user_plan RPC failed:', rpcError);
          return res.status(500).json({ error: 'Failed to update user plan', detail: rpcError.message });
        }

        return res.status(200).json({ success: true });
      }

      default: {
        return res.status(404).json({ error: `Unknown admin action: ${action}` });
      }
    }
  } catch (err) {
    console.error('admin handler error:', err);
    Sentry.captureException(err);
    const message = err instanceof Error ? err.message : 'Server error';
    return res.status(500).json({ error: 'Server error', detail: message });
  }
}