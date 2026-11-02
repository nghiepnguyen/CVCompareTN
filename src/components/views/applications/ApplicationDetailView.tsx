import React from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, FileText, Info } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { useUI } from '../../../context/UIContext';
import { formatLabel, type UiLabels } from '../../../translations';
import { formatPlainDate, formatVnDate, formatVnDateTime } from '../../../lib/vnTime';
import {
  getApplication, getApplicationDocuments, getApplicationTimeline, trackerErrorCode, type MutationResult,
} from '../../../services/applicationService';
import type { ApplicationDetail, ApplicationDocument, ApplicationEvent } from '../../../services/applicationTypes';
import { StatusBadge, statusLabel, trackerErrorMessage } from './status';
import { DetailsForm, NoteForm, StatusChangeForm } from './TrackerActions';

type DetailTab = 'overview' | 'documents' | 'timeline';
type Panel = 'status' | 'details' | 'note' | null;

interface Loaded { application: ApplicationDetail; documents: ApplicationDocument[]; events: ApplicationEvent[]; eventsPage: number; hasMoreEvents: boolean }

export const companyOrFallback = (t: UiLabels, a: Pick<ApplicationDetail, 'companyName'>) => a.companyName ?? t.trackerCompanyUnset;
export const roleOrFallback = (t: UiLabels, a: Pick<ApplicationDetail, 'roleTitle'>) => a.roleTitle ?? t.trackerRoleUnset;

function Field({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-surface p-3">
      <dt className="text-[10px] font-black uppercase tracking-wider text-text-light">{label}</dt>
      <dd className="mt-1 break-words text-sm font-bold text-text-main">{value}</dd>
      {/* Visible, not hover-only: touch devices have no tooltip. */}
      {hint && <dd className="mt-1 text-[10px] leading-snug text-text-light">{hint}</dd>}
    </div>
  );
}

