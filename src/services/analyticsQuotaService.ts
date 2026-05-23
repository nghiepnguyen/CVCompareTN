import { supabase } from '../lib/supabase';

export type UserPlan = 'free' | 'pro';

export type AnalyticsQuota = {
  allowed: boolean;
  used: number;
  limit: number | null;
  month: string;
  plan?: UserPlan;
};

export async function checkAnalyticsQuota(
  userId: string,
  additional = 0
): Promise<AnalyticsQuota> {
  const { data, error } = await supabase.rpc('check_analytics_quota', {
    p_user_id: userId,
    p_additional: additional,
  });

  if (error) {
    console.error('check_analytics_quota failed:', error);
    throw error;
  }

  const row = (data ?? {}) as Record<string, unknown>;
  const planRaw = row.plan;
  const plan: UserPlan | undefined =
    planRaw === 'pro' ? 'pro' : planRaw === 'free' ? 'free' : undefined;

  return {
    allowed: Boolean(row.allowed),
    used: typeof row.used === 'number' ? row.used : Number(row.used) || 0,
    limit:
      row.limit === null || row.limit === undefined
        ? null
        : typeof row.limit === 'number'
          ? row.limit
          : Number(row.limit),
    month: typeof row.month === 'string' ? row.month : '',
    plan,
  };
}
