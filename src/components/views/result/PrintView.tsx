import React from 'react';
import { Sparkles } from 'lucide-react';
import { AnalysisResult } from '../../../services/ai/types';
import { useUI } from '../../../context/UIContext';
import { useAuth } from '../../../context/AuthContext';
import { isProPlan, isRecruiterPlan } from '../../../lib/planLimits';
import { CvMarkdownBody } from './CvMarkdownBody';

interface PrintViewProps {
  selectedResult: AnalysisResult;
}

function readPrintState(): { variant: 'premium' | 'free'; version: string } {
  try {
    const variant = sessionStorage.getItem('cvFit_viewMode');
    const version = sessionStorage.getItem('cvFit_printVersion') || '0';
    if (variant === 'premium') return { variant: 'premium', version };
  } catch { /* ignore */ }
  return { variant: 'free', version: '0' };
}

export const PrintView: React.FC<PrintViewProps> = ({ selectedResult }) => {
  const { reportLanguage, t } = useUI();
  const { effectivePlan, userProfile } = useAuth();
  const canExportOptimized =
    userProfile?.role === 'admin' || isProPlan(effectivePlan) || isRecruiterPlan(effectivePlan);

  // Force re-render when OptimizationTab switches tabs via custom event
  const [, forceUpdate] = React.useReducer((x) => x + 1, 0);
  React.useEffect(() => {
    const handler = () => forceUpdate();
    window.addEventListener('cvfit:viewModeChanged', handler);
    return () => window.removeEventListener('cvfit:viewModeChanged', handler);
  }, []);

  const { variant: printVariant, version: printVersion } = readPrintState();
  const printKey = `print-${selectedResult.id}-${printVersion}`;

  // Hidden print layer — only visible during window.print()
  return (
    <div id="cv-print-root" className="min-h-screen bg-white">
      {canExportOptimized ? (
        <div className="max-w-[210mm] mx-auto bg-white p-[20mm]" key={printKey}>
          <CvMarkdownBody
            key={`print-cv-${selectedResult.id}-${printVersion}`}
            markdown={selectedResult.fullRewrittenCV || ''}
            locale={reportLanguage}
            density="print"
            variant={printVariant}
          />
          <div className="mt-20 border-t border-border pt-8 text-center text-[10px] italic text-text-light">
            {t.fullCvDraftFooter}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center min-h-screen p-8">
          <div className="text-center space-y-4 max-w-sm">
            <div className="flex justify-center">
              <Sparkles className="size-10 text-slate-300" />
            </div>
            <p className="text-sm font-medium text-slate-500">
              {t.upgradeFeatureExportCv}
            </p>
            <p className="text-xs text-slate-400">
              {t.upgradePromptFeature.replace('{feature}', t.upgradeFeatureExportCv)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