export function ApplicationDetailView({ applicationId, onBack }: { applicationId: string; onBack: () => void }) {
  const { t, reportLanguage: lang } = useUI();
  const [data, setData] = React.useState<Loaded | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<DetailTab>('overview');
  const [panel, setPanel] = React.useState<Panel>(null);

  const load = React.useCallback(async () => {
    setLoadError(null);
    try {
      const [application, documents, timeline] = await Promise.all([
        getApplication(applicationId), getApplicationDocuments(applicationId), getApplicationTimeline(applicationId),
      ]);
      if (!application) {
        setLoadError(t.trackerErrNotFound);
        return;
      }
      setData({ application, documents, events: timeline.items, eventsPage: 0, hasMoreEvents: timeline.hasMore });
    } catch (err) {
      const code = trackerErrorCode(err);
      setLoadError(code === 'unknown' ? t.trackerLoadError : trackerErrorMessage(t, code));
    }
  }, [applicationId, t]);

  React.useEffect(() => { void load(); }, [load]);

  const [moreBusy, setMoreBusy] = React.useState(false);
  const [moreError, setMoreError] = React.useState(false);
  const loadMoreEvents = async () => {
    if (!data || moreBusy) return;
    setMoreBusy(true);
    setMoreError(false);
    try {
      const next = await getApplicationTimeline(applicationId, data.eventsPage + 1);
      setData((prev) => {
        if (!prev) return prev;
        const seen = new Set(prev.events.map((e) => e.id));
        return { ...prev, events: [...prev.events, ...next.items.filter((e) => !seen.has(e.id))], eventsPage: prev.eventsPage + 1, hasMoreEvents: next.hasMore };
      });
    } catch {
      setMoreError(true);
    } finally {
      setMoreBusy(false);
    }
  };

  // Show the server's returned row at once (details edit), then reload everything.
  const onMutated = (result?: MutationResult) => {
    if (result?.application) {
      const fresh = result.application;
      setData((prev) => prev && { ...prev, application: { ...prev.application, ...fresh } });
    }
    void load();
  };

  const back = (
    <button type="button" onClick={onBack} className="flex items-center gap-2 text-sm font-bold text-text-muted transition-all cursor-pointer hover:scale-105 hover:text-accent active:scale-95">
      <ArrowLeft className="h-4 w-4" /> {t.trackerBack}
    </button>
  );

  if (loadError) {
    return (
      <section className="mx-auto max-w-4xl space-y-6">
        {back}
        <div className="rounded-2xl border border-border bg-surface p-8 text-center">
          <p role="alert" className="text-sm font-bold text-text-muted">{loadError}</p>
          <button type="button" onClick={() => void load()} className="mt-4 rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white transition-all cursor-pointer hover:scale-105 active:scale-95">{t.trackerRetry}</button>
        </div>
      </section>
    );
  }
  if (!data) {
    return (
      <section className="mx-auto max-w-4xl space-y-6">
        {back}
        <p className="py-16 text-center text-sm text-text-muted" aria-busy="true">{t.trackerLoading}</p>
      </section>
    );
  }

  const { application: app, documents, events, hasMoreEvents } = data;
  const closePanel = () => setPanel(null);
  const tabs: { id: DetailTab; label: string }[] = [
    { id: 'overview', label: t.trackerTabOverview },
    { id: 'documents', label: t.trackerTabDocuments },
    { id: 'timeline', label: t.trackerTabTimeline },
  ];

  return (
    <section className="mx-auto max-w-4xl space-y-6">
      {back}
      <header className="space-y-2">
        <p className="text-xs font-black uppercase tracking-wider text-text-light">{companyOrFallback(t, app)}</p>
        <h2 className="break-words text-2xl font-black tracking-tight text-text-main">{roleOrFallback(t, app)}</h2>
        <StatusBadge status={app.status} t={t} />
      </header>

      <div role="tablist" className="sticky top-16 z-10 flex gap-1 overflow-x-auto rounded-xl border border-border bg-surface-muted p-1">
        {tabs.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn('relative flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-bold transition-all cursor-pointer hover:scale-105 active:scale-95', tab === id ? 'text-accent' : 'text-text-muted hover:text-text-main')}
          >
            {tab === id && <motion.span layoutId="applicationDetailTab" className="absolute inset-0 rounded-lg bg-surface" />}
            <span className="relative">{label}</span>
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div role="tabpanel" className="space-y-4">
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t.trackerCompanyLabel} value={companyOrFallback(t, app)} />
            <Field label={t.trackerRoleLabel} value={roleOrFallback(t, app)} />
            <Field label={t.trackerCurrentStatus} value={statusLabel(t, app.status)} />
            <Field label={t.trackerDeadline} value={app.deadline ? formatPlainDate(app.deadline, lang) : '—'} />
            <Field label={t.trackerAppliedDate} value={app.appliedAt ? formatVnDate(app.appliedAt, lang) : '—'} hint={t.trackerAppliedDateHint} />
            <Field label={t.trackerSavedDate} value={formatVnDateTime(app.createdAt, lang)} />
            <Field label={t.trackerUpdatedDate} value={formatVnDateTime(app.updatedAt, lang)} />
          </dl>
          <div className="flex flex-wrap gap-2">
            {([['status', t.trackerChangeStatus], ['details', t.trackerEditDetails], ['note', t.trackerAddNote]] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setPanel(panel === id ? null : id)}
                className={cn('rounded-xl border px-4 py-2 text-sm font-bold transition-all cursor-pointer hover:scale-105 active:scale-95', panel === id ? 'border-accent text-accent' : 'border-border text-text-main hover:border-accent')}
              >
                {label}
              </button>
            ))}
          </div>
          {panel === 'status' && <StatusChangeForm application={app} onDone={onMutated} onClose={closePanel} />}
          {panel === 'details' && <DetailsForm application={app} onDone={onMutated} onClose={closePanel} />}
          {panel === 'note' && <NoteForm applicationId={app.id} onDone={onMutated} onClose={closePanel} />}
        </div>
      )}

      {tab === 'documents' && <DocumentsTab documents={documents} t={t} />}
      {tab === 'timeline' && (
        <div role="tabpanel" className="space-y-4">
          <TimelineTab events={events} t={t} lang={lang} />
          {moreError && <p role="alert" className="text-center text-xs text-error">{t.trackerLoadError}</p>}
          {hasMoreEvents && (
            <div className="text-center">
              <button
                type="button"
                disabled={moreBusy}
                onClick={() => void loadMoreEvents()}
                className="rounded-xl border border-border px-5 py-2 text-sm font-bold text-text-main transition-all cursor-pointer hover:scale-105 hover:border-accent active:scale-95 disabled:opacity-50"
              >
                {moreBusy ? t.trackerLoading : t.trackerTimelineMore}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

const textOf = (doc: ApplicationDocument | undefined) => (typeof doc?.content.text === 'string' ? doc.content.text : '');

interface SavedRequirement { requirement?: unknown; status?: unknown; verification?: unknown }

// Same labels as the result view's requirement list; values frozen at save time, never recomputed.
function requirementLabel(t: UiLabels, r: SavedRequirement): string {
  const status = r.status === 'matched' ? t.matched : r.status === 'partial' ? t.partial : t.missing;
  const verification = r.verification === 'met' ? t.verificationMet : r.verification === 'unmet' ? t.verificationUnmet
    : r.verification === 'unknown' ? t.verificationUnknown : null;
  return verification ? `${status} · ${verification}` : status;
}

function DocumentsTab({ documents, t }: { documents: ApplicationDocument[]; t: UiLabels }) {
  const cv = documents.find((d) => d.type === 'cv');
  const jd = documents.find((d) => d.type === 'jd');
  const letter = documents.find((d) => d.type === 'cover_letter');
  const analysis = (jd?.metadata.analysis ?? null) as { matchScore?: unknown; requirements?: unknown } | null;
  const score = typeof analysis?.matchScore === 'number' ? analysis.matchScore : null;
  const requirements = Array.isArray(analysis?.requirements) ? (analysis.requirements as SavedRequirement[]) : [];

  return (
    <div role="tabpanel" className="space-y-4">
      <p className="flex items-center gap-2 text-xs text-text-muted"><Info className="h-4 w-4 shrink-0" /> {t.trackerDocsReadOnly}</p>
      {cv && <CvSnapshot doc={cv} t={t} />}
      {jd && (
        <DocCard title={t.trackerDocJd}>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words font-sans text-sm text-text-main">{textOf(jd)}</pre>
          {score !== null && (
            <div className="mt-4 rounded-xl border border-border bg-surface-secondary p-3">
              <p className="text-xs font-bold text-text-muted">{t.trackerScoreAtSave}: <span className="text-text-main">{score}/100</span></p>
              <p className="mt-1 text-[11px] text-text-light">{t.trackerScoreAtSaveHint}</p>
            </div>
          )}
          {requirements.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs font-bold text-text-muted">{t.trackerRequirementsAtSave} ({requirements.length})</summary>
              <ul className="mt-2 space-y-1">
                {requirements.map((r, i) => (
                  <li key={i} className="break-words text-xs text-text-main">
                    {String(r.requirement ?? '')} <span className="text-text-light">— {requirementLabel(t, r)}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </DocCard>
      )}
      <DocCard title={t.trackerDocCoverLetter}>
        {letter
          ? <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words font-sans text-sm text-text-main">{textOf(letter)}</pre>
          : <p className="text-sm italic text-text-muted">{t.trackerDocNoCoverLetter}</p>}
      </DocCard>
    </div>
  );
}

function DocCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <h4 className="mb-3 flex items-center gap-2 text-sm font-black text-text-main"><FileText className="h-4 w-4 text-accent" /> {title}</h4>
      {children}
    </section>
  );
}

type CvLike = {
  personal_information?: { full_name?: string; summary?: string };
  work_experience?: { job_title?: string; company?: string; duration?: { start?: string; end?: string } }[];
  education?: { degree?: string; institution?: string }[];
  skills?: Record<string, unknown>;
  certifications?: string[];
};

/** Read-only view of the saved parsedCV (the CV snapshot authority). */
function CvSnapshot({ doc, t }: { doc: ApplicationDocument; t: UiLabels }) {
  const cv = (doc.content.parsedCV ?? {}) as CvLike;
  const fileName = typeof doc.metadata.fileName === 'string' ? doc.metadata.fileName : null;
  const skills = Object.values(cv.skills ?? {}).flatMap((v) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []));
  return (
    <DocCard title={t.trackerDocCv}>
      <div className="space-y-3 text-sm text-text-main">
        {fileName && <p className="text-xs text-text-light">{fileName}</p>}
        {cv.personal_information?.full_name && <p className="font-bold">{cv.personal_information.full_name}</p>}
        {cv.personal_information?.summary && <p className="whitespace-pre-wrap break-words text-text-muted">{cv.personal_information.summary}</p>}
        {!!cv.work_experience?.length && (
          <ul className="space-y-1">
            {cv.work_experience.map((w, i) => (
              <li key={i} className="break-words">{[w.job_title, w.company].filter(Boolean).join(' · ')} <span className="text-text-light">{[w.duration?.start, w.duration?.end].filter(Boolean).join(' – ')}</span></li>
            ))}
          </ul>
        )}
        {!!cv.education?.length && (
          <ul className="space-y-1">
            {cv.education.map((e, i) => <li key={i} className="break-words">{[e.degree, e.institution].filter(Boolean).join(' · ')}</li>)}
          </ul>
        )}
        {skills.length > 0 && <p className="break-words text-xs text-text-muted">{skills.join(', ')}</p>}
        {!!cv.certifications?.length && <p className="break-words text-xs text-text-muted">{cv.certifications.join(', ')}</p>}
      </div>
    </DocCard>
  );
}

function eventTitle(t: UiLabels, e: ApplicationEvent): string {
  switch (e.type) {
    case 'created': return t.trackerEvCreated;
    case 'status_changed':
      return e.fromStatus && e.toStatus ? formatLabel(t.trackerEvStatus, { from: statusLabel(t, e.fromStatus), to: statusLabel(t, e.toStatus) }) : t.trackerEvDetails;
    case 'note': return t.trackerEvNote;
    case 'details_updated': return t.trackerEvDetails;
  }
}

function detailLines(t: UiLabels, e: ApplicationEvent, lang: 'vi' | 'en'): string[] {
  if (e.type !== 'details_updated') return [];
  const m = e.metadata;
  const value = (v: string | null | undefined, date = false) => (v ? (date ? formatPlainDate(v, lang) : v) : t.trackerEvCleared);
  return (m.changedFields ?? []).map((f) =>
    f === 'company_name' ? formatLabel(t.trackerEvCompany, { value: value(m.company_name?.to) })
      : f === 'role_title' ? formatLabel(t.trackerEvRole, { value: value(m.role_title?.to) })
      : formatLabel(t.trackerEvDeadline, { value: value(m.deadline?.to, true) }));
}

function TimelineTab({ events, t, lang }: { events: ApplicationEvent[]; t: UiLabels; lang: 'vi' | 'en' }) {
  if (events.length === 0) return <p className="py-8 text-center text-sm text-text-muted">{t.trackerTimelineEmpty}</p>;
  return (
    <ol className="space-y-3 border-l-2 border-border pl-4">
      {events.map((e) => (
        <li key={e.id} className="relative min-w-0">
          <span className="absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-accent" />
          <p className="text-[11px] font-bold text-text-light">{formatVnDateTime(e.occurredAt, lang)}</p>
          <p className="break-words text-sm font-bold text-text-main">{eventTitle(t, e)}</p>
          {detailLines(t, e, lang).map((line) => <p key={line} className="break-words text-xs text-text-muted">{line}</p>)}
          {/* Rendered as text (React escapes); never HTML. */}
          {e.note && <p className="mt-1 whitespace-pre-wrap break-words rounded-lg bg-surface-secondary p-2 text-xs text-text-main">{e.note}</p>}
        </li>
      ))}
    </ol>
  );
}
