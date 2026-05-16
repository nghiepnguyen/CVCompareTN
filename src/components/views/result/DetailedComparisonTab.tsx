import React from 'react';
import { FileSearch, CheckCircle2, Activity, AlertCircle, Sparkles } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { useUI } from '../../../context/UIContext';
import { AnalysisResult, detailedComparisonHasRows } from '../../../services/ai';

interface DetailedComparisonTabProps {
  selectedResult: AnalysisResult;
}

export function DetailedComparisonTab({ selectedResult }: DetailedComparisonTabProps) {
  const { t, reportLanguage } = useUI();

  if (!detailedComparisonHasRows(selectedResult.detailedComparison)) {
    return (
      <div className="bg-surface rounded-3xl p-12 border border-dashed border-border flex flex-col items-center justify-center text-center animate-in fade-in zoom-in duration-500">
        <div className="w-16 h-16 rounded-full bg-surface-muted flex items-center justify-center text-text-light mb-4">
          <FileSearch className="w-8 h-8" />
        </div>
        <h4 className="text-lg font-black text-text-main mb-2">
          {reportLanguage === 'vi' ? 'Không có dữ liệu so sánh' : 'No comparison data available'}
        </h4>
        <p className="text-sm text-text-muted max-w-sm">
          {reportLanguage === 'vi' 
            ? 'Thông tin so sánh chi tiết hiện không khả dụng cho kết quả này.' 
            : 'Detailed comparison information is currently unavailable for this result.'}
        </p>
      </div>
    );
  }

  return (
    <div id="comparison-content" className="space-y-10 animate-in fade-in slide-in-from-bottom-6 duration-700 scroll-mt-24">
      <div className="bg-surface rounded-[2.5rem] shadow-sm border border-border overflow-hidden">
        <div className="px-8 py-6 border-b border-border bg-surface-secondary/50 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-5">
              <div className="w-12 h-12 rounded-2xl bg-accent text-white flex items-center justify-center shadow-lg shadow-accent/20 rotate-3 group-hover:rotate-0 transition-transform">
                <FileSearch className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-lg font-black text-text-main uppercase tracking-tight leading-none mb-1">{t.detailedComparison}</h4>
                <p className="text-[11px] text-text-light font-black uppercase tracking-[0.2em]">{t.detailedComparisonDesc}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="px-4 py-2 rounded-2xl bg-accent-light text-accent text-xs font-black uppercase tracking-widest border border-accent/10 shadow-sm">
                {Object.values(selectedResult.detailedComparison).flat().length} {t.detailedComparisonCount}
              </span>
            </div>
          </div>
        </div>
        
        <div className="px-8 pb-12 pt-8">
          <div className="space-y-16">
            {Object.entries(selectedResult.detailedComparison).map(([category, items]) => {
              if (!Array.isArray(items) || items.length === 0) return null;
              
              const categoryLabelMap: Record<string, string> = {
                'skills': t.skills,
                'experience': t.experience,
                'tools': t.tools,
                'education': t.education,
                'keywords': reportLanguage === 'vi' ? 'Từ khóa' : 'Keywords'
              };
              const categoryLabel = categoryLabelMap[category.toLowerCase()] || category;

              return (
                <div key={category} className="space-y-8 animate-in fade-in slide-in-from-left-4 duration-500">
                  <div className="flex items-center gap-4">
                    <h5 className="text-[12px] font-black text-text-main uppercase tracking-[0.3em] flex items-center gap-3 bg-surface-muted px-4 py-2 rounded-xl border border-border/50">
                      <div className="w-2 h-2 rounded-full bg-accent shadow-[0_0_8px_rgba(var(--color-accent-rgb),0.5)]" />
                      {categoryLabel}
                    </h5>
                    <div className="h-px bg-gradient-to-r from-border to-transparent flex-1" />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {items.map((item, i) => (
                      <div key={i} className={cn(
                        "group p-8 rounded-[2rem] border-2 transition-all flex flex-col relative overflow-hidden hover:shadow-xl active:scale-[0.98]",
                        item.status === 'matched' ? "bg-success-light/10 border-success/10 hover:border-success/30 hover:bg-success-light/20" : 
                        item.status === 'partial' ? "bg-warning-light/10 border-warning/10 hover:border-warning/30 hover:bg-warning-light/20" : 
                        "bg-error-light/10 border-error/10 hover:border-error/30 hover:bg-error-light/20"
                      )}>
                        {/* Status Icon Background Decoration */}
                        <div className={cn(
                          "absolute -top-4 -right-4 w-20 h-20 rotate-12 opacity-[0.03] group-hover:opacity-[0.08] group-hover:scale-125 transition-all duration-500",
                          item.status === 'matched' ? "text-success" : 
                          item.status === 'partial' ? "text-warning" : 
                          "text-error"
                        )}>
                          {item.status === 'matched' ? <CheckCircle2 className="w-full h-full" /> : 
                           item.status === 'partial' ? <Activity className="w-full h-full" /> : 
                           <AlertCircle className="w-full h-full" />}
                        </div>

                        <div className="flex items-start justify-between gap-6 mb-6">
                          <div className="font-black text-text-main text-base leading-tight group-hover:text-accent transition-colors">
                            {item.requirement}
                          </div>
                          <div className={cn(
                            "px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest shrink-0 shadow-sm border border-white/20",
                            item.status === 'matched' ? "bg-success text-white" : 
                            item.status === 'partial' ? "bg-warning text-white" : 
                            "bg-error text-white"
                          )}>
                            {item.status === 'matched' ? t.matched : item.status === 'partial' ? t.partial : t.missing}
                          </div>
                        </div>
                        
                        {item.cvEvidence && (
                          <div className="mb-6 p-5 bg-white/60 backdrop-blur-sm rounded-2xl border border-border/50 text-[13px] text-text-muted leading-relaxed shadow-sm group-hover:bg-white/80 transition-colors">
                            <span className="font-black text-[10px] uppercase tracking-[0.15em] text-text-light block mb-3 flex items-center gap-2">
                              <div className="w-1.5 h-[2px] bg-border" />
                              {t.evidence}
                            </span>
                            <span className="italic">"{item.cvEvidence}"</span>
                          </div>
                        )}
                        
                        {item.improvement && (
                          <div className="mt-auto pt-6 border-t border-border/40">
                            <div className="flex items-start gap-3">
                              <div className="w-7 h-7 rounded-full bg-accent-light flex items-center justify-center shrink-0">
                                <Sparkles className="w-3.5 h-3.5 text-accent" />
                              </div>
                              <p className="text-[13px] text-text-muted font-medium leading-relaxed italic">
                                {item.improvement}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
