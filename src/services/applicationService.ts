import { supabase, withAuthRetry } from "../lib/supabase";
import type { AnalysisResult, ParsedCV } from "./ai";
import {
  APPLICATION_SORTS, TRACKER_ERROR_CODES,
  type ApplicationDetail, type ApplicationDocument, type ApplicationEvent, type ApplicationSort,
  type ApplicationStatus, type ApplicationSummary, type TrackerErrorCode,
} from './applicationTypes';

/** Cover letter as currently shown in the result dialog (P1A/P1B, session only). */
export interface CurrentCoverLetter {
  content: string;
  language: 'vi' | 'en';
  employerName: string;
  roleTitle: string;
}

export interface SaveApplicationInput {
  /** One per Save intent; retries of that intent must reuse it. */
  idempotencyKey: string;
  result: AnalysisResult;
  parsedCV: ParsedCV;
  jd: string;
  coverLetter: CurrentCoverLetter | null;
}

// Canonical requirement status + verification at save time (not the full analysis payload).
export function requirementSnapshotOf(result: AnalysisResult) {
  const d = result.detailedComparison;
  if (!d) return [];
  return [d.skills, d.experience, d.tools, d.education, d.keywords]
    .flatMap((items) => items ?? [])
    .map(({ requirement, status, priority, cvEvidence, verification }) => ({
      requirement, status, ...(priority && { priority }), ...(cvEvidence && { cvEvidence }), ...(verification && { verification }),
    }));
}

/**
 * P2A: one atomic RPC creates the application and its immutable CV/JD(/letter)
 * snapshots. Idempotent per key: `created: false` means this intent was already
 * saved and the earlier snapshots were kept unchanged. No AI call, no quota.
 * `result.id` is sent as provenance only (not verified, not identity).
 */
export async function saveApplication({ idempotencyKey, result, parsedCV, jd, coverLetter }: SaveApplicationInput): Promise<{ id: string; created: boolean }> {
  // analyze falls back to this literal when the model returns no title.
  const role = coverLetter?.roleTitle || (result.jobTitle !== 'Job Position' ? result.jobTitle : '');
  const { data, error } = await withAuthRetry(() =>
    supabase.rpc('save_application', {
      p_idempotency_key: idempotencyKey,
      p_source_analysis_id: result.id || null,
      p_language: result.presentationLanguage || result.language || 'vi',
      p_role_title: role?.slice(0, 200) || null,
      p_company_name: coverLetter?.employerName.slice(0, 200) || null,
      p_cv_parsed: parsedCV,
      p_cv_file_name: result.cvName?.slice(0, 255) || null,
      p_jd_text: jd,
      p_analysis: {
        matchScore: result.matchScore,
        passProbability: result.passProbability,
        ...(result.scoreVersion && { scoreVersion: result.scoreVersion }),
        ...(result.probabilityVersion && { probabilityVersion: result.probabilityVersion }),
        requirements: requirementSnapshotOf(result),
      },
      p_cover_letter_text: coverLetter?.content || null,
      p_cover_letter_language: coverLetter?.language || null,
    })
  );
  if (error) throw error;
  return data as { id: string; created: boolean };
}

// ---- P2B tracker: reads via RLS (owner only), writes via the controlled RPCs. ----


/** Carries only the stable code: PostgREST `details`/`hint` can echo row values. */
export class ApplicationTrackerError extends Error {
  constructor(readonly code: TrackerErrorCode) {
    super(`application_tracker: ${code}`);
    this.name = 'ApplicationTrackerError';
  }
}

export function trackerErrorCode(error: unknown): TrackerErrorCode {
  if (error instanceof ApplicationTrackerError) return error.code;
  const message = (error as { message?: unknown } | null)?.message;
  return TRACKER_ERROR_CODES.find((c) => message === c) ?? 'unknown';
}

/** The server rejected the intent (nothing committed): a new attempt needs a new key. */
export const isDefiniteRejection = (code: TrackerErrorCode) => code !== 'unknown';

const SUMMARY_COLUMNS = 'id, company_name, role_title, status, deadline, applied_at, created_at, updated_at, language';

type ApplicationRow = {
  id: string; company_name: string | null; role_title: string | null; status: ApplicationStatus;
  deadline: string | null; applied_at: string | null; created_at: string; updated_at: string; language: 'vi' | 'en';
};

const toSummary = (r: ApplicationRow): ApplicationSummary => ({
  id: r.id, companyName: r.company_name, roleTitle: r.role_title, status: r.status, deadline: r.deadline,
  appliedAt: r.applied_at, createdAt: r.created_at, updatedAt: r.updated_at, language: r.language,
});

// Factory, not a builder: withAuthRetry re-issues the request after a JWT refresh.
async function unwrap<T>(query: () => PromiseLike<{ data: T | null; error: { code?: string; message?: string } | null }>): Promise<T | null> {
  const { data, error } = await withAuthRetry(query);
  if (error) throw new ApplicationTrackerError(trackerErrorCode(error));
  return data;
}

export const APPLICATIONS_PAGE_SIZE = 20;

/**
 * One bounded page, deterministic order (sort column, then id). Dates newest
 * first, deadline soonest first, company A–Z; empty values last.
 */
