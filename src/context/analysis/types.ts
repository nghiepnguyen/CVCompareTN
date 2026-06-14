import type React from 'react';
import type { AnalysisResult } from '../../services/ai';
import type { SavedJD } from '../../services/historyService';
import type { SavedCV, StoredCVRef } from '../../services/cvService';

export interface AnalysisRunContextType {
  jd: string;
  setJd: React.Dispatch<React.SetStateAction<string>>;
  cvText: string;
  setCvText: React.Dispatch<React.SetStateAction<string>>;
  cvInputMode: 'file' | 'text';
  setCvInputMode: React.Dispatch<React.SetStateAction<'file' | 'text'>>;
  files: (File | StoredCVRef)[];
  setFiles: React.Dispatch<React.SetStateAction<(File | StoredCVRef)[]>>;

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

export interface SavedCvContextType {
  savedCVs: SavedCV[];
  setSavedCVs: React.Dispatch<React.SetStateAction<SavedCV[]>>;
  isSavingCV: boolean;
  isLoadingSavedCVs: boolean;
  savedCVFileName: string | null;
  loadSavedCVs: () => Promise<void>;
  saveCV: (file: File) => Promise<void>;
  handleDeleteSavedCV: (cvId: string, filePath: string) => Promise<void>;
  loadCVFromSaved: (cv: SavedCV) => Promise<File | null>;
}

export type AnalysisContextType = AnalysisRunContextType & SavedJdContextType & SavedCvContextType;
