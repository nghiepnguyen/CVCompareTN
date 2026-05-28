import type React from 'react';
import type { AnalysisResult } from '../../services/ai';
import type { SavedJD } from '../../services/historyService';

export interface AnalysisRunContextType {
  jd: string;
  setJd: React.Dispatch<React.SetStateAction<string>>;
  cvText: string;
  setCvText: React.Dispatch<React.SetStateAction<string>>;
  cvInputMode: 'file' | 'text';
  setCvInputMode: React.Dispatch<React.SetStateAction<'file' | 'text'>>;
  files: File[];
  setFiles: React.Dispatch<React.SetStateAction<File[]>>;

  isAnalyzing: boolean;
  analysisStatus: string | null;
  analysisProgress: number;
  results: AnalysisResult[];
  setResults: React.Dispatch<React.SetStateAction<AnalysisResult[]>>;
  history: AnalysisResult[];
  setHistory: React.Dispatch<React.SetStateAction<AnalysisResult[]>>;
  selectedResult: AnalysisResult | null;
  setSelectedResult: React.Dispatch<React.SetStateAction<AnalysisResult | null>>;

  isLoadingHistory: boolean;

  handleAnalyze: () => Promise<void>;
  clearHistory: () => Promise<void>;
  deleteHistoryItem: (id: string) => Promise<void>;
}

export interface SavedJdContextType {
  savedJDs: SavedJD[];
  setSavedJDs: React.Dispatch<React.SetStateAction<SavedJD[]>>;
  isSavingJD: boolean;
  isLoadingSavedJDs: boolean;
  loadSavedJDs: () => Promise<void>;
  confirmSaveJD: (title: string, jdContent: string) => Promise<void>;
  handleDeleteSavedJD: (jdId: string) => Promise<void>;
}

export type AnalysisContextType = AnalysisRunContextType & SavedJdContextType;
