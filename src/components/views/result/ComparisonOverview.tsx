import React from 'react';
import { Layers, ChevronRight } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { useUI } from '../../../context/UIContext';
import { AnalysisResult } from '../../../services/aiService';

interface ComparisonOverviewProps {
  results: AnalysisResult[];
  setSelectedResult: (res: AnalysisResult) => void;
}

export function ComparisonOverview({ results, setSelectedResult }: ComparisonOverviewProps) {
  const { t, reportLanguage } = useUI();

  return (
    <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
      <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
        <Layers className="w-5 h-5 text-indigo-600" />
        {t.detailedComparison}
      </h3>
      <div className="lg:hidden space-y-3">
        {results.sort((a, b) => b.matchScore - a.matchScore).map((res) => (
          <div 
            key={res.id} 
            onClick={() => setSelectedResult(res)}
            className="p-4 rounded-2xl border border-slate-100 bg-slate-50/30 flex items-center justify-between gap-4 active:scale-[0.98] transition-all"
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center font-black text-xs shrink-0">
                {res.cvName?.substring(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <h4 className="font-bold text-slate-800 truncate">{res.cvName}</h4>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-100 rounded-full text-slate-500 uppercase tracking-tight">
                    {res.successProbability}
                  </span>
                </div>
              </div>
            </div>
            <div className={cn(
              "w-12 h-12 rounded-xl flex flex-col items-center justify-center font-black text-xs border-2 shrink-0",
              res.matchScore > 80 ? "bg-emerald-50 border-emerald-100 text-emerald-600" : 
              res.matchScore > 60 ? "bg-indigo-50 border-indigo-100 text-indigo-600" : "bg-amber-50 border-amber-100 text-amber-600"
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
            <tr className="border-b border-slate-100">
              <th className="pb-4 text-sm font-bold text-slate-400 uppercase tracking-wider">{reportLanguage === 'vi' ? 'Ứng viên / CV' : 'Candidate / CV'}</th>
              <th className="pb-4 text-sm font-bold text-slate-400 uppercase tracking-wider text-center">{reportLanguage === 'vi' ? 'Điểm số' : 'Score'}</th>
              <th className="pb-4 text-sm font-bold text-slate-400 uppercase tracking-wider text-center">{reportLanguage === 'vi' ? 'Xác suất' : 'Probability'}</th>
              <th className="pb-4 text-sm font-bold text-slate-400 uppercase tracking-wider text-right">{reportLanguage === 'vi' ? 'Hành động' : 'Action'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {results.sort((a, b) => b.matchScore - a.matchScore).map((res) => (
              <tr 
                key={res.id} 
                onClick={() => setSelectedResult(res)}
                className="group hover:bg-slate-50/50 transition-colors cursor-pointer"
              >
                <td className="py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center font-bold text-xs">
                      {res.cvName?.substring(0, 2).toUpperCase()}
                    </div>
                    <span className="font-bold text-slate-700">{res.cvName}</span>
                  </div>
                </td>
                <td className="py-4 text-center">
                  <div className={cn(
                    "inline-flex flex-col items-center justify-center w-14 h-14 rounded-2xl font-black text-sm border-2",
                    res.matchScore > 80 ? "bg-emerald-50 border-emerald-100 text-emerald-600" : 
                    res.matchScore > 60 ? "bg-indigo-50 border-indigo-100 text-indigo-600" : "bg-amber-50 border-amber-100 text-amber-600"
                  )}>
                    <span className="text-lg leading-none">{res.matchScore}</span>
                    <span className="text-[8px] uppercase tracking-tighter opacity-60">ATS</span>
                  </div>
                </td>
                <td className="py-4 text-center">
                  <span className="text-xs font-bold px-2 py-1 bg-slate-100 rounded-full text-slate-600">
                    {res.successProbability}
                  </span>
                </td>
                <td className="py-4 text-right">
                  <div className="p-2 text-slate-400 group-hover:text-indigo-600 group-hover:bg-indigo-50 rounded-lg transition-all inline-block">
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
