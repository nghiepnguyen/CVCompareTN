import React from 'react';
import { Briefcase, ChevronRight } from 'lucide-react';
import { useUI } from '../../context/UIContext';
import type { UiLabels } from '../../translations';
import { formatPlainDate, formatVnDate } from '../../lib/vnTime';
import { listApplications } from '../../services/applicationService';
import { APPLICATION_SORTS, type ApplicationSort, type ApplicationSummary } from '../../services/applicationTypes';
import { StatusBadge } from './applications/status';
import { ApplicationDetailView, companyOrFallback, roleOrFallback } from './applications/ApplicationDetailView';

const SORT_LABEL: Record<ApplicationSort, keyof UiLabels> = {
  updated_at: 'trackerSortUpdated',
  created_at: 'trackerSortCreated',
  applied_at: 'trackerSortApplied',
  deadline: 'trackerSortDeadline',
  company_name: 'trackerSortCompany',
};

/**
 * P2B tracker: applications saved from an analysis result (manual creation is
 * deferred). List shows workflow fields only; the score at save time lives in
 * the detail Documents tab and is never a sort / ranking key (P2A.2).
 */
export function ApplicationsView() {
  const { t, reportLanguage: lang, setActiveTab } = useUI();
  const [sort, setSort] = React.useState<ApplicationSort>('updated_at');
  const [items, setItems] = React.useState<ApplicationSummary[]>([]);
  const [page, setPage] = React.useState(0);
  const [hasMore, setHasMore] = React.useState(false);
  const [status, setStatus] = React.useState<'loading' | 'ready' | 'error'>('loading');
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const request = React.useRef(0);

  const load = React.useCallback(async (nextPage: number) => {
    const id = ++request.current;
    if (nextPage === 0) setStatus('loading'); else setLoadingMore(true);
    try {
      const res = await listApplications({ sort, page: nextPage });
      if (id !== request.current) return; // a newer sort / reload won
      setItems((prev) => (nextPage === 0 ? res.items : [...prev, ...res.items]));
      setHasMore(res.hasMore);
      setPage(nextPage);
      setStatus('ready');
    } catch {
      if (id === request.current) setStatus('error');
    } finally {
      if (id === request.current) setLoadingMore(false);
    }
  }, [sort]);

  React.useEffect(() => {
    if (!selectedId) void load(0);
  }, [load, selectedId]);

  if (selectedId) {
    return <ApplicationDetailView applicationId={selectedId} onBack={() => setSelectedId(null)} />;
  }

  return (
    <section className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-text-main">{t.trackerTitle}</h2>
          <p className="text-sm text-text-muted">{t.trackerDesc}</p>
        </div>
        <label className="flex items-center gap-2 text-xs font-bold text-text-muted">
          {t.trackerSortLabel}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as ApplicationSort)}
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-main cursor-pointer focus:border-accent focus:outline-none"
          >
            {APPLICATION_SORTS.map((s) => <option key={s} value={s}>{t[SORT_LABEL[s]] as string}</option>)}
          </select>
        </label>
      </div>

      {status === 'loading' ? (
        <p className="py-16 text-center text-sm text-text-muted" aria-busy="true">{t.trackerLoading}</p>
      ) : status === 'error' ? (
        <div className="rounded-2xl border border-border bg-surface p-8 text-center">
          <p role="alert" className="text-sm font-bold text-text-muted">{t.trackerLoadError}</p>
          <button type="button" onClick={() => void load(0)} className="mt-4 rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white transition-all cursor-pointer hover:scale-105 active:scale-95">{t.trackerRetry}</button>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-10 text-center">
          <Briefcase className="mx-auto mb-4 h-10 w-10 text-text-light" />
          <h3 className="text-lg font-bold text-text-main">{t.trackerEmptyTitle}</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-text-muted">{t.trackerEmptyDesc}</p>
          <button type="button" onClick={() => setActiveTab('analyze')} className="mt-6 rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-white transition-all cursor-pointer hover:scale-105 active:scale-95">{t.trackerGoAnalyze}</button>
        </div>
      ) : (
        <>
          <ul className="space-y-3">
            {items.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(a.id)}
                  className="group flex w-full min-w-0 items-center gap-3 rounded-2xl border border-border bg-surface p-4 text-left transition-all cursor-pointer hover:scale-[1.01] hover:border-accent active:scale-[0.99]"
                >
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className={a.roleTitle ? 'truncate text-base font-black text-text-main' : 'truncate text-base font-bold italic text-text-muted'}>{roleOrFallback(t, a)}</span>
                      <StatusBadge status={a.status} t={t} />
                    </div>
                    <p className={a.companyName ? 'truncate text-sm text-text-muted' : 'truncate text-sm italic text-text-light'}>{companyOrFallback(t, a)}</p>
                    <dl className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-text-light">
                      {a.deadline && <div className="flex gap-1"><dt>{t.trackerDeadline}:</dt><dd className="font-bold text-text-muted">{formatPlainDate(a.deadline, lang)}</dd></div>}
                      {a.appliedAt && <div className="flex gap-1"><dt>{t.trackerAppliedDate}:</dt><dd className="font-bold text-text-muted">{formatVnDate(a.appliedAt, lang)}</dd></div>}
                      <div className="flex gap-1"><dt>{t.trackerLastActivity}:</dt><dd className="font-bold text-text-muted">{formatVnDate(a.updatedAt, lang)}</dd></div>
                    </dl>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-text-light group-hover:text-accent" />
                </button>
              </li>
            ))}
          </ul>
          {hasMore && (
            <div className="text-center">
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => void load(page + 1)}
                className="rounded-xl border border-border px-5 py-2 text-sm font-bold text-text-main transition-all cursor-pointer hover:scale-105 hover:border-accent active:scale-95 disabled:opacity-50"
              >
                {loadingMore ? t.trackerLoading : t.trackerLoadMore}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
