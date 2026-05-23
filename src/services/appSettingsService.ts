import { supabase } from '../lib/supabase';

export const DEFAULT_MONTHLY_ANALYTICS_LIMIT_KEY = 'default_monthly_analytics_limit';

function parseLimitValue(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    if (!Number.isNaN(parsed) && parsed >= 0) return parsed;
  }
  return 20;
}

export async function getDefaultMonthlyAnalyticsLimit(): Promise<number> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', DEFAULT_MONTHLY_ANALYTICS_LIMIT_KEY)
    .maybeSingle();

  if (error) {
    console.error('getDefaultMonthlyAnalyticsLimit failed:', error);
    throw error;
  }

  return parseLimitValue(data?.value ?? 20);
}

export async function updateDefaultMonthlyAnalyticsLimit(limit: number): Promise<void> {
  if (!Number.isFinite(limit) || limit < 0) {
    throw new Error('Invalid default monthly analytics limit');
  }

  const { data: { user } } = await supabase.auth.getUser();

  const { error } = await supabase
    .from('app_settings')
    .upsert({
      key: DEFAULT_MONTHLY_ANALYTICS_LIMIT_KEY,
      value: Math.floor(limit),
      updated_at: new Date().toISOString(),
      updated_by: user?.id ?? null,
    });

  if (error) {
    console.error('updateDefaultMonthlyAnalyticsLimit failed:', error);
    throw error;
  }
}
