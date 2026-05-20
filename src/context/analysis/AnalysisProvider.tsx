import React from 'react';
import { AnalysisRunProvider } from './AnalysisRunContext';
import { SavedJdProvider } from './SavedJdContext';
import { useAnalysisRun } from './AnalysisRunContext';
import { useSavedJds } from './SavedJdContext';
import type { AnalysisContextType } from './types';

export function AnalysisProvider({ children }: { children: React.ReactNode }) {
  return (
    <AnalysisRunProvider>
      <SavedJdProvider>{children}</SavedJdProvider>
    </AnalysisRunProvider>
  );
}

export function useAnalysis(): AnalysisContextType {
  const run = useAnalysisRun();
  const saved = useSavedJds();
  return { ...run, ...saved };
}

export { useAnalysisRun } from './AnalysisRunContext';
export { useSavedJds } from './SavedJdContext';
