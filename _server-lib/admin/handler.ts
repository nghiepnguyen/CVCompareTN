import type { SupabaseClient } from '@supabase/supabase-js';
import { adminDeleteUser } from './deleteUser.js';
import { logAdminAudit } from './audit.js';
import { enforceRateLimit, rateLimitSubject } from '../rateLimit.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AdminActionResult = {
  status: number;
  body: Record<string, unknown>;
};

type RpcError = { message?: string; code?: string } | null;

function invalid(message: string): AdminActionResult {
  return { status: 400, body: { error: message } };
}

function rpcFailure(error: NonNullable<RpcError>, fallback: string): AdminActionResult {
  if (error.code === '22023') return { status: 400, body: { error: error.message || fallback } };
  if (error.code === '42501') return { status: 403, body: { error: 'Forbidden' } };
  if (error.code === 'P0002') return { status: 404, body: { error: 'User not found' } };
  return { status: 500, body: { error: fallback } };
}

function readUuid(body: Record<string, unknown>, key = 'p_user_id'): string | null {
  const value = body[key];
  return typeof value === 'string' && UUID_RE.test(value) ? value : null;
}

function readDuration(body: Record<string, unknown>): number {
  return body.p_duration_days === undefined ? 30 : Number(body.p_duration_days);
}

/**
 * Shared implementation for /api/admin on both Vercel and Express.
 *
 * Authentication happens in the thin surface handler; this function verifies
 * the caller is an admin, applies the shared Postgres-backed rate limit, and
 * dispatches the action. Keeping one copy avoids the Vercel/Express drift that
 * previously let the two surfaces differ in validation and rate limiting.
 */
export async function handleAdminAction(input: {
  action: string;
  body: unknown;
  callerId: string;
  supabase: SupabaseClient;
}): Promise<AdminActionResult> {
  const { action, callerId, supabase } = input;
  const body =
    input.body && typeof input.body === 'object' && !Array.isArray(input.body)
      ? (input.body as Record<string, unknown>)
      : {};

  if (!(await enforceRateLimit({ bucket: 'admin', subject: rateLimitSubject(callerId) }))) {
    return { status: 429, body: { error: 'Too many admin requests. Please try again later.' } };
  }

  const { data: caller, error: callerError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', callerId)
    .maybeSingle();

  if (callerError) {
    console.error('Admin caller lookup failed:', callerError);
    return { status: 500, body: { error: 'Server error' } };
  }
  if (!caller || caller.role !== 'admin') {
    return { status: 403, body: { error: 'Forbidden: admin access required' } };
  }

  switch (action) {
    case 'set-user-role': {
      const targetId = readUuid(body);
      const role = body.p_role;
      if (!targetId || (role !== 'admin' && role !== 'user')) {
        return invalid('Missing/invalid p_user_id or p_role');
      }
      if (targetId === callerId && role === 'user') {
        return invalid('Cannot demote yourself');
      }

      const { error } = await supabase.rpc('set_user_role', {
        p_user_id: targetId,
        p_role: role,
      });
      if (error) return rpcFailure(error as NonNullable<RpcError>, 'Failed to update user role');

      await logAdminAudit(supabase, callerId, 'update_role', targetId, { role });
      return { status: 200, body: { success: true } };
    }

    case 'set-user-plan': {
      const targetId = readUuid(body);
      const plan = body.p_plan;
      const duration = readDuration(body);
      if (!targetId || (plan !== 'free' && plan !== 'pro' && plan !== 'recruiter')) {
        return invalid('Missing/invalid p_user_id or p_plan');
      }
      if (!Number.isInteger(duration) || duration < 1 || duration > 3650) {
        return invalid('p_duration_days must be an integer between 1 and 3650');
      }

      const { error } = await supabase.rpc('admin_set_user_plan', {
        p_user_id: targetId,
        p_plan: plan,
        p_duration_days: duration,
      });
      if (error) return rpcFailure(error as NonNullable<RpcError>, 'Failed to update user plan');

      await logAdminAudit(supabase, callerId, 'update_plan', targetId, {
        plan,
        duration_days: duration,
      });
      return { status: 200, body: { success: true } };
    }

    case 'update-user': {
      const targetId = readUuid(body);
      const plan = body.p_plan;
      const duration = readDuration(body);
      const limitMode = body.p_limit_mode ?? 'keep';
      const limit = body.p_limit;

      if (!targetId) return invalid('Missing/invalid p_user_id');
      if (plan !== undefined && plan !== null && plan !== 'free' && plan !== 'pro' && plan !== 'recruiter') {
        return invalid('Invalid p_plan');
      }
      if (plan !== undefined && plan !== null && (!Number.isInteger(duration) || duration < 1 || duration > 3650)) {
        return invalid('p_duration_days must be an integer between 1 and 3650');
      }
      if (limitMode !== 'keep' && limitMode !== 'inherit' && limitMode !== 'custom') {
        return invalid('Invalid p_limit_mode');
      }
      if (
        limitMode === 'custom' &&
        (!Number.isInteger(limit) || (limit as number) < 0)
      ) {
        return invalid('p_limit must be a non-negative integer for custom mode');
      }

      const { error } = await supabase.rpc('admin_update_user', {
        p_admin_id: callerId,
        p_user_id: targetId,
        p_plan: plan ?? null,
        p_duration_days: duration,
        p_limit_mode: limitMode,
        p_limit: limitMode === 'custom' ? limit : null,
      });
      if (error) return rpcFailure(error as NonNullable<RpcError>, 'Failed to update user');

      return { status: 200, body: { success: true } };
    }

    case 'update-global-limit': {
      const key = body.p_key ?? 'default_monthly_analytics_limit';
      const value = body.p_value;
      if (key !== 'default_monthly_analytics_limit') {
        return invalid('Invalid setting key');
      }
      if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 100000) {
        return invalid('p_value must be an integer between 0 and 100000');
      }

      const { error } = await supabase.rpc('admin_update_app_setting', {
        p_admin_id: callerId,
        p_key: key,
        p_value: value,
      });
      if (error) return rpcFailure(error as NonNullable<RpcError>, 'Failed to update app setting');

      return { status: 200, body: { success: true } };
    }

    case 'bulk-users': {
      const ids = body.p_user_ids;
      const bulkAction = body.p_action;
      if (
        !Array.isArray(ids) ||
        ids.length < 1 ||
        ids.length > 100 ||
        !ids.every((id) => typeof id === 'string' && UUID_RE.test(id))
      ) {
        return invalid('p_user_ids must contain 1–100 UUIDs');
      }
      if (bulkAction !== 'mark_read' && bulkAction !== 'lock' && bulkAction !== 'unlock') {
        return invalid('Invalid p_action');
      }

      const { data, error } = await supabase.rpc('admin_bulk_update_users', {
        p_admin_id: callerId,
        p_user_ids: ids,
        p_action: bulkAction,
      });
      if (error) return rpcFailure(error as NonNullable<RpcError>, 'Failed to update users');

      return { status: 200, body: { success: true, count: Number(data ?? 0) } };
    }

    case 'delete-user': {
      const targetId = readUuid(body);
      if (!targetId) return invalid('Missing/invalid p_user_id');

      const result = await adminDeleteUser(supabase, callerId, targetId);
      if (result.ok === false) {
        return { status: result.status, body: { error: result.error } };
      }
      return { status: 200, body: { success: true, storageErrors: result.storageErrors } };
    }

    default:
      return { status: 404, body: { error: `Unknown admin action: ${action}` } };
  }
}
