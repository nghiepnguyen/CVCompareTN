import React from 'react';
import { motion } from 'motion/react';
import { FileSearch, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { useUI } from '../../../context/UIContext';
import type { FormatAssessment } from '../../../services/ai';

interface FormatAssessmentCardProps {
  formatAssessment: FormatAssessment | undefined;
}

export function FormatAssessmentCard({ formatAssessment }: FormatAssessmentCardProps) {
  const { t } = useUI();

  const header = (
    <div className="flex items-center gap-3 mb-1">
      <div className="w-10 h-10 rounded-2xl bg-accent-light flex items-center justify-center text-accent shrink-0">
        <FileSearch className="w-5 h-5" />
      </div>
      <div>
        <h4 className="font-bold text-text-main">{t.atsFormatTitle}</h4>
        <p className="text-xs text-text-light font-medium">{t.atsFormatDesc}</p>
      </div>
    </div>
  );

  if (!formatAssessment || !formatAssessment.analysisAvailable) {
    return (
      <div className="min-w-0 bg-surface p-6 rounded-3xl shadow-sm border border-border space-y-4">
        {header}
        <div className="flex items-start gap-2 rounded-2xl border border-dashed border-border bg-surface-secondary/80 px-4 py-3 text-sm text-text-muted">
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{t.atsFormatUnavailable}</span>
        </div>
      </div>
    );
  }

  const checklist: { key: string; label: string; value: boolean; goodWhenTrue: boolean }[] = [
    { key: 'headings', label: t.atsFormatFlagStandardHeadings, value: formatAssessment.hasStandardSectionHeadings, goodWhenTrue: true },
    { key: 'dates', label: t.atsFormatFlagDateConsistency, value: formatAssessment.dateFormatConsistent, goodWhenTrue: true },
    { key: 'columns', label: t.atsFormatFlagMultiColumn, value: formatAssessment.hasMultiColumnLayout, goodWhenTrue: false },
    { key: 'tables', label: t.atsFormatFlagTablesGraphics, value: formatAssessment.hasTablesOrGraphics, goodWhenTrue: false },
    { key: 'contact', label: t.atsFormatFlagContactHeaderFooter, value: formatAssessment.contactInfoInHeaderFooter, goodWhenTrue: false },
    { key: 'font', label: t.atsFormatFlagFontConsistency, value: !formatAssessment.fontConsistencyIssue, goodWhenTrue: true },
    { key: 'scanned', label: t.atsFormatFlagScannedImage, value: formatAssessment.isLikelyScannedImage, goodWhenTrue: false },
  ];

  const score = formatAssessment.overallAtsParseabilityScore;

  return (
    <div className="min-w-0 bg-surface p-6 rounded-3xl shadow-sm border border-border space-y-6">
      {header}

      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="text-[10px] font-black text-text-light uppercase tracking-widest whitespace-nowrap">
          {t.atsFormatScoreLabel}
        </div>
        <div className="flex-1 flex items-center gap-3">
          <div className="flex-1 w-full bg-surface-secondary h-2 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${score}%` }}
              className={cn(
                "h-full rounded-full",
                score >= 80 ? "bg-success" : score >= 50 ? "bg-accent" : "bg-warning"
              )}
            />
          </div>
          <span className="text-sm font-black text-text-main shrink-0">{score}%</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {checklist.map(({ key, label, value, goodWhenTrue }) => {
          const isGood = value === goodWhenTrue;
          return (
            <div
              key={key}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-xl border text-xs font-medium",
                isGood
                  ? "bg-success-light/20 border-success-light/40 text-success"
                  : "bg-warning-light/20 border-warning-light/40 text-warning"
              )}
            >
              {isGood ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              )}
              <span className="text-text-main">{label}</span>
            </div>
          );
        })}
      </div>

      {formatAssessment.formatIssues.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-border">
          <div className="text-[10px] font-black text-text-light uppercase tracking-widest">
            {t.atsFormatIssuesTitle}
          </div>
          <ul className="space-y-1.5">
            {formatAssessment.formatIssues.map((issue, i) => (
              <li key={i} className="text-xs text-text-muted flex items-start gap-2 leading-relaxed">
                <div className="w-1 h-1 rounded-full bg-border mt-1.5 shrink-0" />
                {issue}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
