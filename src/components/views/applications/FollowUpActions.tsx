import React from 'react';
import { useUI } from '../../../context/UIContext';
import { formatLabel } from '../../../translations';
import { vnTodayYmd } from '../../../lib/vnTime';
import { supabase } from '../../../lib/supabase';
import { CoverLetterRequestError, generateFollowUpDraft } from '../../../services/ai/analysisService';
import type { UiLabels } from '../../../translations';
import type { ApplicationDetail, ApplicationDocument } from '../../../services/applicationTypes';
import { logApplicationContact, type MutationResult } from '../../../services/applicationService';
import { NOTE_MAX, type ContactEventType } from '../../../services/applicationTypes';
import { trackerErrorMessage } from './status';
import { FormShell, fieldClass, occurredAtFor, primaryButton, secondaryButton } from './TrackerActions';
import { useTrackerMutation } from './useTrackerMutation';

/** Logs a follow-up sent / employer contact. Eligibility is the RPC's call (contact_not_allowed). */
export function ContactEventForm({ applicationId, eventType, onDone, onClose }: {
  applicationId: string; eventType: ContactEventType; onDone: (r?: MutationResult) => void; onClose: () => void;
}) {
  const { t } = useUI();
  const [date, setDate] = React.useState(vnTodayYmd());
  const [note, setNote] = React.useState('');
  const { run, busy, error, cancel } = useTrackerMutation(`${eventType}:${applicationId}`, onDone);
  const noteTooLong = note.trim().length > NOTE_MAX;

  const onSave = async () => {
    if (busy || noteTooLong || !date) return;
    const ok = await run((idempotencyKey) => logApplicationContact({
      applicationId, eventType, occurredAt: occurredAtFor(date), note: note.trim() || null, idempotencyKey,
    }));
    if (ok) onClose();
  };

  return (
    <FormShell
      title={eventType === 'follow_up_sent' ? t.trackerMarkFollowUpSent : t.trackerEmployerReplied}
      error={error ? trackerErrorMessage(t, error) : noteTooLong ? formatLabel(t.trackerTooLong, { max: NOTE_MAX }) : null}
    >
      <label className="block space-y-1 text-xs font-bold text-text-muted">
        <span>{t.trackerOccurredOn}</span>
        <input type="date" className={fieldClass} value={date} max={vnTodayYmd()} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label className="block space-y-1 text-xs font-bold text-text-muted">
        <span>{t.trackerNoteOptional}</span>
        <textarea className={fieldClass} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className={secondaryButton} onClick={() => { cancel(); onClose(); }}>{t.trackerCancel}</button>
        <button type="button" className={primaryButton} disabled={busy || noteTooLong || !date} aria-busy={busy} onClick={() => void onSave()}>
          {busy ? t.trackerSaving : t.trackerSave}
        </button>
      </div>
    </FormShell>
  );
}

type Lang = 'vi' | 'en';
type DraftState = { kind: 'idle' } | { kind: 'loading' } | { kind: 'error'; message: string };

function draftErrorMessage(err: unknown, t: UiLabels): string {
  const m: Record<number, string> = {
    401: t.trackerDraftErr401, 403: t.trackerDraftErr403, 404: t.trackerDraftErr404, 409: t.trackerDraftErr409,
    422: t.trackerDraftErr422, 429: t.trackerDraftErr429, 503: t.trackerDraftErr503,
  };
  return (err instanceof CoverLetterRequestError && m[err.status]) || t.trackerDraftErrGeneric;
}

/** Display-only starting language: saved cover letter, else the application. The server decides when we send none. */
function initialLanguage(application: ApplicationDetail, documents: ApplicationDocument[]): Lang {
  const l = documents.find((d) => d.type === 'cover_letter')?.metadata.language;
  return l === 'vi' || l === 'en' ? l : application.language;
}

/** Generates an unsaved follow-up draft. Never logs a contact event, changes status or reloads the detail. */
export function FollowUpDraftPanel({ application, documents, onClose }: {
  application: ApplicationDetail; documents: ApplicationDocument[]; onClose: () => void;
}) {
  const { t } = useUI();
  const [language, setLanguage] = React.useState<Lang>(() => initialLanguage(application, documents));
  const [touched, setTouched] = React.useState(false);
  const [state, setState] = React.useState<DraftState>({ kind: 'idle' });
  const [draft, setDraft] = React.useState<string | null>(null);
  const [copy, setCopy] = React.useState<'idle' | 'ok' | 'failed'>('idle');
  const seq = React.useRef(0);
  const loading = state.kind === 'loading';
  // Bumping on unmount invalidates any in-flight request.
  React.useEffect(() => () => { seq.current += 1; }, []);

  const generate = async () => {
    if (loading) return;
    const mine = ++seq.current;
    setState({ kind: 'loading' });
    // Keep any existing (possibly edited) draft until a successful response replaces it.
    setCopy('idle');
    try {
      let token: string | undefined;
      try { token = (await supabase.auth.getSession()).data.session?.access_token; } catch { /* the server answers 401 */ }
      const res = await generateFollowUpDraft({ applicationId: application.id, ...(touched ? { language } : {}) }, token);
      if (mine !== seq.current) return;
      if (res.fidelityFallback || !res.content) { setState({ kind: 'error', message: t.trackerDraftFallback }); return; }
      setDraft(res.content);
      setState({ kind: 'idle' });
    } catch (err) {
      if (mine !== seq.current) return;
      setState({ kind: 'error', message: draftErrorMessage(err, t) });
    }
  };

  const onCopy = async () => {
    try { await navigator.clipboard.writeText(draft ?? ''); setCopy('ok'); } catch { setCopy('failed'); }
  };

  return (
    <FormShell title={t.trackerDraftTitle} error={state.kind === 'error' ? state.message : null}>
      <div role="group" aria-label={t.trackerDraftLanguage} className="flex flex-wrap items-center gap-2">
        {([['vi', 'Tiếng Việt'], ['en', 'English']] as const).map(([code, label]) => (
          <button key={code} type="button" disabled={loading} aria-pressed={language === code}
            onClick={() => { if (code !== language) { setLanguage(code); setTouched(true); } }}
            className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition-all cursor-pointer hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 ${language === code ? 'border-accent text-accent' : 'border-border text-text-muted'}`}>
            {label}
          </button>
        ))}
      </div>
      <p className="break-words text-xs text-text-muted">{t.trackerDraftHint}</p>
      {loading && <p role="status" aria-live="polite" className="text-xs font-bold text-text-muted">{t.trackerDraftGenerating}</p>}
      {draft !== null && (
        <textarea aria-label={t.trackerDraftTextLabel} className={`${fieldClass} whitespace-pre-wrap break-words`} rows={10}
          value={draft} onChange={(e) => { setDraft(e.target.value); setCopy('idle'); }} />
      )}
      {copy !== 'idle' && (
        <p role="status" aria-live="polite" className="text-xs font-bold text-text-muted">{copy === 'ok' ? t.trackerDraftCopied : t.trackerDraftCopyFailed}</p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className={secondaryButton} onClick={onClose}>{t.trackerDraftClose}</button>
        {draft !== null && <button type="button" className={secondaryButton} onClick={() => void onCopy()}>{t.trackerDraftCopy}</button>}
        <button type="button" className={primaryButton} disabled={loading} aria-busy={loading} onClick={() => void generate()}>
          {draft !== null ? t.trackerDraftRegenerate : t.trackerDraftGenerate}
        </button>
      </div>
    </FormShell>
  );
}
