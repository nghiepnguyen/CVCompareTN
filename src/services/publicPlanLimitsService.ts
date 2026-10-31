import { supabase } from '../lib/supabase';

export interface PublicPlanLimits {
  free: number;
  pro: number;
  recruiter: number;
}

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
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const { data, error } = await supabase.rpc('get_public_plan_limits').abortSignal(controller.signal);
      if (error) throw error;
      const raw = data as PublicPlanLimits | null;
      if (!raw || ![raw.free, raw.pro, raw.recruiter].every(
        (value) => Number.isSafeInteger(value) && value >= 0
      )) {
        throw new Error('Invalid public plan limits');
      }
      const limits = { free: raw.free, pro: raw.pro, recruiter: raw.recruiter };
      cached = limits;
      return limits;
    } finally {
      clearTimeout(timer);
      pending = null;
    }
  })();

  return pending;
}

export function getCachedPublicPlanLimits(): PublicPlanLimits | null {
  return cached;
}
