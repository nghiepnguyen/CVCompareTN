import React from 'react';
import { FileSearch, CheckCircle2, Activity, AlertCircle, Sparkles } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { useUI } from '../../../context/UIContext';
import { AnalysisResult } from '../../../services/aiService';

interface DetailedComparisonTabProps {
  selectedResult: AnalysisResult;
}

export function DetailedComparisonTab({ selectedResult }: DetailedComparisonTabProps) {
  const { t, reportLanguage } = useUI();

  if (!selectedResult.detailedComparison) return null;

  return (
    <div id="comparison-content" className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 scroll-mt-24">
      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-2xl bg-indigo-100 flex items-center justify-center text-indigo-600 shadow-sm">
                <FileSearch className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-black text-slate-800 uppercase tracking-tight">{t.detailedComparison}</h4>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{t.detailedComparisonDesc}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest shadow-md shadow-indigo-100">
                {Object.values(selectedResult.detailedComparison).flat().length} {t.detailedComparisonCount}
              </span>
            </div>
          </div>
        </div>
        
        <div className="px-6 pb-8 pt-6">
          <div className="space-y-12">
            {Object.entries(selectedResult.detailedComparison).map(([category, items]) => {
              if (!Array.isArray(items) || items.length === 0) return null;
              const categoryLabelMap: Record<string, string> = {
                'skills': t.skills,
                'experience': t.experience,
                'tools': t.tools,
                'education': t.education,
                'keywords': reportLanguage === 'vi' ? 'Từ khóa' : 'Keywords'
              };
              const categoryLabel = categoryLabelMap[category] || category;

              return (
                <div key={category} className="space-y-6">
                  <div className="flex items-center gap-3">
                    <h5 className="text-[11px] font-black text-slate-800 uppercase tracking-[0.2em] flex items-center gap-2 bg-slate-100 px-3 py-1 rounded-lg">
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                      {categoryLabel}
                    </h5>
                    <div className="h-px bg-slate-100 flex-1" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {items.map((item, i) => (
                      <div key={i} className={cn(
                        "p-6 rounded-3xl border transition-all flex flex-col group relative overflow-hidden",
                        item.status === 'matched' ? "bg-emerald-50/20 border-emerald-100 hover:border-emerald-300" : 
                        item.status === 'partial' ? "bg-amber-50/20 border-amber-100 hover:border-amber-300" : 
                        "bg-rose-50/20 border-rose-100 hover:border-rose-300"
                      )}>
                        {/* Status Icon Indicator */}
                        <div className={cn(
                          "absolute -top-2 -right-2 w-12 h-12 rotate-12 opacity-10 group-hover:opacity-20 transition-opacity",
                          item.status === 'matched' ? "text-emerald-600" : 
                          item.status === 'partial' ? "text-amber-600" : 
                          "text-rose-600"
                        )}>
                          {item.status === 'matched' ? <CheckCircle2 className="w-full h-full" /> : 
                           item.status === 'partial' ? <Activity className="w-full h-full" /> : 
                           <AlertCircle className="w-full h-full" />}
                        </div>

                        <div className="flex items-start justify-between gap-4 mb-4">
                          <div className="font-black text-slate-800 text-sm leading-tight group-hover:text-indigo-600 transition-colors">{item.requirement}</div>
                          <div className={cn(
                            "px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest shrink-0 shadow-sm",
                            item.status === 'matched' ? "bg-emerald-500 text-white" : 
                            item.status === 'partial' ? "bg-amber-500 text-white" : 
                            "bg-rose-500 text-white"
                          )}>
                            {item.status === 'matched' ? t.matched : item.status === 'partial' ? t.partial : t.missing}
                          </div>
                        </div>
                        
                        {item.cvEvidence && (
                          <div className="mb-4 p-4 bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-100 text-xs text-slate-600 italic shadow-sm">
                            <span className="font-black text-[9px] uppercase tracking-widest text-slate-400 not-italic block mb-2 flex items-center gap-1.5">
                              <div className="w-1 h-1 bg-slate-300 rounded-full" />
                              {t.evidence}
                            </span>
                            "{item.cvEvidence}"
                          </div>
                        )}
                        
                        {item.improvement && (
                          <div className="mt-auto pt-4 border-t border-slate-100/50">
                            <div className="flex items-start gap-2.5 text-xs text-slate-500 leading-relaxed">
                              <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
                              <span className="font-medium">{item.improvement}</span>
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
