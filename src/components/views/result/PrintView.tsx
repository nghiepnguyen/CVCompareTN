import React from 'react';
import { AnalysisResult } from '../../../services/ai/types';
import { useUI } from '../../../context/UIContext';
import { CvMarkdownBody } from './CvMarkdownBody';

interface PrintViewProps {
  selectedResult: AnalysisResult;
}

export const PrintView: React.FC<PrintViewProps> = ({ selectedResult }) => {
  const { reportLanguage, t } = useUI();

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
