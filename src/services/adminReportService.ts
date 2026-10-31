import { supabase } from '../lib/supabase';
import { vnStartOfDay } from '../lib/vnTime';
import { GEMINI_PRICING, LEGACY_LOG_MODEL, isGeminiModel } from '../lib/geminiModels';

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

export interface ModelUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface ErrorCategory {
  message: string;
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
  /** Models found in successful rows with no entry in GEMINI_PRICING — their tokens are excluded from cost. */
  unpricedModels: string[];
  /** Current quota cycle total across non-admin users — not scoped to `range`. */
  quotaUsedCurrentCycle: number;
  /** Server timestamp for the quota snapshot. */
  quotaAsOf: string;
  latencyP50Ms: number | null;
  latencyP95Ms: number | null;
  errorCategories: ErrorCategory[];
  modelUsage: ModelUsage[];
}

// Cost is priced per row's model in the client from the compact model buckets
// returned by the RPC; only raw tokens are persisted, so old rows use current
// rates (documented in the report UI). A NULL model means a pre-model-column
// row, all of which ran on LEGACY_LOG_MODEL.

interface RawModelUsage {
  model: string | null;
  input_tokens: number | string | null;
  output_tokens: number | string | null;
}

interface RawOps {
  latency_p50_ms: number | string | null;
  latency_p95_ms: number | string | null;
  error_categories: Array<{ message?: string; count?: number | string }> | null;
}

interface RawReport {
  new_users_count: number | string | null;
  total_success: number | string | null;
  total_error: number | string | null;
  daily_counts: DailyAnalysisCount[] | null;
  top_users: TopAnalysisUser[] | null;
  total_input_tokens: number | string | null;
  total_output_tokens: number | string | null;
  tracked_success_count: number | string | null;
  model_usage: RawModelUsage[] | null;
  quota_used_current_cycle: number | string | null;
  as_of: string | null;
}

function toNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

// Anchor "today" to ICT, matching the quota system's day boundary
// (current_quota_cycle) rather than the admin's browser timezone.
function getRangeStart(range: ReportRange): Date {
  return vnStartOfDay(new Date(), range === '7d' ? -6 : range === '30d' ? -29 : 0);
}

export async function getAdminReportStats(range: ReportRange): Promise<AdminReportStats> {
  const startIso = getRangeStart(range).toISOString();
  // Half-open [start, end): the RPC buckets by VN calendar day and zero-fills
  // every day in the range.
  const endIso = new Date().toISOString();

  const [statsRes, opsRes] = await Promise.all([
    supabase.rpc('admin_report_stats', { p_start: startIso, p_end: endIso }),
    supabase.rpc('admin_report_ops', { p_start: startIso, p_end: endIso }),
  ]);
  if (statsRes.error) throw statsRes.error;
  if (opsRes.error) throw opsRes.error;

  const raw = (statsRes.data ?? {}) as RawReport;
  const ops = (opsRes.data ?? {}) as RawOps;
  const modelUsageRaw = raw.model_usage ?? [];

  let totalCostUsd = 0;
  const unpricedModels = new Set<string>();
  const modelUsage: ModelUsage[] = [];
  for (const usage of modelUsageRaw) {
    const model = usage.model ?? LEGACY_LOG_MODEL;
    const inputTokens = toNumber(usage.input_tokens);
    const outputTokens = toNumber(usage.output_tokens);
    let costUsd = 0;
    if (isGeminiModel(model)) {
      const price = GEMINI_PRICING[model];
      costUsd =
        (inputTokens / 1_000_000) * price.inputPer1M +
        (outputTokens / 1_000_000) * price.outputPer1M;
      totalCostUsd += costUsd;
    } else {
      unpricedModels.add(model);
    }
    modelUsage.push({ model, inputTokens, outputTokens, costUsd });
  }

  const errorCategories: ErrorCategory[] = (ops.error_categories ?? []).map((row) => ({
    message: String(row.message ?? ''),
    count: toNumber(row.count),
  }));

  const totalInputTokens = toNumber(raw.total_input_tokens);
  const totalOutputTokens = toNumber(raw.total_output_tokens);
  const trackedSuccessCount = toNumber(raw.tracked_success_count);
  const avgInputTokens = trackedSuccessCount > 0 ? totalInputTokens / trackedSuccessCount : 0;
  const avgOutputTokens = trackedSuccessCount > 0 ? totalOutputTokens / trackedSuccessCount : 0;
  const avgCostUsd = trackedSuccessCount > 0 ? totalCostUsd / trackedSuccessCount : 0;

  return {
    newUsersCount: toNumber(raw.new_users_count),
    totalSuccess: toNumber(raw.total_success),
    totalError: toNumber(raw.total_error),
    dailyCounts: raw.daily_counts ?? [],
    topUsers: raw.top_users ?? [],
    avgInputTokens,
    avgOutputTokens,
    avgTotalTokens: avgInputTokens + avgOutputTokens,
    avgCostUsd,
    totalCostUsd,
    unpricedModels: Array.from(unpricedModels),
    quotaUsedCurrentCycle: toNumber(raw.quota_used_current_cycle),
    quotaAsOf: raw.as_of ?? endIso,
    latencyP50Ms: ops.latency_p50_ms == null ? null : toNumber(ops.latency_p50_ms),
    latencyP95Ms: ops.latency_p95_ms == null ? null : toNumber(ops.latency_p95_ms),
    errorCategories,
    modelUsage,
  };
}
