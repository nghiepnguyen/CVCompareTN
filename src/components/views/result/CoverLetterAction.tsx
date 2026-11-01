import React from 'react';
import { Check, Copy, Mail, RefreshCw, X } from 'lucide-react';
import { useUI } from '../../../context/UIContext';
import { useAnalysis } from '../../../context/AnalysisContext';
import { supabase } from '../../../lib/supabase';
import { useFocusTrap } from '../../../hooks/useFocusTrap';
import { cn } from '../../../lib/utils';
import type { UiLabels } from '../../../translations';
import { CoverLetterRequestError, generateCoverLetter, type AnalysisResult } from '../../../services/ai';

type State =
  | { kind: 'idle' }
  | { kind: 'generating' }
  | { kind: 'success'; content: string }
  | { kind: 'error'; message: string };

function errorMessage(err: unknown, t: UiLabels): string {
  if (err instanceof CoverLetterRequestError) {
    if (err.status === 429) return t.coverLetterRateLimited;
    if (err.status === 504) return t.coverLetterTimeout;
  }
  if (err instanceof DOMException && err.name === 'TimeoutError') return t.coverLetterTimeout;
  return t.coverLetterError;
}

/**
 * P1A: "Create Cover Letter" on the result screen. Session-only: needs the JD
 * this result was analyzed against and its parsed CV. The letter is shown,
 * copied or regenerated — never persisted and never written into the result.
 */
export function CoverLetterAction({ selectedResult }: { selectedResult: AnalysisResult }) {
  const { t, reportLanguage } = useUI();
  const { getAnalysisJd, parsedCVGeneratingIds } = useAnalysis();
  const [open, setOpen] = React.useState(false);
  const [language, setLanguage] = React.useState<'vi' | 'en'>(selectedResult.language ?? reportLanguage);
  const [state, setState] = React.useState<State>({ kind: 'idle' });
  const [copied, setCopied] = React.useState(false);
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const requestRef = React.useRef(0);

  const jd = getAnalysisJd(selectedResult.id);
  const parsedCV = selectedResult.parsedCV;
  const disabledReason = !jd
    ? t.coverLetterUnavailableHistory
    : !parsedCV
      ? parsedCVGeneratingIds.has(selectedResult.id) ? t.coverLetterWaitingParsedCv : t.coverLetterNoParsedCv
      : null;

  // A letter belongs to one result: switching results resets the dialog.
  React.useEffect(() => {
    requestRef.current++;
    setOpen(false);
    setState({ kind: 'idle' });
    setLanguage(selectedResult.language ?? reportLanguage);
  }, [selectedResult.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => {
    if (state.kind !== 'generating') setOpen(false);
  };
  useFocusTrap(open, dialogRef, close);

  const generate = async () => {
    if (!jd || !parsedCV) return;
    const request = ++requestRef.current;
    setState({ kind: 'generating' });
    setCopied(false);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await generateCoverLetter(jd, parsedCV, language, session?.access_token);
      if (request !== requestRef.current) return;
      setState(res.fidelityFallback || !res.content
        ? { kind: 'error', message: t.coverLetterFallback }
        : { kind: 'success', content: res.content });
    } catch (err) {
      if (request !== requestRef.current) return;
      setState({ kind: 'error', message: errorMessage(err, t) });
    }
  };

  const copy = async () => {
    if (state.kind !== 'success') return;
    try {
      await navigator.clipboard.writeText(state.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked: the text stays selectable */ }
  };

  const busy = state.kind === 'generating';

  return (
    <>
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={!!disabledReason}
          title={disabledReason ?? undefined}
          className="flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-xs font-black uppercase tracking-wider text-text-main transition-all cursor-pointer hover:scale-105 hover:border-accent hover:text-accent active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 disabled:hover:border-border disabled:hover:text-text-main"
        >
          <Mail className="h-4 w-4" />
          {t.coverLetterCreate}
        </button>
        {disabledReason && <span className="max-w-[16rem] text-right text-[10px] text-text-light">{disabledReason}</span>}
      </div>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={close} aria-hidden="true" />
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="cover-letter-title"
            tabIndex={-1}
            className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-border bg-surface p-6"
          >
            <button
              type="button"
              onClick={close}
              disabled={busy}
              aria-label={t.coverLetterClose}
              className="absolute right-3 top-3 rounded-lg p-1.5 text-text-light cursor-pointer hover:scale-105 hover:bg-surface-secondary active:scale-95 disabled:cursor-not-allowed"
            >
              <X className="h-4 w-4" />
            </button>

            <h3 id="cover-letter-title" className="text-lg font-black text-text-main">{t.coverLetterTitle}</h3>
            <p className="mt-1 text-xs text-text-muted">{t.coverLetterIntro}</p>

            <div className="mt-4 flex items-center gap-3">
              <span className="text-[10px] font-black uppercase tracking-wider text-text-light">{t.coverLetterLanguage}</span>
              <div className="flex rounded-lg border border-border p-0.5" role="group" aria-label={t.coverLetterLanguage}>
                {(['vi', 'en'] as const).map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setLanguage(l)}
                    disabled={busy}
                    aria-pressed={language === l}
                    className={cn(
                      'rounded-md px-3 py-1 text-xs font-bold uppercase cursor-pointer transition-all hover:scale-105 active:scale-95 disabled:cursor-not-allowed',
                      language === l ? 'bg-accent text-white' : 'text-text-muted hover:text-text-main'
                    )}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 min-h-[8rem] flex-1 overflow-y-auto rounded-xl border border-border bg-surface-secondary p-4">
              {state.kind === 'generating' && (
                <div className="flex items-center gap-3 py-8" role="status">
                  <div className="size-6 animate-spin rounded-full border-2 border-accent/20 border-t-accent" />
                  <span className="text-sm font-medium text-text-muted">{t.coverLetterGenerating}</span>
                </div>
              )}
              {state.kind === 'success' && (
                <p className="whitespace-pre-line text-sm leading-relaxed text-text-main" data-testid="cover-letter-content">{state.content}</p>
              )}
              {state.kind === 'error' && <p className="py-8 text-sm font-medium text-error" role="alert">{state.message}</p>}
            </div>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              {state.kind === 'success' && (
                <button
                  type="button"
                  onClick={copy}
                  className="flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-xs font-bold text-text-main cursor-pointer transition-all hover:scale-105 hover:border-accent active:scale-95"
                >
                  {copied ? <Check className="h-4 w-4 text-accent" /> : <Copy className="h-4 w-4" />}
                  {copied ? t.coverLetterCopied : t.coverLetterCopy}
                </button>
              )}
              <button
                type="button"
                onClick={generate}
                disabled={busy}
                data-autofocus
                className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-xs font-bold text-white cursor-pointer transition-all hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
              >
                <RefreshCw className={cn('h-4 w-4', busy && 'animate-spin')} />
                {state.kind === 'idle' ? t.coverLetterGenerate : t.coverLetterRegenerate}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
