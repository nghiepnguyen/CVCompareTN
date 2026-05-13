import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronRight, Target, FileSearch, Activity, Zap, User } from 'lucide-react';
import { useAnalysis } from '../../context/AnalysisContext';
import { useUI } from '../../context/UIContext';
import { useAuth } from '../../context/AuthContext';
import { cn } from '../../lib/utils';

// Sub-components
import { AnalysisLoadingState } from './result/AnalysisLoadingState';
import { ComparisonOverview } from './result/ComparisonOverview';
import { AnalysisDetailsTab } from './result/AnalysisDetailsTab';
import { DetailedComparisonTab } from './result/DetailedComparisonTab';
import { OptimizationTab } from './result/OptimizationTab';
import { ParsedCVTab } from './result/ParsedCVTab';
import { RatingSection } from './result/RatingSection';

export function ResultView() {
  const { user } = useAuth();
  const { t, reportLanguage } = useUI();
  const [resultTab, setResultTab] = React.useState<'analysis' | 'comparison' | 'optimization' | 'parsed'>('analysis');
  
  const {
    isAnalyzing, analysisStatus, analysisProgress,
    results, selectedResult, setSelectedResult
  } = useAnalysis();

  return (
    <AnimatePresence mode="wait">
      {isAnalyzing ? (
        <AnalysisLoadingState 
          analysisStatus={analysisStatus} 
          analysisProgress={analysisProgress} 
        />
      ) : results.length > 0 ? (
        <motion.div 
          key="results-list"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-8"
        >
          {/* Comparison Overview if multiple */}
          {results.length > 1 && !selectedResult && (
            <ComparisonOverview 
              results={results} 
              setSelectedResult={setSelectedResult} 
            />
          )}

          {/* Detailed Result View */}
          {selectedResult && (
            <div className="space-y-6" id="analysis-result">
              <div className="flex items-center justify-between mb-8">
                <button 
                  onClick={() => {
                    setSelectedResult(null);
                  }}
                  className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 font-bold text-sm transition-all group cursor-pointer hover:scale-105 active:scale-95"
                >
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center group-hover:bg-indigo-50 transition-colors">
                    <ChevronRight className="w-4 h-4 rotate-180" />
                  </div>
                  {results.length > 1 ? t.backToList : t.back}
                </button>
                
                <div className="flex items-center gap-3">
                  <div className="text-right hidden sm:block">
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{t.analysisTime}</div>
                    <div className="text-sm font-bold text-slate-700">
                      {new Date(selectedResult.timestamp).toLocaleString(reportLanguage === 'vi' ? 'vi-VN' : 'en-US')}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mb-6">
                <div className="flex items-center gap-2 mb-1">
                  <Target className="w-5 h-5 text-indigo-600" />
                  <h3 className="text-xl font-bold text-slate-800">
                    {t.detailedAnalysis} <span className="text-indigo-600">{selectedResult.jobTitle || selectedResult.cvName}</span>
                  </h3>
                </div>
                {selectedResult.jdTitle && (
                  <div className="flex items-start gap-2 ml-7 mt-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <FileSearch className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">{t.comparisonJD}</span>
                      <p className="text-xs text-slate-600 leading-relaxed italic whitespace-pre-line line-clamp-5 break-all">
                        {selectedResult.jdTitle}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Tab Navigation - Sticky Header */}
              <div id="tab-navigation" className="sticky top-16 z-40 bg-white/80 backdrop-blur-xl py-4 -mx-4 px-4 mb-8 border-b border-slate-200/50 flex items-center justify-between shadow-sm overflow-hidden transition-all duration-300">
                <div className="flex items-center gap-1.5 p-1.5 bg-slate-200/50 backdrop-blur-md rounded-[2rem] w-full sm:w-fit shadow-inner overflow-x-auto scrollbar-hide no-scrollbar border border-white/50">
                  {[
                    { id: 'analysis', icon: Activity, label: t.analyze },
                    { id: 'parsed', icon: User, label: reportLanguage === 'vi' ? 'Thông tin CV' : 'Parsed CV' },
                    { id: 'comparison', icon: FileSearch, label: reportLanguage === 'vi' ? 'So sánh' : 'Comparison' },
                    { id: 'optimization', icon: Zap, label: t.optimized }
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => {
                        setResultTab(tab.id as any);
                        setTimeout(() => document.getElementById(`${tab.id}-content`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
                      }}
                      className={cn(
                        "px-5 sm:px-10 py-3 sm:py-3.5 rounded-[1.5rem] text-[10px] sm:text-xs font-black uppercase tracking-[0.1em] transition-all flex items-center gap-2.5 shrink-0 cursor-pointer hover:scale-105 active:scale-95",
                        resultTab === tab.id 
                          ? "bg-white text-indigo-600 shadow-xl shadow-indigo-100/50 ring-1 ring-slate-200" 
                          : "text-slate-500 hover:text-indigo-600 hover:bg-white/60"
                      )}
                    >
                      <tab.icon className={cn("w-4 h-4", resultTab === tab.id ? "animate-pulse" : "")} />
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tab Content */}
              {resultTab === 'analysis' && (
                <AnalysisDetailsTab selectedResult={selectedResult} />
              )}

              {resultTab === 'parsed' && (
                <ParsedCVTab selectedResult={selectedResult} />
              )}

              {resultTab === 'comparison' && (
                <DetailedComparisonTab selectedResult={selectedResult} />
              )}

              {resultTab === 'optimization' && (
                <OptimizationTab selectedResult={selectedResult} />
              )}

              {/* Rating & Feedback - Only if logged in */}
              {user && selectedResult && (
                <div className="mt-12">
                  <RatingSection 
                    userId={user.uid} 
                    analysisId={selectedResult.id} 
                  />
                </div>
              )}
            </div>
          )}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
