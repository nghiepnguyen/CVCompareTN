import React from 'react';
import { Layers, ChevronRight } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { useUI } from '../../../context/UIContext';
import { AnalysisResult } from '../../../services/ai';

interface ComparisonOverviewProps {
  results: AnalysisResult[];
  setSelectedResult: (res: AnalysisResult) => void;
}

export function ComparisonOverview({ results, setSelectedResult }: ComparisonOverviewProps) {
  const { t } = useUI();

  return (
    <div className="bg-surface p-6 rounded-3xl shadow-sm border border-border overflow-hidden">
      <h3 className="text-lg font-bold mb-6 flex items-center gap-2 text-text-main">
        <Layers className="w-5 h-5 text-accent" />
        {t.detailedComparison}
      </h3>
      <div className="lg:hidden space-y-3">
        {results.sort((a, b) => b.matchScore - a.matchScore).map((res) => (
          <div 
            key={res.id} 
            onClick={() => setSelectedResult(res)}
            className="p-4 rounded-2xl border border-border bg-surface-secondary flex items-center justify-between gap-4 active:scale-[0.98] transition-all cursor-pointer"
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-10 h-10 bg-accent-light text-accent rounded-xl flex items-center justify-center font-black text-xs shrink-0">
                {res.cvName?.substring(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <h4 className="font-bold text-text-main truncate">{res.cvName}</h4>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] font-bold px-2 py-0.5 bg-surface-muted rounded-full text-text-muted uppercase tracking-tight">
                    {res.successProbability}
                  </span>
                </div>
              </div>
            </div>
            <div className={cn(
              "w-12 h-12 rounded-xl flex flex-col items-center justify-center font-black text-xs border-2 shrink-0",
              res.matchScore > 80 ? "bg-success-light border-success-light text-success" : 
              res.matchScore > 60 ? "bg-accent-light border-accent-light text-accent" : "bg-warning-light border-warning-light text-warning"
            )}>
              <span className="text-base leading-none">{res.matchScore}</span>
              <span className="text-[7px] uppercase tracking-tighter opacity-60">ATS</span>
            </div>
          </div>
        ))}
      </div>

      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border">
              <th className="pb-4 text-sm font-bold text-text-light uppercase tracking-wider">{t.comparisonColCandidate}</th>
              <th className="pb-4 text-sm font-bold text-text-light uppercase tracking-wider text-center">{t.comparisonColScore}</th>
              <th className="pb-4 text-sm font-bold text-text-light uppercase tracking-wider text-center">{t.comparisonColProbability}</th>
              <th className="pb-4 text-sm font-bold text-text-light uppercase tracking-wider text-right">{t.comparisonColAction}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {results.sort((a, b) => b.matchScore - a.matchScore).map((res) => (
              <tr 
                key={res.id} 
                onClick={() => setSelectedResult(res)}
                className="group hover:bg-surface-secondary transition-colors cursor-pointer"
              >
                <td className="py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-accent-light text-accent rounded-lg flex items-center justify-center font-bold text-xs">
                      {res.cvName?.substring(0, 2).toUpperCase()}
                    </div>
                    <span className="font-bold text-text-main">{res.cvName}</span>
                  </div>
                </td>
                <td className="py-4 text-center">
                  <div className={cn(
                    "inline-flex flex-col items-center justify-center w-14 h-14 rounded-2xl font-black text-sm border-2",
                    res.matchScore > 80 ? "bg-success-light border-success-light text-success" : 
                    res.matchScore > 60 ? "bg-accent-light border-accent-light text-accent" : "bg-warning-light border-warning-light text-warning"
                  )}>
                    <span className="text-lg leading-none">{res.matchScore}</span>
                    <span className="text-[8px] uppercase tracking-tighter opacity-60">ATS</span>
                  </div>
                </td>
                <td className="py-4 text-center">
                  <span className="text-xs font-bold px-2 py-1 bg-surface-muted rounded-full text-text-muted">
                    {res.successProbability}
                  </span>
                </td>
                <td className="py-4 text-right">
                  <div className="p-2 text-text-light group-hover:text-accent group-hover:bg-accent-light rounded-lg transition-all inline-block">
                    <ChevronRight className="w-5 h-5" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