export async function listApplications({ sort = 'updated_at', page = 0, pageSize = APPLICATIONS_PAGE_SIZE }: { sort?: ApplicationSort; page?: number; pageSize?: number } = {}): Promise<{ items: ApplicationSummary[]; hasMore: boolean }> {
  if (!APPLICATION_SORTS.includes(sort)) throw new Error(`unsupported application sort: ${String(sort)}`);
  const ascending = sort === 'deadline' || sort === 'company_name';
  const from = page * pageSize;
  // One extra row tells whether another page exists.
  const rows = await unwrap<ApplicationRow[]>(() => supabase.from('applications').select(SUMMARY_COLUMNS)
      .order(sort, { ascending, nullsFirst: false })
      .order('id', { ascending: false })
      .range(from, from + pageSize)
  ) ?? [];
  return { items: rows.slice(0, pageSize).map(toSummary), hasMore: rows.length > pageSize };
}

export async function getApplication(id: string): Promise<ApplicationDetail | null> {
  const row = await unwrap<ApplicationRow>(() => supabase.from('applications').select(SUMMARY_COLUMNS).eq('id', id).maybeSingle());
  return row ? toSummary(row) : null;
}

/** Immutable snapshots as saved (P2A). Never regenerated or merged with current analysis. */
export async function getApplicationDocuments(applicationId: string): Promise<ApplicationDocument[]> {
  const rows = await unwrap<{ document_type: ApplicationDocument['type']; content: Record<string, unknown>; metadata: Record<string, unknown>; created_at: string }[]>(() => supabase.from('application_documents').select('document_type, content, metadata, created_at').eq('application_id', applicationId)
  ) ?? [];
  return rows.map((r) => ({ type: r.document_type, content: r.content, metadata: r.metadata, createdAt: r.created_at }));
}

export const TIMELINE_PAGE_SIZE = 50;

/**
 * One bounded timeline page, newest first: occurred_at, created_at, id (all DESC) so
 * equal timestamps still order deterministically. Events are append-only, so a newer
 * event between page loads can only shift rows down (a duplicate, never a gap):
 * callers merge pages by id.
 */
export async function getApplicationTimeline(applicationId: string, page = 0, pageSize = TIMELINE_PAGE_SIZE): Promise<{ items: ApplicationEvent[]; hasMore: boolean }> {
  const from = page * pageSize;
  const rows = await unwrap<{ id: string; event_type: ApplicationEvent['type']; from_status: ApplicationStatus | null; to_status: ApplicationStatus | null; note: string | null; metadata: ApplicationEvent['metadata']; occurred_at: string; created_at: string }[]>(() => supabase.from('application_events')
      .select('id, event_type, from_status, to_status, note, metadata, occurred_at, created_at')
      .eq('application_id', applicationId)
      .order('occurred_at', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + pageSize)
  ) ?? [];
  const items = rows.slice(0, pageSize).map((r): ApplicationEvent => ({
    id: r.id, type: r.event_type, fromStatus: r.from_status, toStatus: r.to_status, note: r.note,
    metadata: r.metadata ?? {}, occurredAt: r.occurred_at, createdAt: r.created_at,
  }));
  return { items, hasMore: rows.length > pageSize };
}

export type ApplicationDetailsState = Pick<ApplicationDetail, 'companyName' | 'roleTitle' | 'deadline' | 'updatedAt'>;
export interface MutationResult { eventId: string | null; replayed: boolean; changed?: boolean; application?: ApplicationDetailsState }

type MutationRow = {
  event_id: string | null; replayed: boolean; changed?: boolean;
  application?: { company_name: string | null; role_title: string | null; deadline: string | null; updated_at: string };
};

const toMutation = (d: MutationRow | null): MutationResult => ({
  eventId: d?.event_id ?? null,
  replayed: !!d?.replayed,
  ...(d && 'changed' in d && { changed: !!d.changed }),
  ...(d?.application && { application: { companyName: d.application.company_name, roleTitle: d.application.role_title, deadline: d.application.deadline, updatedAt: d.application.updated_at } }),
});

/** `expectedStatus` is the status the user saw (compare-and-set); `occurredAt` null = now. */
export async function transitionApplicationStatus(input: { applicationId: string; expectedStatus: ApplicationStatus; toStatus: ApplicationStatus; occurredAt: string | null; note: string | null; idempotencyKey: string }): Promise<MutationResult> {
  return toMutation(await unwrap(() => supabase.rpc('transition_application_status', {
    p_application_id: input.applicationId,
    p_expected_status: input.expectedStatus,
    p_to_status: input.toStatus,
    p_occurred_at: input.occurredAt,
    p_note: input.note,
    p_idempotency_key: input.idempotencyKey,
  })));
}

export async function addApplicationNote(input: { applicationId: string; note: string; idempotencyKey: string }): Promise<MutationResult> {
  return toMutation(await unwrap(() => supabase.rpc('add_application_note', {
    p_application_id: input.applicationId, p_note: input.note, p_idempotency_key: input.idempotencyKey,
  })));
}

/**
 * Full replacement of company / role / deadline (null clears). A no-op returns changed:false.
 * `expectedUpdatedAt` is the row version the edit is based on, passed through as the
 * exact server string (a Date would drop microseconds); a newer row -> stale_application.
 */
export async function updateApplicationDetails(input: { applicationId: string; expectedUpdatedAt: string; companyName: string | null; roleTitle: string | null; deadline: string | null; idempotencyKey: string }): Promise<MutationResult> {
  return toMutation(await unwrap(() => supabase.rpc('update_application_details', {
    p_application_id: input.applicationId,
    p_expected_updated_at: input.expectedUpdatedAt,
    p_company_name: input.companyName,
    p_role_title: input.roleTitle,
    p_deadline: input.deadline,
    p_idempotency_key: input.idempotencyKey,
  })));
}
