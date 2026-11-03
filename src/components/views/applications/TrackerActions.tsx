import React from 'react';
import { useUI } from '../../../context/UIContext';
import { formatLabel } from '../../../translations';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { vnTodayYmd } from '../../../lib/vnTime';
import { addApplicationNote, transitionApplicationStatus, updateApplicationDetails, type MutationResult } from '../../../services/applicationService';
import {
  allowedTransitions, isFinalStatus, DETAIL_TEXT_MAX, NOTE_MAX,
  type ApplicationDetail, type ApplicationStatus,
} from '../../../services/applicationTypes';
import { statusLabel, trackerErrorMessage } from './status';
import { useTrackerMutation } from './useTrackerMutation';

export const fieldClass = 'w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-main focus:border-accent focus:outline-none';
export const primaryButton = 'rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white transition-all cursor-pointer hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100';
export const secondaryButton = 'rounded-xl border border-border px-4 py-2 text-sm font-bold text-text-muted transition-all cursor-pointer hover:scale-105 hover:text-text-main active:scale-95';

export function FormShell({ title, error, children }: { title: string; error: string | null; children: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      <h4 className="text-sm font-black text-text-main">{title}</h4>
      {children}
      {error && <p role="alert" className="text-xs font-medium text-error">{error}</p>}
    </div>
  );
}

/** Today (ICT) = now on the server; a past day is recorded at 12:00 ICT. */
export const occurredAtFor = (ymd: string) => (ymd === vnTodayYmd() ? null : `${ymd}T12:00:00+07:00`);

export function StatusChangeForm({ application, onDone, onClose }: { application: ApplicationDetail; onDone: () => void; onClose: () => void }) {
  const { t } = useUI();
  const options = allowedTransitions(application.status);
  const [picked, setTo] = React.useState<ApplicationStatus>(options[0]);
  // The form survives a reload (so a stale_status message stays visible); keep the choice valid for the fresh status.
  const to = options.includes(picked) ? picked : options[0];
  const [date, setDate] = React.useState(vnTodayYmd());
  const [note, setNote] = React.useState('');
  const [confirming, setConfirming] = React.useState(false);
  const { run, busy, error, cancel } = useTrackerMutation(`status:${application.id}`, onDone);
  const noteTooLong = note.trim().length > NOTE_MAX;

  const submit = async () => {
    setConfirming(false);
    const ok = await run((idempotencyKey) => transitionApplicationStatus({
      applicationId: application.id,
      expectedStatus: application.status,
      toStatus: to,
      occurredAt: occurredAtFor(date),
      note: note.trim() || null,
      idempotencyKey,
    }));
    if (ok) onClose();
  };

  const onSave = () => {
    if (busy || noteTooLong || !date) return;
    // Leaving a final outcome is a correction: ask first.
    if (isFinalStatus(application.status)) setConfirming(true);
    else void submit();
  };

  return (
    <FormShell title={t.trackerChangeStatus} error={error ? trackerErrorMessage(t, error) : noteTooLong ? formatLabel(t.trackerTooLong, { max: NOTE_MAX }) : null}>
      <label className="block space-y-1 text-xs font-bold text-text-muted">
        <span>{t.trackerNewStatus}</span>
        <select className={fieldClass} value={to} onChange={(e) => setTo(e.target.value as ApplicationStatus)}>
          {options.map((s) => <option key={s} value={s}>{statusLabel(t, s)}</option>)}
        </select>
      </label>
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
        <button type="button" className={primaryButton} disabled={busy || noteTooLong || !date} aria-busy={busy} onClick={onSave}>
          {busy ? t.trackerSaving : t.trackerSave}
        </button>
      </div>
      <ConfirmDialog
        open={confirming}
        title={t.trackerFinalConfirmTitle}
        message={formatLabel(t.trackerFinalConfirm, { from: statusLabel(t, application.status), to: statusLabel(t, to) })}
        confirmLabel={t.trackerConfirm}
        cancelLabel={t.trackerCancel}
        onConfirm={() => void submit()}
        onCancel={() => setConfirming(false)}
      />
    </FormShell>
  );
}

