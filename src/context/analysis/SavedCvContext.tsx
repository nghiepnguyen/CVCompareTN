import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from '../AuthContext';
import { useUI } from '../UIContext';
import { trackEvent } from '../../lib/ga4';
import {
  saveCVToStorage,
  getSavedCVs,
  deleteSavedCV,
  downloadCVFromStorage,
  type SavedCV,
} from '../../services/cvService';
import type { SavedCvContextType } from './types';
import { MAX_SAVED_CV_BY_PLAN } from '../../lib/planLimits';

const SavedCvContext = createContext<SavedCvContextType | undefined>(undefined);

export function SavedCvProvider({ children }: { children: React.ReactNode }) {
  const { user, effectivePlan, userProfile, setError } = useAuth();
  const { t, navigateToUpgrade } = useUI();
  const [savedCVs, setSavedCVs] = useState<SavedCV[]>([]);
  const [isSavingCV, setIsSavingCV] = useState(false);
  const [isLoadingSavedCVs, setIsLoadingSavedCVs] = useState(false);
  const [savedCVFileName, setSavedCVFileName] = useState<string | null>(null);

  const loadSavedCVs = useCallback(async () => {
    if (user?.id) {
      setIsLoadingSavedCVs(true);
      try {
        const cvs = await getSavedCVs(user.id);
        setSavedCVs(cvs);
      } catch (err) {
        console.error('Error loading saved CVs:', err);
      } finally {
        setIsLoadingSavedCVs(false);
      }
    }
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) {
      void loadSavedCVs();
    } else {
      setSavedCVs([]);
    }
  }, [user?.id, loadSavedCVs]);

  const saveCV = useCallback(
    async (file: File) => {
      if (!user) return;
      const planForLimits = userProfile?.role === 'admin' ? 'pro' : effectivePlan;
      const maxCv = MAX_SAVED_CV_BY_PLAN[planForLimits] ?? 1;
      if (maxCv > 0 && savedCVs.length >= maxCv) {
        setError(
          planForLimits === 'free'
            ? t.savedCvLimitFree
            : t.savedCvLimitPro
        );
        navigateToUpgrade();
        return;
      }

      setIsSavingCV(true);
      try {
        const { cvId, filePath } = await saveCVToStorage(user.id, file);
        setSavedCVs(prev => [
          {
            id: cvId,
            cvId,
            fileName: file.name,
            filePath,
            fileType: file.type,
            fileSize: file.size,
            timestamp: Date.now(),
          },
          ...prev,
        ]);
        trackEvent('cv_save');
        setSavedCVFileName(file.name);
        setTimeout(() => setSavedCVFileName(null), 3000);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        setError('Lỗi khi lưu CV: ' + message);
      } finally {
        setIsSavingCV(false);
      }
    },
    [user, effectivePlan, userProfile?.role, savedCVs.length, setError, t, navigateToUpgrade]
  );

  const handleDeleteSavedCV = useCallback(
    async (cvId: string, filePath: string) => {
      if (!user) return;
      if (!window.confirm('Bạn có chắc chắn muốn xóa CV này khỏi kho lưu trữ không?')) return;
      try {
        await deleteSavedCV(user.id, cvId, filePath);
        setSavedCVs(prev => prev.filter(c => c.cvId !== cvId));
        trackEvent('cv_delete', { cv_id: cvId });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        setError('Lỗi khi xóa CV: ' + message);
      }
    },
    [user, setError, loadSavedCVs]
  );

  /**
   * Download a saved CV from storage and return it as a File object
   * that can be added to the analysis files list.
   */
  const loadCVFromSaved = useCallback(
    async (cv: SavedCV): Promise<File | null> => {
      try {
        const file = await downloadCVFromStorage(cv.filePath, cv.fileName, cv.fileType);
        trackEvent('cv_load_from_saved', { cv_id: cv.cvId });
        return file;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        setError('Lỗi khi tải CV từ kho: ' + message);
        return null;
      }
    },
    [setError]
  );

  return (
    <SavedCvContext.Provider
      value={{
        savedCVs,
        setSavedCVs,
        isSavingCV,
        isLoadingSavedCVs,
        savedCVFileName,
        loadSavedCVs,
        saveCV,
        handleDeleteSavedCV,
        loadCVFromSaved,
      }}
    >
      {children}
    </SavedCvContext.Provider>
  );
}

export function useSavedCvs(): SavedCvContextType {
  const context = useContext(SavedCvContext);
  if (context === undefined) {
    throw new Error('useSavedCvs must be used within SavedCvProvider');
  }
  return context;
}