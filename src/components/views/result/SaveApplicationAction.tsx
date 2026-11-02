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
  | { kind: 'saved'; created: boolean }
  | { kind: 'error' };

/**
 * P2A "Save application": snapshots the CV/JD (and the letter currently shown,
 * if any) of a session result. History rows lack the full JD, so Save is
 * unavailable there instead of reconstructing a document.
 */
export function SaveApplicationAction({ selectedResult, coverLetter }: { selectedResult: AnalysisResult; coverLetter: CurrentCoverLetter | null }) {
  const { t } = useUI();
  const { getAnalysisJd, parsedCVGeneratingIds } = useAnalysis();
  const [state, setState] = React.useState<State>({ kind: 'idle' });
  const inFlight = React.useRef(false);

  const jd = getAnalysisJd(selectedResult.id);
  const parsedCV = selectedResult.parsedCV;
  const disabledReason = !jd
    ? t.coverLetterUnavailableHistory
    : !parsedCV
      ? parsedCVGeneratingIds.has(selectedResult.id) ? t.coverLetterWaitingParsedCv : t.saveApplicationNoParsedCv
      : null;

  const currentId = React.useRef(selectedResult.id);
  currentId.current = selectedResult.id;
  React.useEffect(() => setState({ kind: 'idle' }), [selectedResult.id]);

  const save = async () => {
    // Ref, not state: two clicks in one tick both see the old state.
    if (!jd || !parsedCV || inFlight.current) return;
    inFlight.current = true;
    const resultId = selectedResult.id;
    setState({ kind: 'saving' });
    try {
      const { created } = await saveApplication({ result: selectedResult, parsedCV, jd, coverLetter });
      trackEvent('application_saved', { created, has_cover_letter: !!coverLetter });
      if (resultId === currentId.current) setState({ kind: 'saved', created });
    } catch (err) {
      // No content in logs: snapshots carry CV/JD/letter text.
      captureException(err, { tags: { feature: 'save_application' } });
      if (resultId === currentId.current) setState({ kind: 'error' });
    } finally {
      inFlight.current = false;
    }
  };

  const saved = state.kind === 'saved';
  const note = disabledReason
    ?? (state.kind === 'error' ? t.saveApplicationError : saved && !state.created ? t.saveApplicationAlreadySaved : null);

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