export function NoteForm({ applicationId, onDone, onClose }: { applicationId: string; onDone: () => void; onClose: () => void }) {
  const { t } = useUI();
  const [note, setNote] = React.useState('');
  const [touched, setTouched] = React.useState(false);
  const { run, busy, error, cancel } = useTrackerMutation(`note:${applicationId}`, onDone);
  const trimmed = note.trim();
  const invalid = !trimmed ? t.trackerNoteEmpty : trimmed.length > NOTE_MAX ? formatLabel(t.trackerTooLong, { max: NOTE_MAX }) : null;

  const onSave = async () => {
    setTouched(true);
    if (busy || invalid) return;
    const ok = await run((idempotencyKey) => addApplicationNote({ applicationId, note: trimmed, idempotencyKey }));
    if (ok) onClose();
  };

  return (
    <FormShell title={t.trackerAddNote} error={error ? trackerErrorMessage(t, error) : touched ? invalid : null}>
      <label className="block space-y-1 text-xs font-bold text-text-muted">
        <span>{t.trackerNoteLabel}</span>
        <textarea className={fieldClass} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <p className="text-right text-[10px] text-text-light">{trimmed.length}/{NOTE_MAX}</p>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className={secondaryButton} onClick={() => { cancel(); onClose(); }}>{t.trackerCancel}</button>
        <button type="button" className={primaryButton} disabled={busy} aria-busy={busy} onClick={() => void onSave()}>
          {busy ? t.trackerSaving : t.trackerSave}
        </button>
      </div>
    </FormShell>
  );
}

export function DetailsForm({ application, onDone, onClose }: { application: ApplicationDetail; onDone: (result?: MutationResult) => void; onClose: () => void }) {
  const { t } = useUI();
  // The version this edit is based on: captured when the form opens, not on every reload.
  const [base, setBase] = React.useState(application);
  const [company, setCompany] = React.useState(application.companyName ?? '');
  const [role, setRole] = React.useState(application.roleTitle ?? '');
  const [deadline, setDeadline] = React.useState(application.deadline ?? '');
  const [notice, setNotice] = React.useState<string | null>(null);
  const { run, busy, error, cancel } = useTrackerMutation(`details:${application.id}`, onDone);
  const next = { companyName: company.trim() || null, roleTitle: role.trim() || null, deadline: deadline || null };
  const tooLong = (next.companyName?.length ?? 0) > DETAIL_TEXT_MAX || (next.roleTitle?.length ?? 0) > DETAIL_TEXT_MAX;

  // stale_application: the reload brought newer data. Show it (never overwrite it with
  // the rejected edit) and base the user's next, explicit save on the new version.
  React.useEffect(() => {
    if (error !== 'stale_application' || application.updatedAt === base.updatedAt) return;
    setBase(application);
    setCompany(application.companyName ?? '');
    setRole(application.roleTitle ?? '');
    setDeadline(application.deadline ?? '');
  }, [error, application, base.updatedAt]);

  const onSave = async () => {
    if (busy || tooLong) return;
    // No-op edits never reach the server, so the timeline has no noise.
    if (next.companyName === base.companyName && next.roleTitle === base.roleTitle && next.deadline === base.deadline) {
      setNotice(t.trackerNoChanges);
      return;
    }
    setNotice(null);
    const ok = await run((idempotencyKey) => updateApplicationDetails({ applicationId: application.id, expectedUpdatedAt: base.updatedAt, ...next, idempotencyKey }));
    if (ok) onClose();
  };

  return (
    <FormShell title={t.trackerEditDetails} error={error ? trackerErrorMessage(t, error) : tooLong ? formatLabel(t.trackerTooLong, { max: DETAIL_TEXT_MAX }) : notice}>
      <label className="block space-y-1 text-xs font-bold text-text-muted">
        <span>{t.trackerCompanyLabel}</span>
        <input className={fieldClass} value={company} onChange={(e) => setCompany(e.target.value)} />
      </label>
      <label className="block space-y-1 text-xs font-bold text-text-muted">
        <span>{t.trackerRoleLabel}</span>
        <input className={fieldClass} value={role} onChange={(e) => setRole(e.target.value)} />
      </label>
      <label className="block space-y-1 text-xs font-bold text-text-muted">
        <span>{t.trackerDeadlineLabel}</span>
        <input type="date" className={fieldClass} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
      </label>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className={secondaryButton} onClick={() => { cancel(); onClose(); }}>{t.trackerCancel}</button>
        <button type="button" className={primaryButton} disabled={busy || tooLong} aria-busy={busy} onClick={() => void onSave()}>
          {busy ? t.trackerSaving : t.trackerSave}
        </button>
      </div>
    </FormShell>
  );
}
