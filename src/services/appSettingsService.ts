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
  return 10;
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

  return parseLimitValue(data?.value ?? 10);
}

export async function updateDefaultMonthlyAnalyticsLimit(limit: number): Promise<void> {
  if (!Number.isInteger(limit) || limit < 0 || limit > 100000) {
    throw new Error('Invalid default monthly analytics limit');
  }

  // Privileged global setting: go through the admin API so validation and the
  // audit row are written server-side in the same transaction.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');

  const res = await fetch('/api/admin/update-global-limit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      p_key: DEFAULT_MONTHLY_ANALYTICS_LIMIT_KEY,
      p_value: limit,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string })?.error || `Request failed: ${res.status}`);
  }
}
