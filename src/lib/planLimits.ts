import type { UserPlan } from '../services/userService';

export const MAX_BATCH_BY_PLAN: Record<UserPlan, number> = {
  free: 1,
  pro: 5,
  recruiter: 50,
};

export const MAX_SAVED_JD_BY_PLAN: Record<UserPlan, number> = {
  free: 3,
  pro: Number.POSITIVE_INFINITY,
  recruiter: Number.POSITIVE_INFINITY,
};

export const MAX_SAVED_CV_BY_PLAN: Record<UserPlan, number> = {
  free: 1,
  pro: 10,
  recruiter: 50,
};

export const HISTORY_DAYS_BY_PLAN: Record<UserPlan, number> = {
  free: 7,
  pro: 36500,
  recruiter: 36500,
};

export const MAX_CAMPAIGN_CVS: Record<UserPlan, number> = {
  free: 0,
  pro: 0,
  recruiter: 50,
};

export const MAX_CAMPAIGNS: Record<UserPlan, number> = {
  free: 0,
  pro: 0,
  recruiter: 10,
};

export function isProPlan(plan: UserPlan): boolean {
  return plan === 'pro';
}

export function isRecruiterPlan(plan: UserPlan): boolean {
  return plan === 'recruiter';
}

export function formatPlanExpiryDate(
  planExpiresAt: string | null | undefined,
  locale: 'vi' | 'en'
): string | null {
  if (!planExpiresAt) return null;
  const parsed = new Date(planExpiresAt);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString(locale === 'vi' ? 'vi-VN' : 'en-US', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}
