import React from 'react';
import { motion } from 'motion/react';
import { Sparkles, RefreshCcw, Copy, Check } from 'lucide-react';
import { useUI } from '../../../context/UIContext';
import { AnalysisResult, RewriteSuggestion } from '../../../services/ai';

interface OptimizationTabProps {
  selectedResult: AnalysisResult;
}

export const OptimizationTab = React.memo(function OptimizationTab({ selectedResult }: OptimizationTabProps) {
  const { t } = useUI();
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  return (
    <div id="optimization-content" className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 scroll-mt-24">
      <div className="bg-surface rounded-[2.5rem] p-8 border border-border shadow-sm">
        <div className="flex flex-col gap-10">
          {/* ATS Keywords */}
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
                              <div className="text-[10px] text-text-light uppercase font-black tracking-widest flex items-center gap-2">
                                <div className="w-1.5 h-1.5 bg-border rounded-full" />
                                {t.original}
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
        </div>
      </div>
    </div>
  );
});
