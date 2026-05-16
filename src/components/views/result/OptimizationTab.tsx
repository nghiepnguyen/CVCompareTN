import React from 'react';
import { motion } from 'motion/react';
import { Sparkles, RefreshCcw, Copy, Check, FileText, Printer, AlignLeft } from 'lucide-react';
import { useUI } from '../../../context/UIContext';
import { AnalysisResult, RewriteSuggestion } from '../../../services/ai';
import { CvMarkdownBody, markdownToPlainText } from './CvMarkdownBody';

interface OptimizationTabProps {
  selectedResult: AnalysisResult;
}

export const OptimizationTab = React.memo(function OptimizationTab({ selectedResult }: OptimizationTabProps) {
  const { t, reportLanguage } = useUI();
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  return (
    <div id="optimization-content" className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 scroll-mt-24">
      {/* ATS Keywords */}
      <div className="bg-surface rounded-[2.5rem] p-8 border border-border shadow-sm">
        <div className="flex flex-col gap-10">
          <div>
            <h4 className="font-bold mb-4 flex items-center gap-2 text-accent">
              <Sparkles className="w-5 h-5" />
              {t.atsKeywords}
            </h4>
            <div className="flex flex-wrap gap-2.5">
              {selectedResult.atsKeywords.map((kw, i) => (
                <motion.span 
                  key={i} 
                  whileHover={{ scale: 1.05, y: -2 }}
                  className="px-4 py-1.5 bg-accent-light text-accent border border-accent/20 rounded-full text-xs font-bold shadow-sm hover:shadow-md hover:border-accent/40 transition-all cursor-default"
                >
                  {kw}
                </motion.span>
              ))}
            </div>
          </div>
          
          <div className="h-px bg-border w-full" />

          {/* Rewrite Suggestions */}
          <div>
            <h4 className="font-bold mb-6 flex items-center gap-2 text-success text-lg">
              <RefreshCcw className="w-6 h-6" />
              {t.rewriteSuggestions}
            </h4>
            <div className="space-y-10">
              {Object.entries(
                selectedResult.rewriteSuggestions.reduce((acc, s) => {
                  const key = s.section || t.sectionOther;
                  if (!acc[key]) acc[key] = [];
                  acc[key].push(s);
                  return acc;
                }, {} as Record<string, RewriteSuggestion[]>)
              ).map(([section, suggestions]) => (
                <div key={section} className="space-y-4">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-px bg-gradient-to-r from-transparent via-success/30 to-transparent flex-1" />
                    <span className="text-[11px] font-black uppercase tracking-[0.4em] text-success bg-success-light/50 backdrop-blur-sm px-6 py-1.5 rounded-full border border-success/20 shadow-sm">
                      {section}
                    </span>
                    <div className="h-px bg-gradient-to-r from-transparent via-success/30 to-transparent flex-1" />
                  </div>
                  
                  <div className="grid grid-cols-1 gap-6">
                    {suggestions.map((s, i) => (
                      <div key={i} className="bg-surface p-6 rounded-[2rem] border border-border hover:border-accent/40 transition-all group relative overflow-hidden shadow-sm hover:shadow-md">
                        <div className="relative space-y-6">
                          {s.original && (
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <div className="text-[10px] text-text-light uppercase font-black tracking-widest flex items-center gap-2">
                                  <div className="w-1.5 h-1.5 bg-border rounded-full" />
                                  {t.original}
                                </div>
                              </div>
                              <div className="text-xs text-text-light font-medium italic opacity-80 bg-surface-secondary p-4 rounded-2xl border border-border leading-relaxed">
                                {s.original}
                              </div>
                            </div>
                          )}
                          
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="text-[10px] text-success uppercase font-black tracking-widest flex items-center gap-2">
                                <div className="w-1.5 h-1.5 bg-success rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                                {t.optimized}
                              </div>
                              <button 
                                onClick={() => {
                                  navigator.clipboard.writeText(s.optimized);
                                  setCopiedId(`suggestion-${i}`);
                                  setTimeout(() => setCopiedId(null), 2000);
                                }}
                                className="flex items-center gap-1.5 px-4 py-2.5 bg-surface hover:bg-success-light text-text-muted hover:text-success rounded-xl text-[10px] font-black uppercase tracking-tight transition-all border border-border hover:border-success shadow-sm cursor-pointer hover:scale-105 active:scale-95"
                              >
                                {copiedId === `suggestion-${i}` ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                {copiedId === `suggestion-${i}` ? t.copied : t.copy}
                              </button>
                            </div>
                            <div className="text-sm text-text-main font-bold leading-relaxed bg-success-light/30 p-6 rounded-2xl border border-success/20 group-hover:border-success/40 transition-all shadow-sm ring-4 ring-success-light/10">
                              {s.optimized}
                            </div>
                          </div>
                          
                          <div className="pt-5 border-t border-border flex items-start gap-4">
                            <div className="w-8 h-8 bg-accent-light rounded-xl flex items-center justify-center shrink-0 border border-accent/10">
                              <Sparkles className="w-4 h-4 text-accent" />
                            </div>
                            <div className="space-y-1">
                              <div className="text-[10px] font-black text-accent uppercase tracking-widest">{t.reason}</div>
                              <p className="text-xs text-text-muted leading-relaxed font-medium">
                                {s.explanation}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Full Rewritten CV */}
          {selectedResult.fullRewrittenCV && (
            <>
              <div className="h-px bg-border w-full" />
              <div className="space-y-6">
                <div className="flex flex-col gap-5 border-b-2 border-border-strong pb-6 lg:flex-row lg:items-end lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-2xl border border-accent/25 bg-accent-light shadow-sm">
                        <FileText className="size-5 text-accent" />
                      </div>
                      <div className="min-w-0 space-y-1">
                        <p className="font-cv-header text-[10px] font-black uppercase tracking-[0.38em] text-text-muted">
                          {t.fullCvSpecimenEyebrow}
                        </p>
                        <h4 className="text-lg font-black tracking-tight text-accent">{t.fullRewrittenCV}</h4>
                        <p className="max-w-xl text-sm font-medium leading-relaxed text-text-muted">{t.fullRewrittenCVDesc}</p>
                      </div>
                    </div>
                  </div>

                  <div className="no-print flex flex-wrap items-center gap-2 lg:justify-end">
                    <span className="hidden h-8 w-px bg-border-strong sm:block lg:h-10" aria-hidden />
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedResult.fullRewrittenCV) {
                          navigator.clipboard.writeText(selectedResult.fullRewrittenCV);
                          setCopiedId('full-cv-md');
                          setTimeout(() => setCopiedId(null), 2000);
                        }
                      }}
                      className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-[11px] font-black uppercase tracking-widest text-text-muted shadow-sm transition-all hover:scale-105 hover:bg-surface-secondary hover:shadow-md active:scale-95 sm:flex-none cursor-pointer"
                    >
                      {copiedId === 'full-cv-md' ? (
                        <Check className="size-4 text-success" />
                      ) : (
                        <Copy className="size-4" />
                      )}
                      {copiedId === 'full-cv-md' ? t.copied : t.copyMarkdown}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedResult.fullRewrittenCV) {
                          navigator.clipboard.writeText(markdownToPlainText(selectedResult.fullRewrittenCV));
                          setCopiedId('full-cv-plain');
                          setTimeout(() => setCopiedId(null), 2000);
                        }
                      }}
                      className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-[11px] font-black uppercase tracking-widest text-text-muted shadow-sm transition-all hover:scale-105 hover:bg-surface-secondary hover:shadow-md active:scale-95 sm:flex-none cursor-pointer"
                    >
                      {copiedId === 'full-cv-plain' ? (
                        <Check className="size-4 text-success" />
                      ) : (
                        <AlignLeft className="size-4" />
                      )}
                      {copiedId === 'full-cv-plain' ? t.copied : t.copyPlainText}
                    </button>
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-accent/25 bg-accent-light px-4 py-3 text-[11px] font-black uppercase tracking-widest text-accent shadow-sm transition-all hover:scale-105 hover:bg-accent/15 hover:shadow-md active:scale-95 sm:flex-none cursor-pointer"
                    >
                      <Printer className="size-4" />
                      {t.printOptimized}
                    </button>
                  </div>
                </div>

                <div className="overflow-hidden rounded-[2.5rem] border border-border bg-surface-muted p-4 shadow-inner sm:p-10">
                  <div className="relative mx-auto min-h-[min(297mm,80vh)] max-w-[210mm] overflow-hidden rounded-sm bg-surface p-8 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.12)] ring-1 ring-border sm:p-14">
                    <span
                      className="pointer-events-none absolute left-4 top-4 size-6 border-l-2 border-t-2 border-text-muted/35 sm:left-6 sm:top-6"
                      aria-hidden
                    />
                    <span
                      className="pointer-events-none absolute right-4 top-4 size-6 border-r-2 border-t-2 border-text-muted/35 sm:right-6 sm:top-6"
                      aria-hidden
                    />
                    <span
                      className="pointer-events-none absolute bottom-4 left-4 size-6 border-b-2 border-l-2 border-text-muted/35 sm:bottom-6 sm:left-6"
                      aria-hidden
                    />
                    <span
                      className="pointer-events-none absolute bottom-4 right-4 size-6 border-b-2 border-r-2 border-text-muted/35 sm:bottom-6 sm:right-6"
                      aria-hidden
                    />

                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-surface via-surface to-surface-secondary" />
                    <div className="pointer-events-none absolute right-0 top-0 p-8 opacity-[0.06]">
                      <FileText className="size-48" />
                    </div>

                    <div className="relative z-10 px-0 sm:px-1">
                      <CvMarkdownBody markdown={selectedResult.fullRewrittenCV} locale={reportLanguage} density="screen" />
                    </div>

                    <div className="relative z-10 mt-16 border-t border-border pt-6 text-center font-cv-header text-[9px] font-bold uppercase tracking-[0.25em] text-text-light">
                      {t.fullCvDraftFooter}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
});

