import React from 'react';
import { useUI } from '../../../context/UIContext';
import { formatLabel } from '../../../translations';
import { vnTodayYmd } from '../../../lib/vnTime';
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
