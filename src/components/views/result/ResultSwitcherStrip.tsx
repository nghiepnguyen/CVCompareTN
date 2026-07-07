import React from 'react';
import { cn } from '../../../lib/utils';
import { AnalysisResult } from '../../../services/ai';

interface ResultSwitcherStripProps {
  results: AnalysisResult[];
  selectedResult: AnalysisResult;
  setSelectedResult: (res: AnalysisResult) => void;
}

export function ResultSwitcherStrip({ results, selectedResult, setSelectedResult }: ResultSwitcherStripProps) {
  const sorted = [...results].sort((a, b) => b.matchScore - a.matchScore);

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide no-scrollbar snap-x snap-mandatory">
      {sorted.map((res) => {
        const active = res.id === selectedResult.id;
        return (
          <button
            key={res.id}
            onClick={() => setSelectedResult(res)}
            className={cn(
              "flex items-center gap-2 shrink-0 px-3 py-2 rounded-2xl border text-left transition-all snap-start cursor-pointer",
              active
                ? "border-accent bg-accent-light text-accent"
                : "border-border bg-surface-secondary text-text-muted hover:text-text-main hover:border-accent/40"
            )}
          >
            <span className={cn(
              "w-7 h-7 rounded-lg flex items-center justify-center font-black text-[10px] shrink-0",
              res.matchScore > 80 ? "bg-success-light text-success" :
              res.matchScore > 60 ? "bg-accent-light text-accent" : "bg-warning-light text-warning"
            )}>
              {res.matchScore}
            </span>
            <span className="font-bold text-xs truncate max-w-[120px]">{res.cvName}</span>
          </button>
        );
      })}
    </div>
  );
}
