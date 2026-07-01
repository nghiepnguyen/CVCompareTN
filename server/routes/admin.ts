import { Router } from 'express';
import { getUserFromBearerToken, getSupabaseAdmin } from '../../_server-lib/payment/supabaseAdmin';

const router = Router();

/**
 * POST /api/admin/set-user-role
 * Admin-only: promote/demote user role via RPC (runs as service_role on backend).
 * Double-guard: backend checks is_admin() before calling the RPC.
 */
router.post('/set-user-role', async (req, res) => {
  try {
    const authHeader =
      typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined;

    const user = await getUserFromBearerToken(authHeader);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { p_user_id, p_role } = req.body as {
      p_user_id?: string;
      p_role?: string;
    };

    if (!p_user_id || !p_role) {
      return res.status(400).json({ error: 'Missing p_user_id or p_role' });
    }

    if (p_role !== 'admin' && p_role !== 'user') {
      return res.status(400).json({ error: 'Invalid role. Must be "admin" or "user"' });
    }

    const supabase = getSupabaseAdmin();

    // Double-guard: verify the calling user is an admin.
    // Don't use is_admin() RPC — the admin client runs as service_role
    // so auth.uid() would be NULL. Query profiles directly instead.
    const { data: profileCheck, error: profileCheckError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (profileCheckError || !profileCheck || profileCheck.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: admin access required' });
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
  } catch (err) {
    console.error('admin/set-user-role error:', err);
    const message = err instanceof Error ? err.message : 'Server error';
    return res.status(500).json({ error: 'Server error', detail: message });
  }
});

/**
 * POST /api/admin/set-user-plan
 * Admin-only: grant/revoke user plan via RPC (runs as service_role on backend).
 * Double-guard: backend checks is_admin() before calling the RPC.
 */
router.post('/set-user-plan', async (req, res) => {
  try {
    const authHeader =
      typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined;

    const user = await getUserFromBearerToken(authHeader);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { p_user_id, p_plan, p_duration_days } = req.body as {
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

    const supabase = getSupabaseAdmin();

    // Double-guard: verify the calling user is an admin.
    // Don't use is_admin() RPC — the admin client runs as service_role
    // so auth.uid() would be NULL. Query profiles directly instead.
    const { data: profileCheck, error: profileCheckError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (profileCheckError || !profileCheck || profileCheck.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: admin access required' });
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
  } catch (err) {
    console.error('admin/set-user-plan error:', err);
    const message = err instanceof Error ? err.message : 'Server error';
    return res.status(500).json({ error: 'Server error', detail: message });
  }
});

export default router;