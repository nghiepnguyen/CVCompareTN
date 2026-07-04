import { supabase } from '../lib/supabase';

export type ReportRange = 'today' | '7d' | '30d';

export interface DailyAnalysisCount {
  date: string; // YYYY-MM-DD
  success: number;
  error: number;
}

export interface TopAnalysisUser {
  userId: string;
  email: string;
  displayName: string;
  count: number;
}

export interface AdminReportStats {
  newUsersCount: number;
  totalSuccess: number;
  totalError: number;
  dailyCounts: DailyAnalysisCount[];
  topUsers: TopAnalysisUser[];
  avgInputTokens: number;
  avgOutputTokens: number;
  avgTotalTokens: number;
  avgCostUsd: number;
  totalCostUsd: number;
}

// gemini-3-flash-preview official pricing (ai.google.dev/gemini-api/docs/pricing).
// Update here if the model or its pricing changes — historical rows keep
// whatever cost was computed with the rate in effect when they're viewed,
// since raw tokens (not cost) are what's persisted in analysis_log.
const GEMINI_INPUT_PRICE_PER_1M_USD = 0.5;
const GEMINI_OUTPUT_PRICE_PER_1M_USD = 3.0;

// Anchor "today" to Asia/Ho_Chi_Minh (GMT+7, no DST), matching the quota
// system's day boundary (current_quota_cycle) rather than the admin's browser timezone.
function vnDateParts(d: Date): { y: number; m: number; day: number } {
  const vn = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  return { y: vn.getUTCFullYear(), m: vn.getUTCMonth(), day: vn.getUTCDate() };
}

function getRangeStart(range: ReportRange): Date {
  const { y, m, day } = vnDateParts(new Date());
  const startUtcMs = Date.UTC(y, m, day, 0, 0, 0) - 7 * 60 * 60 * 1000;
  const start = new Date(startUtcMs);
  if (range === '7d') start.setUTCDate(start.getUTCDate() - 6);
  if (range === '30d') start.setUTCDate(start.getUTCDate() - 29);
  return start;
}

function dayKey(iso: string): string {
  const { y, m, day } = vnDateParts(new Date(iso));
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export async function getAdminReportStats(range: ReportRange): Promise<AdminReportStats> {
  const startIso = getRangeStart(range).toISOString();

  const [newUsersRes, logsRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', startIso),
    supabase
      .from('analysis_log')
      .select('user_id, status, created_at, kind, input_tokens, output_tokens')
      .gte('created_at', startIso)
      .order('created_at', { ascending: true }),
  ]);

  if (newUsersRes.error) throw newUsersRes.error;
  if (logsRes.error) throw logsRes.error;

  const logs = logsRes.data ?? [];
  // Only 'analyze' rows are "analyses" for the existing metrics below —
  // 'parse_cv'/'rewrite' rows are the auto-triggered follow-up Gemini calls
  // (see AnalysisRunContext.tsx), tracked only for token/cost totals.
  const analyzeLogs = logs.filter((l) => l.kind === 'analyze');

  const dailyMap = new Map<string, { success: number; error: number }>();
  const userCounts = new Map<string, number>();
  let totalSuccess = 0;
  let totalError = 0;

  for (const log of analyzeLogs) {
    const day = dayKey(log.created_at as string);
    const bucket = dailyMap.get(day) ?? { success: 0, error: 0 };
    if (log.status === 'success') {
      bucket.success += 1;
      totalSuccess += 1;
    } else {
      bucket.error += 1;
      totalError += 1;
    }
    dailyMap.set(day, bucket);

    if (log.user_id) {
      userCounts.set(log.user_id as string, (userCounts.get(log.user_id as string) ?? 0) + 1);
    }
  }

  const dailyCounts = Array.from(dailyMap.entries())
    .map(([date, v]) => ({ date, success: v.success, error: v.error }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const topUserIds = Array.from(userCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  let topUsers: TopAnalysisUser[] = [];
  if (topUserIds.length > 0) {
    const { data: profilesData, error: profilesError } = await supabase
      .from('profiles')
      .select('id, email, display_name')
      .in('id', topUserIds.map(([id]) => id));

    if (profilesError) throw profilesError;

    const profileMap = new Map(
      (profilesData ?? []).map((p) => [p.id as string, p as { email: string; display_name: string | null }])
    );

    topUsers = topUserIds.map(([userId, count]) => {
      const profile = profileMap.get(userId);
      return {
        userId,
        email: profile?.email ?? '',
        displayName: profile?.display_name ?? '',
        count,
      };
    });
  }

  // Token/cost totals span all kinds (analyze + parse_cv + rewrite) — a single
  // "analysis" fires all three Gemini calls, so cost-per-analysis needs their
  // combined spend, averaged over the count of successful *analyze* rows.
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  for (const log of logs) {
    if (log.status !== 'success') continue;
    totalInputTokens += (log.input_tokens as number | null) ?? 0;
    totalOutputTokens += (log.output_tokens as number | null) ?? 0;
  }
  const totalCostUsd =
    (totalInputTokens / 1_000_000) * GEMINI_INPUT_PRICE_PER_1M_USD +
    (totalOutputTokens / 1_000_000) * GEMINI_OUTPUT_PRICE_PER_1M_USD;
  const avgInputTokens = totalSuccess > 0 ? totalInputTokens / totalSuccess : 0;
  const avgOutputTokens = totalSuccess > 0 ? totalOutputTokens / totalSuccess : 0;
  const avgCostUsd = totalSuccess > 0 ? totalCostUsd / totalSuccess : 0;

  return {
    newUsersCount: newUsersRes.count ?? 0,
    totalSuccess,
    totalError,
    dailyCounts,
    topUsers,
    avgInputTokens,
    avgOutputTokens,
    avgTotalTokens: avgInputTokens + avgOutputTokens,
    avgCostUsd,
    totalCostUsd,
  };
}
