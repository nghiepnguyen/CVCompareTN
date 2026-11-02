import React from 'react';
import { BookmarkCheck, BookmarkPlus } from 'lucide-react';
import { useUI } from '../../../context/UIContext';
import { useAnalysis } from '../../../context/AnalysisContext';
import { captureException } from '../../../lib/sentry';
import { trackEvent } from '../../../lib/ga4';
import { saveApplication, type CurrentCoverLetter } from '../../../services/applicationService';
import type { AnalysisResult } from '../../../services/ai';

type State =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; applicationId: string }
  | { kind: 'error' };

/**
 * P2A "Save application": snapshots the CV/JD (and the letter currently shown,
 * if any) of a session result. History rows lack the full JD, so Save is
 * unavailable there instead of reconstructing a document.
 *
 * Idempotency: one key per Save intent (per result, this session). Double
 * clicks and retries after an error reuse it, so if a failed-looking request
 * actually committed, the retry returns that application (created:false) with
 * its original snapshots. A saved result stays saved; a letter generated later
 * is not attached to it.
 */
export function SaveApplicationAction({ selectedResult, coverLetter }: { selectedResult: AnalysisResult; coverLetter: CurrentCoverLetter | null }) {
  const { t } = useUI();
  const { getAnalysisJd, parsedCVGeneratingIds } = useAnalysis();
  const [states, setStates] = React.useState<Record<string, State>>({});
  const keys = React.useRef(new Map<string, string>());
  // Ref, not state: two clicks in one tick both see the old state.
  const inFlight = React.useRef(new Set<string>());

  const resultId = selectedResult.id;
  const state = states[resultId] ?? { kind: 'idle' };
  const jd = getAnalysisJd(resultId);
  const parsedCV = selectedResult.parsedCV;
  const disabledReason = !jd
    ? t.coverLetterUnavailableHistory
    : !parsedCV
      ? parsedCVGeneratingIds.has(resultId) ? t.coverLetterWaitingParsedCv : t.saveApplicationNoParsedCv
      : null;

  const save = async () => {
    if (!jd || !parsedCV || inFlight.current.has(resultId) || state.kind === 'saved') return;
    inFlight.current.add(resultId);
    let idempotencyKey = keys.current.get(resultId);
    if (!idempotencyKey) {
      idempotencyKey = crypto.randomUUID();
      keys.current.set(resultId, idempotencyKey);
    }
    const set = (next: State) => setStates((prev) => ({ ...prev, [resultId]: next }));
    set({ kind: 'saving' });
    try {
      const { id, created } = await saveApplication({ idempotencyKey, result: selectedResult, parsedCV, jd, coverLetter });
      trackEvent('application_saved', { created, has_cover_letter: !!coverLetter });
      set({ kind: 'saved', applicationId: id });
    } catch (err) {
      // No content in logs: snapshots carry CV/JD/letter text.
      captureException(err, { tags: { feature: 'save_application' } });
      set({ kind: 'error' });
    } finally {
      inFlight.current.delete(resultId);
    }
  };

  const saved = state.kind === 'saved';
  const note = disabledReason ?? (state.kind === 'error' ? t.saveApplicationError : null);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={save}
        disabled={!!disabledReason || state.kind === 'saving' || saved}
        title={disabledReason ?? t.saveApplicationHint}
        aria-busy={state.kind === 'saving'}
        className="flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-xs font-black uppercase tracking-wider text-text-main transition-all cursor-pointer hover:scale-105 hover:border-accent hover:text-accent active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 disabled:hover:border-border disabled:hover:text-text-main"
      >
        {saved ? <BookmarkCheck className="h-4 w-4 text-accent" /> : <BookmarkPlus className="h-4 w-4" />}
        {state.kind === 'saving' ? t.saveApplicationSaving : saved ? t.saveApplicationSaved : t.saveApplication}
      </button>
      {note && (
        <span className={state.kind === 'error' ? 'max-w-[16rem] text-right text-[10px] text-error' : 'max-w-[16rem] text-right text-[10px] text-text-light'} role={state.kind === 'error' ? 'alert' : undefined}>
          {note}
        </span>
      )}
    </div>
  );
}
