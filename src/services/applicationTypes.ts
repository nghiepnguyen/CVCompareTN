import statusMatrix from '../../supabase/application_status_transitions.json';

/**
 * P2B application status authority. The transition matrix lives in
 * supabase/application_status_transitions.json; the DB function
 * public.application_status_transition_allowed() is tested against that same
 * file, so the UI only offers what the server accepts.
 */
export const APPLICATION_STATUSES = [
  'drafted', 'applied', 'interview', 'offer', 'hired', 'rejected', 'no_response', 'offer_declined', 'withdrawn',
] as const;
export type ApplicationStatus = typeof APPLICATION_STATUSES[number];

const TRANSITIONS = statusMatrix.transitions as Record<ApplicationStatus, ApplicationStatus[]>;
const FINAL = new Set(statusMatrix.final as ApplicationStatus[]);

/** Product-final outcome; leaving it is a correction (new event, history kept). */
export const isFinalStatus = (s: ApplicationStatus) => FINAL.has(s);
export const allowedTransitions = (from: ApplicationStatus): readonly ApplicationStatus[] => TRANSITIONS[from] ?? [];

export type ApplicationEventType = 'created' | 'status_changed' | 'note' | 'details_updated' | 'follow_up_sent' | 'contact_received';
export type ContactEventType = 'follow_up_sent' | 'contact_received';

/** Derived by the DB view application_follow_up_state (applied apps only); the client never re-derives it. */
export type FollowUpState = 'waiting' | 'due' | 'limit_reached';
export interface FollowUpInfo { state: FollowUpState; dueAt: string; lastContactAt: string; stageEnteredAt: string; followUpsSinceReset: number }
export type ApplicationDocumentType = 'cv' | 'jd' | 'cover_letter';

export interface ApplicationSummary {
  id: string;
  companyName: string | null;
  roleTitle: string | null;
  status: ApplicationStatus;
  /** YYYY-MM-DD (date, no time zone). */
  deadline: string | null;
  /** First recorded time it reached applied; historical: never cleared or overwritten by later corrections. */
  appliedAt: string | null;
  createdAt: string;
  /** Bumped by every tracker mutation: "last activity" and the row version for details edits (exact server string). */
  updatedAt: string;
  language: 'vi' | 'en';
}

export type ApplicationDetail = ApplicationSummary;

export interface ApplicationDocument {
  type: ApplicationDocumentType;
  content: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export type DetailField = 'company_name' | 'role_title' | 'deadline';
export interface DetailsChange { from: string | null; to: string | null }
export type DetailsChangeMetadata = { changedFields?: DetailField[] } & Partial<Record<DetailField, DetailsChange>>;

export interface ApplicationEvent {
  id: string;
  type: ApplicationEventType;
  fromStatus: ApplicationStatus | null;
  toStatus: ApplicationStatus | null;
  note: string | null;
  metadata: DetailsChangeMetadata;
  occurredAt: string;
  createdAt: string;
}

/** Sort allowlist. Score / probability are deliberately absent (P2A.2 MODEL_VARIANCE). */
export const APPLICATION_SORTS = ['updated_at', 'created_at', 'applied_at', 'deadline', 'company_name'] as const;
export type ApplicationSort = typeof APPLICATION_SORTS[number];

/** Stable RPC error vocabulary; anything else is `unknown` (never a raw DB message). */
export const TRACKER_ERROR_CODES = [
  'not_authenticated', 'account_locked', 'application_not_found', 'stale_status', 'stale_application',
  'invalid_transition', 'invalid_occurred_at', 'invalid_note', 'invalid_details', 'invalid_contact', 'contact_not_allowed',
] as const;
export type TrackerErrorCode = typeof TRACKER_ERROR_CODES[number] | 'unknown';

export const NOTE_MAX = 2000;
export const DETAIL_TEXT_MAX = 200;
