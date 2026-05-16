import React from 'react';
import { motion } from 'motion/react';
import { Sparkles, Check } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { useUI } from '../../../context/UIContext';
import { formatLabel } from '../../../translations';

interface AnalysisLoadingStateProps {
  analysisStatus: string | null;
  analysisProgress: number;
}

export function AnalysisLoadingState({ analysisStatus, analysisProgress }: AnalysisLoadingStateProps) {
  const { t } = useUI();
  const estSeconds = Math.max(0, Math.round((100 - analysisProgress) * 0.15));

  return (
    <motion.div 
      key="loading"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="h-full min-h-[500px] flex flex-col items-center justify-center text-center p-8 bg-white rounded-3xl border border-slate-200 shadow-sm"
    >
      <div className="relative mb-8">
        <div className="w-24 h-24 border-4 border-indigo-100 rounded-full"></div>
        <motion.div 
          className="absolute top-0 left-0 w-24 h-24 border-4 border-indigo-600 rounded-full border-t-transparent"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        />
        <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 text-indigo-600" />
      </div>
      
      <div className="w-full max-w-md mb-8">
        <div className="flex justify-between items-end mb-2">
          <div className="text-left">
            <h3 className="text-xl font-bold text-slate-800">{analysisStatus || t.aiThinking}</h3>
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">
              {t.analysisProgress}
            </p>
          </div>
          <div className="text-right">
            <span className="text-2xl font-black text-indigo-600">{Math.round(analysisProgress)}%</span>
          </div>
        </div>
        
        <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200 p-0.5">
          <motion.div 
            className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full shadow-sm"
            initial={{ width: 0 }}
            animate={{ width: `${analysisProgress}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
        
        <div className="flex justify-between mt-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          <span>{t.progressStart}</span>
          <span>{formatLabel(t.progressEstLeft, { seconds: estSeconds })}</span>
          <span>{t.progressDone}</span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 w-full max-w-md">
        {[
          { step: 1, label: t.loadingStepReadCv, min: 15 },
          { step: 2, label: t.loadingStepAnalyze, min: 40 },
          { step: 3, label: t.loadingStepMatch, min: 70 },
          { step: 4, label: t.loadingStepReport, min: 95 }
        ].map((s) => (
          <div key={s.step} className="flex flex-col items-center gap-2">
            <div className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black transition-all duration-500",
              analysisProgress >= s.min 
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-100 scale-110" 
                : "bg-slate-100 text-slate-400"
            )}>
              {analysisProgress >= s.min ? <Check className="w-4 h-4" /> : s.step}
            </div>
            <span className={cn(
              "text-[8px] font-bold uppercase tracking-tighter",
              analysisProgress >= s.min ? "text-indigo-600" : "text-slate-400"
            )}>{s.label}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
