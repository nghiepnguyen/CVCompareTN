import { getSupabaseAdmin } from '../payment/supabaseAdmin.js';
import { stripInvisibleControls } from '../untrustedText.js';
import { withTimeout } from '../withTimeout.js';
import { MAX_COVER_LETTER_CV_CHARS, serializeParsedCvForCoverLetter } from '../ai/coverLetterService.js';
import type { FollowUpInput } from '../ai/followUpService.js';

export type FollowUpContext =
  | { status: 'ok'; input: Omit<FollowUpInput, 'language'>; defaultLanguage: 'vi' | 'en' }
  | { status: 'not_found' | 'not_allowed' | 'snapshot_unavailable' | 'unavailable' };

const asLang = (v: unknown): 'vi' | 'en' | null => (v === 'vi' || v === 'en' ? v : null);
const clean = (t: unknown): string => (typeof t === 'string' ? stripInvisibleControls(t).trim() : '');
const textOf = (content: unknown): string => clean((content as { text?: unknown } | null)?.text);

/**
 * Server-owned follow-up inputs. Only the saved CV/JD/letter snapshot content,
 * company/role and the follow-up count are read. jd metadata (the saved
 * analysis; only the letter's language is fetched, via an alias) and application_events (notes) are never queried or selected.
 * Both tables are filtered by user_id, so cross-account looks like missing.
 */
export async function loadFollowUpContext(
  userId: string,
  applicationId: string,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<FollowUpContext> {
  try {
    const db = getSupabaseAdmin();
    const sig = () => signal ?? AbortSignal.timeout(timeoutMs);
    const run = <T>(q: PromiseLike<T>) => withTimeout(Promise.resolve(q), timeoutMs, 'Follow-up context');

    const app = await run(db.from('applications').select('id, status, language, company_name, role_title')
      .eq('id', applicationId).eq('user_id', userId).abortSignal(sig()).maybeSingle());
    if (app.error) return { status: 'unavailable' };
    if (!app.data) return { status: 'not_found' };
    if (app.data.status !== 'applied') return { status: 'not_allowed' };

    const docs = await run(db.from('application_documents').select('document_type, content, language:metadata->>language')
      .eq('application_id', applicationId).eq('user_id', userId).abortSignal(sig()));
    if (docs.error) return { status: 'unavailable' };
    const rows = (docs.data ?? []) as { document_type: string; content: unknown; language: unknown }[];
    const cv = rows.find((r) => r.document_type === 'cv');
    const jd = rows.find((r) => r.document_type === 'jd');
    const letter = rows.find((r) => r.document_type === 'cover_letter');
    const cvText = cv ? serializeParsedCvForCoverLetter((cv.content as { parsedCV?: unknown } | null)?.parsedCV) : '';
    const jdText = jd ? textOf(jd.content) : '';
    if (!cvText || !jdText || cvText.length > MAX_COVER_LETTER_CV_CHARS) return { status: 'snapshot_unavailable' };

    const state = await run(db.from('application_follow_up_state').select('follow_ups_since_reset')
      .eq('application_id', applicationId).abortSignal(sig()).maybeSingle());
    if (state.error) return { status: 'unavailable' };
    const since = Number(state.data?.follow_ups_since_reset ?? 0);

    return {
      status: 'ok',
      defaultLanguage: asLang(letter?.language) ?? asLang(app.data.language) ?? 'vi',
      input: {
        cvText,
        jd: jdText,
        coverLetter: letter ? textOf(letter.content) || null : null,
        companyName: clean(app.data.company_name) || null,
        roleTitle: clean(app.data.role_title) || null,
        followUpNumber: (Number.isFinite(since) && since >= 0 ? since : 0) + 1,
      },
    };
  } catch {
    return { status: 'unavailable' };
  }
}
