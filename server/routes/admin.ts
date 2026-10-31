import { Router } from 'express';
import { getUserFromBearerToken, getSupabaseAdmin } from '../../_server-lib/payment/supabaseAdmin';
import { handleAdminAction } from '../../_server-lib/admin/handler';

const router = Router();

/**
 * POST /api/admin/:action
 * set-user-role | set-user-plan | update-user | delete-user
 *
 * Authentication stays here (Express request shape); the shared handler owns
 * admin verification, the Postgres-backed rate limit, validation and dispatch.
 */
router.post('/:action', async (req, res) => {
  try {
    const authHeader =
      typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined;

    const user = await getUserFromBearerToken(authHeader);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const result = await handleAdminAction({
      action: req.params.action,
      body: req.body,
      callerId: user.id,
      supabase: getSupabaseAdmin(),
    });
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error('admin handler error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

export default router;
