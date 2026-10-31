import { supabase } from '../lib/supabase';
import { PRO_MONTHLY_ANALYTICS_LIMIT, RECRUITER_MONTHLY_ANALYTICS_LIMIT } from './userService';

export interface PublicPlanLimits {
  free: number;
  pro: number;
  recruiter: number;
}

export const DEFAULT_PUBLIC_PLAN_LIMITS: PublicPlanLimits = {
  free: 5,
  pro: PRO_MONTHLY_ANALYTICS_LIMIT,
  recruiter: RECRUITER_MONTHLY_ANALYTICS_LIMIT,
};

let cached: PublicPlanLimits | null = null;
let pending: Promise<PublicPlanLimits> | null = null;

/**
 * Public plan limits for the landing/upgrade pricing tables. The RPC is
 * anon-readable and derives the free value from app_settings, so the marketing
 * copy follows the admin's global limit instead of a hardcoded number.
 */
export async function fetchPublicPlanLimits(force = false): Promise<PublicPlanLimits> {
  if (cached && !force) return cached;
  if (pending) return pending;

  pending = (async () => {
    try {
      const { data, error } = await supabase.rpc('get_public_plan_limits');
      if (error) throw error;
      const raw = (data ?? {}) as { free?: unknown; pro?: unknown; recruiter?: unknown };
      const limits: PublicPlanLimits = {
        free: Number(raw.free ?? DEFAULT_PUBLIC_PLAN_LIMITS.free),
        pro: Number(raw.pro ?? DEFAULT_PUBLIC_PLAN_LIMITS.pro),
        recruiter: Number(raw.recruiter ?? DEFAULT_PUBLIC_PLAN_LIMITS.recruiter),
      };
      cached = limits;
      return limits;
    } finally {
      pending = null;
    }
  })();

  return pending;
}

export function getCachedPublicPlanLimits(): PublicPlanLimits {
  return cached ?? DEFAULT_PUBLIC_PLAN_LIMITS;
}
