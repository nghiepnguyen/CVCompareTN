import React, { useEffect, useState } from 'react';
import { AlertCircle, ClipboardList, Loader2, ShieldCheck } from 'lucide-react';
import { useUI } from '../../context/UIContext';
import { formatLabel } from '../../translations';
import { useAdminAudit } from '../../hooks/useAdminAudit';
import { ADMIN_AUDIT_ACTIONS } from '../../services/adminAuditService';
import type { AdminAuditAction } from '../../services/adminAuditService';
import { VN_TIME_ZONE } from '../../lib/vnTime';

const PAGE_SIZE = 20;

function actionLabel(action: string, t: ReturnType<typeof useUI>['t']): string {
  switch (action) {
    case 'update_role':
      return t.adminAuditActionUpdateRole;
    case 'update_plan':
      return t.adminAuditActionUpdatePlan;
    case 'delete_user':
      return t.adminAuditActionDeleteUser;
    case 'update_permission':
      return t.adminAuditActionUpdatePermission;
    case 'update_analytics_limit':
      return t.adminAuditActionUpdateAnalyticsLimit;
    case 'reset_analytics_limit':
      return t.adminAuditActionResetAnalyticsLimit;
    case 'update_app_setting':
      return t.adminAuditActionUpdateAppSetting;
    case 'export_data':
      return t.adminAuditActionExportData;
    default:
      return action;
  }
}

function detailsText(details: Record<string, unknown> | null): string {
  if (!details) return '—';
  return Object.entries(details)
    .slice(0, 5)
    .map(([key, value]) => {
      const rendered =
        value === null || value === undefined
          ? '—'
          : typeof value === 'object'
            ? JSON.stringify(value)
            : String(value);
      return `${key}=${rendered}`;
    })
    .join(' · ');
}

export function AdminAuditTab() {
  const { t, reportLanguage } = useUI();
  const dateLocale = reportLanguage === 'vi' ? 'vi-VN' : 'en-US';

  const [action, setAction] = useState<AdminAuditAction | 'all'>('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [action, search]);

  const { rows, total, isLoading, error, refresh } = useAdminAudit({
    action,
    search,
    page,
    pageSize: PAGE_SIZE,
  });

  const totalPages = Math.max(1, Math.ceil((total ?? 0) / PAGE_SIZE));
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-2">
        <h3 className="flex items-center gap-2 text-xl font-black text-text-main">
          <ClipboardList className="h-5 w-5 text-accent" />
          {t.adminAuditTitle}
        </h3>
        <p className="text-sm text-text-muted">{t.adminAuditDesc}</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-text-light">
            {t.adminAuditFilterAction}
          </span>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value as AdminAuditAction | 'all')}
            className="rounded-lg border border-border bg-surface-secondary px-3 py-2 text-xs font-bold text-text-main cursor-pointer"
          >
            <option value="all">{t.adminAuditAllActions}</option>
            {ADMIN_AUDIT_ACTIONS.map((item) => (
              <option key={item} value={item}>
                {actionLabel(item, t)}
              </option>
            ))}
          </select>
        </label>

        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={t.adminAuditSearchPlaceholder}
          className="w-full rounded-xl border-2 border-border bg-surface px-3 py-2 text-sm font-medium text-text-main outline-none transition-all focus:border-accent sm:w-72"
        />
      </div>

      {error && (
        <div role="alert" className="flex items-center gap-3 rounded-xl border border-error/10 bg-error-light p-4 text-error">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-xs font-bold">
            {formatLabel(t.adminAuditLoadError, { message: error })}
          </span>
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded-lg border border-error/30 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider cursor-pointer hover:scale-105 active:scale-95"
          >
            {t.adminRetry}
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-border bg-surface-secondary/50">
                <th scope="col" className="px-5 py-3 text-[10px] font-black uppercase tracking-[0.15em] text-text-light">{t.adminAuditColTime}</th>
                <th scope="col" className="px-5 py-3 text-[10px] font-black uppercase tracking-[0.15em] text-text-light">{t.adminAuditColActor}</th>
                <th scope="col" className="px-5 py-3 text-[10px] font-black uppercase tracking-[0.15em] text-text-light">{t.adminAuditColAction}</th>
                <th scope="col" className="px-5 py-3 text-[10px] font-black uppercase tracking-[0.15em] text-text-light">{t.adminAuditColTarget}</th>
                <th scope="col" className="px-5 py-3 text-[10px] font-black uppercase tracking-[0.15em] text-text-light">{t.adminAuditColDetails}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={row.id} className="align-top hover:bg-surface-secondary/70">
                  <td className="whitespace-nowrap px-5 py-3 text-[11px] text-text-muted">
                    {row.createdAt
                      ? new Date(row.createdAt).toLocaleString(dateLocale, { timeZone: VN_TIME_ZONE })
                      : '—'}
                  </td>
                  <td className="px-5 py-3 text-xs font-bold text-text-main">
                    {row.adminEmail || row.adminId}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3">
                    <span className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-secondary px-2 py-0.5 text-[10px] font-black text-text-main">
                      <ShieldCheck className="h-3 w-3 text-accent" />
                      {actionLabel(row.action, t)}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs text-text-main">
                    <div className="font-bold">{row.targetEmail || '—'}</div>
                    {row.targetUserId && (
                      <div className="font-mono text-[10px] text-text-light">{row.targetUserId}</div>
                    )}
                  </td>
                  <td className="max-w-[360px] px-5 py-3 font-mono text-[10px] text-text-muted">
                    <span className="break-all">{detailsText(row.details)}</span>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-sm text-text-muted">
                    {isLoading ? (
                      <Loader2 className="mx-auto h-5 w-5 animate-spin text-text-light" />
                    ) : (
                      t.adminAuditEmpty
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 text-xs font-bold text-text-muted">
        <span>
          {formatLabel(t.adminAuditPaginationInfo, {
            start: String((total ?? 0) === 0 ? 0 : (page - 1) * PAGE_SIZE + 1),
            end: String(Math.min(page * PAGE_SIZE, total ?? 0)),
            total: String(total ?? 0),
          })}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={page <= 1 || isLoading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-lg border border-border px-3 py-1.5 cursor-pointer hover:bg-surface-secondary disabled:cursor-not-allowed disabled:opacity-40"
          >
            ‹
          </button>
          <span>{page} / {totalPages}</span>
          <button
            type="button"
            disabled={page >= totalPages || isLoading}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="rounded-lg border border-border px-3 py-1.5 cursor-pointer hover:bg-surface-secondary disabled:cursor-not-allowed disabled:opacity-40"
          >
            ›
          </button>
        </div>
      </div>
    </div>
  );
}
