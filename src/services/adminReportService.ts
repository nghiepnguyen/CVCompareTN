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
  /** Count of 'analyze' rows (success + error) since the start of the current calendar month (VN time) — independent of `range`. */
  totalAnalysesThisMonth: number;
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

// analysis_log.input_tokens/output_tokens only exist from this migration onward
// (supabase/migrations/20260704000000_analysis_log_token_usage.sql); older rows are
// backfilled with 0. Averages must exclude them from the denominator or they dilute
// avg token/cost toward 0 for any range (e.g. 30d) that still spans pre-migration rows.
const TOKEN_TRACKING_START_ISO = '2026-07-04T00:00:00.000Z';

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

function getCalendarMonthStart(): Date {
  const { y, m } = vnDateParts(new Date());
  return new Date(Date.UTC(y, m, 1, 0, 0, 0) - 7 * 60 * 60 * 1000);
}

// PostgREST caps rows per request (commonly 1000). Any query that can grow with
// user/analysis volume must paginate via .range() or it silently truncates and
// under-counts — page through until a short page signals the end.
const SUPABASE_PAGE_SIZE = 1000;

async function fetchAllRows<T>(
  buildPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await buildPage(from, from + SUPABASE_PAGE_SIZE - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < SUPABASE_PAGE_SIZE) break;
    from += SUPABASE_PAGE_SIZE;
  }
  return rows;
}

interface AnalysisLogRow {
  user_id: string | null;
  status: string;
  created_at: string;
  kind: string;
  input_tokens: number | null;
  output_tokens: number | null;
}

export async function getAdminReportStats(range: ReportRange): Promise<AdminReportStats> {
  const startIso = getRangeStart(range).toISOString();
  const monthStartIso = getCalendarMonthStart().toISOString();

  const [newUsersRes, logs, monthRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', startIso),
    fetchAllRows<AnalysisLogRow>((from, to) =>
      supabase
        .from('analysis_log')
        .select('user_id, status, created_at, kind, input_tokens, output_tokens')
        .gte('created_at', startIso)
        .order('created_at', { ascending: true })
        .range(from, to)
    ),
    // Calendar-month total (success + error), not scoped to `range`.
    supabase
      .from('analysis_log')
      .select('id', { count: 'exact', head: true })
      .eq('kind', 'analyze')
      .gte('created_at', monthStartIso),
  ]);

  if (newUsersRes.error) throw newUsersRes.error;
  if (monthRes.error) throw monthRes.error;

  const totalAnalysesThisMonth = monthRes.count ?? 0;

  // Only 'analyze' rows are "analyses" for the existing metrics below —
  // 'parse_cv'/'rewrite' rows are the auto-triggered follow-up Gemini calls
  // (see AnalysisRunContext.tsx), tracked only for token/cost totals.
  const analyzeLogs = logs.filter((l) => l.kind === 'analyze');

  const dailyMap = new Map<string, { success: number; error: number }>();
  const userCounts = new Map<string, number>();
  let totalSuccess = 0;
  let totalError = 0;

  for (const log of analyzeLogs) {
    const day = dayKey(log.created_at);
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
      userCounts.set(log.user_id, (userCounts.get(log.user_id) ?? 0) + 1);
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
    totalInputTokens += log.input_tokens ?? 0;
    totalOutputTokens += log.output_tokens ?? 0;
  }
  const totalCostUsd =
    (totalInputTokens / 1_000_000) * GEMINI_INPUT_PRICE_PER_1M_USD +
    (totalOutputTokens / 1_000_000) * GEMINI_OUTPUT_PRICE_PER_1M_USD;

  // Denominator for averages: successful 'analyze' rows created after token
  // tracking began. Excludes pre-migration rows (input/output_tokens backfilled
  // to 0) so a wide range like 30d doesn't drag the averages toward 0.
  const trackedSuccessCount = analyzeLogs.filter(
    (l) => l.status === 'success' && l.created_at >= TOKEN_TRACKING_START_ISO
  ).length;
  const avgInputTokens = trackedSuccessCount > 0 ? totalInputTokens / trackedSuccessCount : 0;
  const avgOutputTokens = trackedSuccessCount > 0 ? totalOutputTokens / trackedSuccessCount : 0;
  const avgCostUsd = trackedSuccessCount > 0 ? totalCostUsd / trackedSuccessCount : 0;

  return {
    newUsersCount: newUsersRes.count ?? 0,
    totalSuccess,
    totalError,
    totalAnalysesThisMonth,
    dailyCounts,
    topUsers,
    avgInputTokens,
    avgOutputTokens,
    avgTotalTokens: avgInputTokens + avgOutputTokens,
    avgCostUsd,
    totalCostUsd,
  };
}
