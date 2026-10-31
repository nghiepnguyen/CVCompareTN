import React, { useEffect, useState, useCallback, useRef } from 'react';
import { vnStartOfDay } from '../../lib/vnTime';
import { UserPlus, Activity, CheckCircle2, XCircle, BarChart3, Trophy, Loader2, AlertCircle, ArrowDownToLine, ArrowUpFromLine, Layers, DollarSign, Gauge, HelpCircle, RefreshCw, Timer, ListChecks, Download } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useUI } from '../../context/UIContext';
import { formatLabel } from '../../translations';
import { cn } from '../../lib/utils';
import { VN_TIME_ZONE } from '../../lib/vnTime';
import { csvDateStamp, downloadCsv } from '../../lib/csv';
import { logAdminExport } from '../../services/adminExportService';
import {
  getAdminReportStats,
  type AdminReportStats,
  type ReportRange,
} from '../../services/adminReportService';

type ReportUrlState = {
  range: ReportRange;
  start: string;
  end: string;
};

function dateInputValue(d: Date): string {
  const { y, m, day } = (() => {
    const vn = new Date(d.getTime() + 7 * 60 * 60 * 1000);
    return { y: vn.getUTCFullYear(), m: vn.getUTCMonth(), day: vn.getUTCDate() };
  })();
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function reportUrlState(): ReportUrlState {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('range');
  const range: ReportRange =
    raw === 'today' || raw === '7d' || raw === '30d' || raw === 'custom' ? raw : '7d';
  const today = dateInputValue(vnStartOfDay(new Date()));
  const weekAgo = dateInputValue(vnStartOfDay(new Date(), -6));
  const startParam = params.get('start');
  const endParam = params.get('end');
  return {
    range,
    start: startParam && /^\d{4}-\d{2}-\d{2}$/.test(startParam) ? startParam : weekAgo,
    end: endParam && /^\d{4}-\d{2}-\d{2}$/.test(endParam) ? endParam : today,
  };
}

export function AdminReportTab() {
  const { t, reportLanguage } = useUI();
  const dateLocale = reportLanguage === 'vi' ? 'vi-VN' : 'en-US';

  const [initialUrl] = useState(reportUrlState);
  const [range, setRange] = useState<ReportRange>(initialUrl.range);
  const [customStart, setCustomStart] = useState(initialUrl.start);
  const [customEnd, setCustomEnd] = useState(initialUrl.end);
  const [stats, setStats] = useState<AdminReportStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  // Guard against out-of-order responses: switching range quickly must not let
  // a slower, older request overwrite the stats for the range now selected.
  const requestIdRef = useRef(0);
  const loadStats = useCallback(async (r: ReportRange, start: string, end: string) => {
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const data = await getAdminReportStats(
        r,
        r === 'custom' ? { start, end } : undefined
      );
      if (requestId === requestIdRef.current) setStats(data);
    } catch (err: unknown) {
      if (requestId !== requestIdRef.current) return;
      const message = err instanceof Error ? err.message : String(err);
      setError(formatLabel(t.adminReportLoadError, { message }));
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  }, [t.adminReportLoadError]);

  useEffect(() => {
    void loadStats(range, customStart, customEnd);
  }, [range, customStart, customEnd, loadStats]);

  useEffect(() => {
    const onPopState = () => {
      const next = reportUrlState();
      setRange(next.range);
      setCustomStart(next.start);
      setCustomEnd(next.end);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (range !== '7d') params.set('range', range);
    if (range === 'custom') {
      params.set('start', customStart);
      params.set('end', customEnd);
    }
    const prefix = reportLanguage === 'en' ? '/en' : '/vi';
    const qs = params.toString();
    const next = `${prefix}/admin/report${qs ? `?${qs}` : ''}`;
    if (window.location.pathname + window.location.search !== next) {
      window.history.replaceState(null, '', next + window.location.hash);
    }
  }, [range, customStart, customEnd, reportLanguage]);

  // The report is a dashboard, not a realtime feed: refresh only while the tab
  // is visible so a forgotten admin tab doesn't keep querying the database.
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') void loadStats(range, customStart, customEnd);
    }, 60_000);
    return () => clearInterval(interval);
  }, [range, customStart, customEnd, loadStats]);

  const chartData = (stats?.dailyCounts ?? []).map((d) => ({
    ...d,
    label: new Date(`${d.date}T00:00:00Z`).toLocaleDateString(dateLocale, { day: '2-digit', month: '2-digit', timeZone: 'UTC' }),
  }));

  const formatTokens = (value: number) => Math.round(value).toLocaleString(dateLocale);
  const formatCostUsd = (value: number, fractionDigits: number) =>
    value.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
  const quotaAsOfLabel = stats?.quotaAsOf
    ? new Date(stats.quotaAsOf).toLocaleTimeString(dateLocale, {
        timeZone: VN_TIME_ZONE,
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

  const handleExportReport = async () => {
    if (!stats || exportBusy) return;
    setExportBusy(true);
    setError(null);
    setExportMessage(null);
    try {
      const rows: Array<Array<string | number | null>> = [
        ['quota_current_cycle', stats.quotaUsedCurrentCycle, stats.quotaAsOf],
        [],
        ['section', 'date', 'success', 'error'],
        ...stats.dailyCounts.map((row) => ['daily', row.date, row.success, row.error]),
        [],
        ['section', 'email', 'display_name', 'count'],
        ...stats.topUsers.map((row) => ['top_user', row.email, row.displayName, row.count]),
        [],
        ['section', 'model', 'input_tokens', 'output_tokens', 'cost_usd'],
        ...stats.modelUsage.map((row) => [
          'model',
          row.model,
          row.inputTokens,
          row.outputTokens,
          row.costUsd.toFixed(6),
        ]),
        [],
        ['section', 'message', 'count'],
        ...stats.errorCategories.map((row) => ['error', row.message, row.count]),
      ];
      await logAdminExport('report', stats.dailyCounts.length + stats.topUsers.length, {
        range,
        ...(range === 'custom' ? { start: customStart, end: customEnd } : {}),
      });
      downloadCsv(`admin-report-${range}-${csvDateStamp()}.csv`, rows);
      setExportMessage(t.adminToastExported);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExportBusy(false);
    }
  };

  const summaryCards: Array<{
    label: string;
    value: string | number;
    icon: React.ComponentType<{ className?: string }>;
    color: string;
    bg: string;
    tooltip?: string;
    subtitle?: string;
  }> = [
    {
      label: t.adminReportNewUsers,
      value: stats?.newUsersCount ?? 0,
      icon: UserPlus,
      color: 'text-accent',
      bg: 'bg-accent-light',
    },
    {
      label: t.adminReportTotalAnalyses,
      value: (stats?.totalSuccess ?? 0) + (stats?.totalError ?? 0),
      icon: Activity,
      color: 'text-text-main',
      bg: 'bg-surface-secondary',
    },
    {
      label: t.adminReportSuccessCount,
      value: stats?.totalSuccess ?? 0,
      icon: CheckCircle2,
      color: 'text-success',
      bg: 'bg-success-light',
    },
    {
      label: t.adminReportErrorCount,
      value: stats?.totalError ?? 0,
      icon: XCircle,
      color: 'text-error',
      bg: 'bg-error-light',
    },
    {
      label: t.adminReportQuotaUsed,
      value: (stats?.quotaUsedCurrentCycle ?? 0).toLocaleString(dateLocale),
      icon: Gauge,
      color: 'text-accent',
      bg: 'bg-accent-light',
      tooltip: t.adminReportQuotaTooltip,
      subtitle: formatLabel(t.adminReportQuotaAsOf, { time: quotaAsOfLabel }),
    },
  ];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Range Filter */}
      <div className="flex items-center gap-2">
        <div className="flex items-center bg-surface-secondary rounded-lg p-0.5 border border-border">
          {([
            { value: 'today', label: t.adminReportFilterToday },
            { value: '7d', label: t.adminReportFilterWeek },
            { value: '30d', label: t.adminReportFilterMonth },
            { value: 'custom', label: t.adminReportFilterCustom },
          ] as const).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setRange(opt.value)}
              className={cn(
                'px-4 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-wide transition-all cursor-pointer hover:scale-105 active:scale-95',
                range === opt.value
                  ? 'bg-surface text-accent shadow-sm border border-border'
                  : 'text-text-muted hover:text-text-main'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {isLoading && <Loader2 className="w-4 h-4 text-text-light animate-spin" />}
        <button
          type="button"
          onClick={() => void loadStats(range, customStart, customEnd)}
          disabled={isLoading}
          title={t.adminReportRefresh}
          aria-label={t.adminReportRefresh}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-text-muted cursor-pointer hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
          {t.adminReportRefresh}
        </button>
        <button
          type="button"
          onClick={() => void handleExportReport()}
          disabled={!stats || exportBusy}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-text-muted cursor-pointer hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          {exportBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          {t.adminExportReportCsv}
        </button>
      </div>

      {range === 'custom' && (
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-text-light">
              {t.adminReportCustomFrom}
            </span>
            <input
              type="date"
              value={customStart}
              max={customEnd}
              onChange={(e) => setCustomStart(e.target.value)}
              className="rounded-lg border border-border bg-surface px-2 py-1.5 text-xs font-bold text-text-main"
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-text-light">
              {t.adminReportCustomTo}
            </span>
            <input
              type="date"
              value={customEnd}
              min={customStart}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="rounded-lg border border-border bg-surface px-2 py-1.5 text-xs font-bold text-text-main"
            />
          </label>
        </div>
      )}

      {exportMessage && (
        <p className="text-xs font-bold text-success">{exportMessage}</p>
      )}

      {error && (
        <div role="alert" className="p-4 rounded-xl border bg-error-light border-error/10 text-error flex items-center gap-3">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="text-xs font-bold">{error}</span>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {summaryCards.map((card) => (
          <div key={card.label} className="bg-surface border border-border rounded-2xl p-5 shadow-sm space-y-3">
            <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', card.bg)}>
              <card.icon className={cn('w-5 h-5', card.color)} />
            </div>
            <div>
              <div className="text-2xl font-black text-text-main leading-none">{card.value}</div>
              <div className="text-[10px] font-bold text-text-light uppercase tracking-widest mt-1 flex items-center gap-1">
                {card.label}
                {card.tooltip && (
                  <span title={card.tooltip} className="cursor-help">
                    <HelpCircle className="w-3 h-3 text-text-light shrink-0" />
                  </span>
                )}
              </div>
              {card.subtitle && (
                <div className="mt-1 text-[10px] font-medium text-text-light">{card.subtitle}</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Token & Cost */}
      <div className="space-y-4">
        <h3 className="font-bold text-text-main flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-accent" />
          {t.adminReportTokenSectionTitle}
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: t.adminReportAvgInputTokens, value: formatTokens(stats?.avgInputTokens ?? 0), icon: ArrowDownToLine, color: 'text-accent', bg: 'bg-accent-light', tooltip: t.adminReportAvgTokenTooltip },
            { label: t.adminReportAvgOutputTokens, value: formatTokens(stats?.avgOutputTokens ?? 0), icon: ArrowUpFromLine, color: 'text-text-main', bg: 'bg-surface-secondary', tooltip: t.adminReportAvgTokenTooltip },
            { label: t.adminReportAvgTotalTokens, value: formatTokens(stats?.avgTotalTokens ?? 0), icon: Layers, color: 'text-text-main', bg: 'bg-surface-secondary', tooltip: t.adminReportAvgTokenTooltip },
          ].map((card) => (
            <div key={card.label} className="bg-surface border border-border rounded-2xl p-5 shadow-sm space-y-3">
              <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', card.bg)}>
                <card.icon className={cn('w-5 h-5', card.color)} />
              </div>
              <div>
                <div className="text-2xl font-black text-text-main leading-none">{card.value}</div>
                <div className="text-[10px] font-bold text-text-light uppercase tracking-widest mt-1 flex items-center gap-1">
                  {card.label}
                  <span title={card.tooltip} className="cursor-help">
                    <HelpCircle className="w-3 h-3 text-text-light shrink-0" />
                  </span>
                </div>
              </div>
            </div>
          ))}
          <div className="bg-surface border border-border rounded-2xl p-5 shadow-sm space-y-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-success-light">
              <DollarSign className="w-5 h-5 text-success" />
            </div>
            <div>
              <div className="text-2xl font-black text-text-main leading-none">
                {formatCostUsd(stats?.avgCostUsd ?? 0, 4)}
              </div>
              <div className="text-[10px] font-bold text-text-light uppercase tracking-widest mt-1 flex items-center gap-1">
                {t.adminReportAvgCost}
                <span title={t.adminReportAvgTokenTooltip} className="cursor-help">
                  <HelpCircle className="w-3 h-3 text-text-light shrink-0" />
                </span>
              </div>
              <div className="text-[11px] text-text-light mt-1">
                {formatLabel(t.adminReportTotalCostSubtitle, { amount: formatCostUsd(stats?.totalCostUsd ?? 0, 2) })}
              </div>
              {stats && stats.unpricedModels.length > 0 && (
                <div className="text-[11px] font-bold text-warning mt-1">
                  {formatLabel(t.adminReportUnpricedModels, { models: stats.unpricedModels.join(', ') })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Operations + model mix */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 font-bold text-text-main">
            <Timer className="h-5 w-5 text-accent" />
            {t.adminReportOpsTitle}
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: t.adminReportLatencyP50, value: stats?.latencyP50Ms ?? null },
              { label: t.adminReportLatencyP95, value: stats?.latencyP95Ms ?? null },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border border-border bg-surface-secondary/60 p-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-text-light">{item.label}</div>
                <div className="mt-1 text-xl font-black text-text-main">
                  {item.value === null ? '—' : `${item.value.toLocaleString(dateLocale)} ms`}
                </div>
              </div>
            ))}
          </div>

          <h4 className="mb-2 mt-5 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-text-muted">
            <ListChecks className="h-3.5 w-3.5" />
            {t.adminReportErrorCategories}
          </h4>
          {(stats?.errorCategories.length ?? 0) === 0 ? (
            <p className="text-xs text-text-muted">{t.adminReportNoErrors}</p>
          ) : (
            <ul className="space-y-1.5">
              {stats?.errorCategories.map((row) => (
                <li key={row.message} className="flex items-center justify-between gap-3 rounded-lg bg-error-light/50 px-2.5 py-1.5">
                  <span className="truncate font-mono text-[10px] text-error" title={row.message}>
                    {row.message || '—'}
                  </span>
                  <span className="text-xs font-black text-error">{row.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 font-bold text-text-main">
            <Layers className="h-5 w-5 text-accent" />
            {t.adminReportModelMix}
          </h3>
          {(stats?.modelUsage.length ?? 0) === 0 ? (
            <p className="text-xs text-text-muted">{t.adminReportEmptyState}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border text-[9px] font-black uppercase tracking-wider text-text-light">
                    <th scope="col" className="py-2 pr-2">Model</th>
                    <th scope="col" className="py-2 pr-2 text-right">In</th>
                    <th scope="col" className="py-2 pr-2 text-right">Out</th>
                    <th scope="col" className="py-2 text-right">Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {stats?.modelUsage.map((row) => (
                    <tr key={row.model}>
                      <td className="py-2 pr-2 font-mono text-[10px] text-text-main">{row.model}</td>
                      <td className="py-2 pr-2 text-right text-text-muted">{formatTokens(row.inputTokens)}</td>
                      <td className="py-2 pr-2 text-right text-text-muted">{formatTokens(row.outputTokens)}</td>
                      <td className="py-2 text-right font-bold text-text-main">{formatCostUsd(row.costUsd, 4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Daily Chart */}
      <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm">
        <h3 className="font-bold text-text-main flex items-center gap-2 mb-6">
          <BarChart3 className="w-5 h-5 text-accent" />
          {t.adminReportDailyChartTitle}
        </h3>
        {chartData.every((d) => d.success + d.error === 0) ? (
          <p className="text-sm text-text-muted text-center py-12">{t.adminReportEmptyState}</p>
        ) : (
          <div className="h-64 min-h-[256px] w-full min-w-0 shrink-0">
            <ResponsiveContainer width="100%" height={256} debounce={32}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--color-text-light)' }} />
                <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--color-text-light)' }} />
                <Tooltip
                  cursor={{ fill: 'var(--color-surface-secondary)' }}
                  contentStyle={{ borderRadius: '1rem', background: '#1F2937', border: '1px solid #374151', fontSize: '12px' }}
                  labelStyle={{ color: '#F9FAFB', fontWeight: 'bold' }}
                />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="success" name={t.adminReportSuccessCount} stackId="a" fill="var(--color-success)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="error" name={t.adminReportErrorCount} stackId="a" fill="var(--color-error)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Top Users */}
      <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sm">
        <div className="p-6 pb-0">
          <h3 className="font-bold text-text-main flex items-center gap-2 mb-4">
            <Trophy className="w-5 h-5 text-warning" />
            {t.adminReportTopUsersTitle}
          </h3>
        </div>
        {(stats?.topUsers.length ?? 0) === 0 ? (
          <p className="text-sm text-text-muted text-center py-12">{t.adminReportEmptyState}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-secondary/50 border-b border-border">
                  <th className="px-6 py-3 text-[10px] font-black text-text-light uppercase tracking-[0.15em] w-12">{t.adminReportColRank}</th>
                  <th className="px-6 py-3 text-[10px] font-black text-text-light uppercase tracking-[0.15em]">{t.adminReportColUser}</th>
                  <th className="px-6 py-3 text-[10px] font-black text-text-light uppercase tracking-[0.15em] text-right">
                    <span className="inline-flex items-center gap-1 justify-end">
                      {t.adminReportColCount}
                      <span title={t.adminReportColCountTooltip} className="cursor-help">
                        <HelpCircle className="w-3 h-3 text-text-light shrink-0" />
                      </span>
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {stats?.topUsers.map((u, idx) => (
                  <tr key={u.userId} className="hover:bg-surface-secondary/80 transition-all">
                    <td className="px-6 py-3 text-sm font-black text-text-light">{idx + 1}</td>
                    <td className="px-6 py-3">
                      <div className="text-sm font-bold text-text-main leading-tight">{u.displayName || t.adminGuest}</div>
                      <div className="text-[11px] text-text-light font-mono truncate tracking-tighter">{u.email}</div>
                    </td>
                    <td className="px-6 py-3 text-right text-sm font-black text-accent">{u.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
