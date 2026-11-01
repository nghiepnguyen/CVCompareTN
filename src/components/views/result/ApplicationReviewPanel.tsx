import React from 'react';
import { AlertTriangle, Check, CheckCircle2, Copy } from 'lucide-react';
import { cn } from '../../../lib/utils';
import type { UiLabels } from '../../../translations';
import type { ApplicationReviewResponse } from '../../../services/ai';

const SEVERITIES = ['high', 'medium', 'low'] as const;

/**
 * P1B review result: verdict (no score), findings grouped by severity and the
 * optional revised letter. Presentational; the parent owns the request.
 */
export function ApplicationReviewPanel({
  review,
  t,
  onUseRevised,
}: {
  review: ApplicationReviewResponse;
  t: UiLabels;
  onUseRevised: (content: string) => void;
}) {
  const [copied, setCopied] = React.useState(false);
  const ready = review.verdict === 'ready';
  const label = { high: t.reviewSeverityHigh, medium: t.reviewSeverityMedium, low: t.reviewSeverityLow };

  const copy = async () => {
    if (!review.revisedCoverLetter) return;
    try {
      await navigator.clipboard.writeText(review.revisedCoverLetter);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked: the text stays selectable */ }
  };

  return (
    <section className="mt-4 border-t border-border pt-4" data-testid="application-review" aria-live="polite">
      <div className={cn('flex items-start gap-2 rounded-xl border p-3', ready ? 'border-accent/40' : 'border-warning/50')}>
        {ready ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />}
        <div>
          <p className="text-sm font-black text-text-main">{ready ? t.reviewReady : t.reviewNeedsReview}</p>
          <p className="text-xs text-text-muted">{ready ? t.reviewReadyNote : t.reviewNeedsReviewNote}</p>
        </div>
      </div>

      {SEVERITIES.map((severity) => {
        const items = review.findings.filter((f) => f.severity === severity);
        if (!items.length) return null;
        return (
          <div key={severity} className="mt-3">
            <h4 className="text-[10px] font-black uppercase tracking-wider text-text-light">{label[severity]}</h4>
            <ul className="mt-1 space-y-1">
              {items.map((f, i) => (
                <li key={i} className="flex gap-2 text-sm text-text-main" data-severity={severity}>
                  <span aria-hidden="true">•</span>
                  <span>{f.message}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      {review.revisedCoverLetter ? (
        <div className="mt-4">
          <h4 className="text-[10px] font-black uppercase tracking-wider text-text-light">{t.reviewRevisedTitle}</h4>
          <p className="mt-1 whitespace-pre-line rounded-xl border border-border p-3 text-sm leading-relaxed text-text-main" data-testid="revised-cover-letter">
            {review.revisedCoverLetter}
          </p>
          <div className="mt-2 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={copy}
              className="flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-xs font-bold text-text-main cursor-pointer transition-all hover:scale-105 hover:border-accent active:scale-95"
            >
              {copied ? <Check className="h-4 w-4 text-accent" /> : <Copy className="h-4 w-4" />}
              {copied ? t.coverLetterCopied : t.coverLetterCopy}
            </button>
            <button
              type="button"
              onClick={() => onUseRevised(review.revisedCoverLetter as string)}
              className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-xs font-bold text-white cursor-pointer transition-all hover:scale-105 active:scale-95"
            >
              {t.reviewUseRevised}
            </button>
          </div>
        </div>
      ) : (
        !ready && <p className="mt-3 text-xs text-text-muted">{t.reviewNoRevision}</p>
      )}
    </section>
  );
}
