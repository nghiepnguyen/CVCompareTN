import React from 'react';
import { AnalysisRunProvider } from './AnalysisRunContext';
import { SavedJdProvider } from './SavedJdContext';
import { SavedCvProvider } from './SavedCvContext';
import { useAnalysisRun } from './AnalysisRunContext';
import { useSavedJds } from './SavedJdContext';
import { useSavedCvs } from './SavedCvContext';
import type { AnalysisContextType } from './types';

export function AnalysisProvider({ children }: { children: React.ReactNode }) {
  return (
    <AnalysisRunProvider>
      <SavedJdProvider>
        <SavedCvProvider>{children}</SavedCvProvider>
      </SavedJdProvider>
    </AnalysisRunProvider>
  );
}

export function useAnalysis(): AnalysisContextType {
  const run = useAnalysisRun();
  const saved = useSavedJds();
  const savedCv = useSavedCvs();
  return { ...run, ...saved, ...savedCv };
}

export { useAnalysisRun } from './AnalysisRunContext';
export { useSavedJds } from './SavedJdContext';
export { useSavedCvs } from './SavedCvContext';
