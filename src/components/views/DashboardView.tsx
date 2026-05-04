import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { LandingView } from './LandingView';
import { AnalysisInputView } from './AnalysisInputView';
import { ResultView } from './ResultView';

export function DashboardView() {
  const { user } = useAuth();
  const { t } = useUI();

  if (!user) {
    return <LandingView />;
  }

  return (
    <div className="space-y-12">
      {/* Hero Section */}
      <section className="text-center max-w-2xl mx-auto mb-10">
        <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 mb-3 leading-tight">
          {t.heroTitle} <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600">Smart Insights</span>
        </h2>
        <p className="text-sm text-slate-600 leading-relaxed">
          {t.atsOptimizationDesc}
        </p>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Inputs (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <AnalysisInputView />
        </div>

        {/* Right Column: Results (7 cols) */}
        <div className="lg:col-span-7">
          <ResultView />
        </div>
      </div>
    </div>
  );
}
