import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { useAnalysis } from '../../context/AnalysisContext';
import { LandingView } from './LandingView';
import { AnalysisInputView } from './AnalysisInputView';
import { ResultView } from './ResultView';

export function DashboardView() {
  const { user } = useAuth();
  const { t } = useUI();

  const { 
    selectedResult,
    isAnalyzing
  } = useAnalysis();

  if (!user) {
    return <LandingView />;
  }

  return (
    <div className="space-y-8 lg:space-y-12 max-w-7xl mx-auto px-4 sm:px-6">
      {/* Hero Section - Hide if viewing focused result */}
      {!selectedResult && !isAnalyzing && (
        <section className="text-center max-w-3xl mx-auto mb-6 lg:mb-10">
          <h2 className="text-2xl sm:text-4xl font-black tracking-tight text-slate-900 mb-4 leading-tight">
            {t.heroTitle} <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600">Smart Insights</span>
          </h2>
          <p className="text-sm sm:text-base text-slate-600 leading-relaxed max-w-2xl mx-auto">
            {t.atsOptimizationDesc}
          </p>
        </section>
      )}

      <div className="space-y-8 lg:space-y-12">
        {/* Input Section - Hidden when viewing detailed result to focus on analysis */}
        {!selectedResult && !isAnalyzing && (
          <div className="w-full">
            <AnalysisInputView />
          </div>
        )}

        {/* Results Section - Limited to 900px for optimized readability */}
        <div className="w-full max-w-[900px] mx-auto">
          <ResultView />
        </div>
      </div>
    </div>
  );
}
