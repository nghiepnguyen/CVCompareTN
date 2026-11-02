import React from 'react';
import { cn } from '../../../lib/utils';
import type { UiLabels } from '../../../translations';
import { isFinalStatus, type ApplicationStatus, type TrackerErrorCode } from '../../../services/applicationTypes';

const STATUS_LABEL_KEY: Record<ApplicationStatus, keyof UiLabels> = {
  drafted: 'trackerStatusDrafted',
  applied: 'trackerStatusApplied',
  interview: 'trackerStatusInterview',
  offer: 'trackerStatusOffer',
  hired: 'trackerStatusHired',
  rejected: 'trackerStatusRejected',
  no_response: 'trackerStatusNoResponse',
  offer_declined: 'trackerStatusOfferDeclined',
  withdrawn: 'trackerStatusWithdrawn',
};

/** Human label; raw values such as `no_response` never reach the UI. */
export const statusLabel = (t: UiLabels, s: ApplicationStatus) => t[STATUS_LABEL_KEY[s]] as string;

/** Text is the authority; color only groups open / successful / other final outcomes. */
export function StatusBadge({ status, t }: { status: ApplicationStatus; t: UiLabels }) {
  const final = isFinalStatus(status);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-bold whitespace-nowrap',
        status === 'hired' ? 'border-success/30 bg-success-light text-success'
          : final ? 'border-border bg-surface-secondary text-text-muted'
          : status === 'drafted' ? 'border-border bg-surface text-text-main'
          : 'border-accent/30 bg-accent-light text-accent'
      )}
    >
      {statusLabel(t, status)}
      {final && <span className="font-medium opacity-70">· {t.trackerFinalBadge}</span>}
    </span>
  );
}

export function trackerErrorMessage(t: UiLabels, code: TrackerErrorCode): string {
  switch (code) {
    case 'stale_status': return t.trackerErrStale;
    case 'invalid_transition': return t.trackerErrInvalidTransition;
    case 'application_not_found': return t.trackerErrNotFound;
    case 'account_locked': return t.trackerErrLocked;
    case 'not_authenticated': return t.trackerErrAuth;
    case 'invalid_occurred_at': return t.trackerErrOccurredAt;
    case 'invalid_note':
    case 'invalid_details': return t.trackerErrInvalid;
    default: return t.trackerErrGeneric;
  }
}
