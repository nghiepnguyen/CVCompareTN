import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors, handlePreflight, rejectOversizedBody, BODY_LIMITS } from '../_server-lib/http/guard.js';
import { initSentryServer, Sentry } from '../_server-lib/sentry.js';
import { getUserFromBearerToken, getSupabaseAdmin } from '../_server-lib/payment/supabaseAdmin.js';
import { handleAdminAction } from '../_server-lib/admin/handler.js';
import { handleCronHealth } from '../_server-lib/admin/cronHealth.js';
import { validBearerSecret } from '../_server-lib/http/bearerSecret.js';

/**
 * Unified admin handler — dispatches by URL path segment.
 *
 * Vercel rewrite maps /api/admin/{action} → /api/admin.ts
 * Actions: set-user-role, set-user-plan, update-user, delete-user (POST, admin JWT);
 * cron-health (GET, bearer CRON_HEALTH_SECRET; off while the secret is unset).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  initSentryServer();

  applyCors(req, res);
  if (handlePreflight(req, res)) return;

  const urlPath = new URL(req.url || '', `https://${req.headers.host}`).pathname;
  const segments = urlPath.replace(/\/$/, '').split('/');
  const action = segments[segments.length - 1] || '';

  if (action === 'cron-health') {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const auth = typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined;
    if (!validBearerSecret(auth, process.env.CRON_HEALTH_SECRET)) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const result = await handleCronHealth(req.query?.jobs, getSupabaseAdmin());
      return res.status(result.status).json(result.body);
    } catch (err) {
      Sentry.captureException(err);
      await Sentry.flush(2000);
      return res.status(500).json({ healthy: false, error: 'server_error' });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (rejectOversizedBody(req, res, BODY_LIMITS.json)) return;

  try {
    const authHeader =
      typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined;
    const user = await getUserFromBearerToken(authHeader);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const result = await handleAdminAction({
      action,
      body: req.body,
      callerId: user.id,
      supabase: getSupabaseAdmin(),
    });
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error('admin handler error:', err);
    Sentry.captureException(err);
    // Vercel may freeze the function after the response; send the event first.
    await Sentry.flush(2000);
    return res.status(500).json({ error: 'Server error' });
  }
}
