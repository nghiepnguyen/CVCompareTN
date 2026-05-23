import React from 'react';
import { AnalysisResult } from '../../../services/ai/types';
import { useUI } from '../../../context/UIContext';
import { useAuth } from '../../../context/AuthContext';
import { UpgradePrompt } from '../../shared/UpgradePrompt';
import { isProPlan } from '../../../lib/planLimits';
import { CvMarkdownBody } from './CvMarkdownBody';

interface PrintViewProps {
  selectedResult: AnalysisResult;
}

export const PrintView: React.FC<PrintViewProps> = ({ selectedResult }) => {
  const { reportLanguage, t } = useUI();
  const { effectivePlan, userProfile } = useAuth();
  const canExportOptimized =
    userProfile?.role === 'admin' || isProPlan(effectivePlan);

  if (!canExportOptimized) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-8">
        <UpgradePrompt feature={t.upgradeFeatureExportCv} className="max-w-md w-full" />
      </div>
    );
  }

  return (
    <div id="cv-print-root" className="min-h-screen bg-white">
      <div className="max-w-[210mm] mx-auto bg-white p-[20mm]">
        <CvMarkdownBody
          key={`print-${selectedResult.id}`}
          markdown={selectedResult.fullRewrittenCV || ''}
          locale={reportLanguage}
          density="print"
        />

        <div className="mt-20 border-t border-border pt-8 text-center text-[10px] italic text-text-light">{t.fullCvDraftFooter}</div>
      </div>
    </div>
  );
};
