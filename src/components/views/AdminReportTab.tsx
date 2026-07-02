import React, { useEffect, useState, useCallback } from 'react';
import { UserPlus, Activity, CheckCircle2, XCircle, BarChart3, Trophy, Loader2, AlertCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useUI } from '../../context/UIContext';
import { formatLabel } from '../../translations';
import { cn } from '../../lib/utils';
import {
  getAdminReportStats,
  type AdminReportStats,
  type ReportRange,
} from '../../services/adminReportService';

export function AdminReportTab() {
  const { t, reportLanguage } = useUI();
  const dateLocale = reportLanguage === 'vi' ? 'vi-VN' : 'en-US';

  const [range, setRange] = useState<ReportRange>('7d');
  const [stats, setStats] = useState<AdminReportStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(async (r: ReportRange) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getAdminReportStats(r);
      setStats(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(formatLabel(t.adminReportLoadError, { message }));
    } finally {
      setIsLoading(false);
    }
  }, [t.adminReportLoadError]);

  useEffect(() => {
    void loadStats(range);
  }, [range, loadStats]);

  const chartData = (stats?.dailyCounts ?? []).map((d) => ({
    ...d,
    label: new Date(d.date).toLocaleDateString(dateLocale, { day: '2-digit', month: '2-digit' }),
  }));

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Range Filter */}
      <div className="flex items-center gap-2">
        <div className="flex items-center bg-surface-secondary rounded-lg p-0.5 border border-border">
          {([
            { value: 'today', label: t.adminReportFilterToday },
            { value: '7d', label: t.adminReportFilterWeek },
            { value: '30d', label: t.adminReportFilterMonth },
          ] as const).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setRange(opt.value)}
              className={cn(
                'px-4 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-wide transition-all cursor-pointer',
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
      </div>

      {error && (
        <div className="p-4 rounded-xl border bg-error-light border-error/10 text-error flex items-center gap-3">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="text-xs font-bold">{error}</span>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: t.adminReportNewUsers, value: stats?.newUsersCount ?? 0, icon: UserPlus, color: 'text-accent', bg: 'bg-accent-light' },
          { label: t.adminReportTotalAnalyses, value: (stats?.totalSuccess ?? 0) + (stats?.totalError ?? 0), icon: Activity, color: 'text-text-main', bg: 'bg-surface-secondary' },
          { label: t.adminReportSuccessCount, value: stats?.totalSuccess ?? 0, icon: CheckCircle2, color: 'text-success', bg: 'bg-success-light' },
          { label: t.adminReportErrorCount, value: stats?.totalError ?? 0, icon: XCircle, color: 'text-error', bg: 'bg-error-light' },
        ].map((card) => (
          <div key={card.label} className="bg-surface border border-border rounded-2xl p-5 shadow-sm space-y-3">
            <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', card.bg)}>
              <card.icon className={cn('w-5 h-5', card.color)} />
            </div>
            <div>
              <div className="text-2xl font-black text-text-main leading-none">{card.value}</div>
              <div className="text-[10px] font-bold text-text-light uppercase tracking-widest mt-1">{card.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Daily Chart */}
      <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm">
        <h3 className="font-bold text-text-main flex items-center gap-2 mb-6">
          <BarChart3 className="w-5 h-5 text-accent" />
          {t.adminReportDailyChartTitle}
        </h3>
        {chartData.length === 0 ? (
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
                  <th className="px-6 py-3 text-[10px] font-black text-text-light uppercase tracking-[0.15em] text-right">{t.adminReportColCount}</th>
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
