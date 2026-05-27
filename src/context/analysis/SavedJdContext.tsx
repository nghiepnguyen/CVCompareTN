import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from '../AuthContext';
import { useUI } from '../UIContext';
import { trackEvent } from '../../lib/ga4';
import {
  saveJDToProfile,
  getSavedJDs,
  deleteSavedJD,
  type SavedJD,
} from '../../services/jdService';
import type { SavedJdContextType } from './types';
import { MAX_SAVED_JD_BY_PLAN } from '../../lib/planLimits';

const SavedJdContext = createContext<SavedJdContextType | undefined>(undefined);

export function SavedJdProvider({ children }: { children: React.ReactNode }) {
  const { user, effectivePlan, userProfile, setError } = useAuth();
  const { t, navigateToUpgrade } = useUI();
  const [savedJDs, setSavedJDs] = useState<SavedJD[]>([]);
  const [isSavingJD, setIsSavingJD] = useState(false);
  const [isLoadingSavedJDs, setIsLoadingSavedJDs] = useState(false);

  const loadSavedJDs = useCallback(async () => {
    if (user?.id) {
      setIsLoadingSavedJDs(true);
      try {
        const jds = await getSavedJDs(user.id);
        setSavedJDs(jds);
      } catch (err) {
        console.error('Error loading saved JDs:', err);
      } finally {
        setIsLoadingSavedJDs(false);
      }
    }
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) {
      void loadSavedJDs();
    } else {
      setSavedJDs([]);
    }
  }, [user?.id, loadSavedJDs]);

  const confirmSaveJD = async (title: string, jdContent: string) => {
    if (!user) return;
    const planForLimits = userProfile?.role === 'admin' ? 'pro' : effectivePlan;
    const maxJd = MAX_SAVED_JD_BY_PLAN[planForLimits] ?? 3;
    if (Number.isFinite(maxJd) && savedJDs.length >= maxJd) {
      setError(t.savedJdLimitFree);
      navigateToUpgrade();
      return;
    }
    setIsSavingJD(true);
    try {
      await saveJDToProfile(user.id, title, jdContent);
      await loadSavedJDs();
      trackEvent('jd_create', { method: 'manual' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError('Lỗi khi lưu JD: ' + message);
    } finally {
      setIsSavingJD(false);
    }
  };

  const handleDeleteSavedJD = async (jdId: string) => {
    if (!user) return;
    if (!window.confirm('Bạn có chắc chắn muốn xóa JD này khỏi kho lưu trữ không?')) return;
    try {
      await deleteSavedJD(user.id, jdId);
      await loadSavedJDs();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError('Lỗi khi xóa JD: ' + message);
    }
  };

  return (
    <SavedJdContext.Provider
      value={{
        savedJDs,
        setSavedJDs,
        isSavingJD,
        isLoadingSavedJDs,
        loadSavedJDs,
        confirmSaveJD,
        handleDeleteSavedJD,
      }}
    >
      {children}
    </SavedJdContext.Provider>
  );
}

export function useSavedJds(): SavedJdContextType {
  const context = useContext(SavedJdContext);
  if (context === undefined) {
    throw new Error('useSavedJds must be used within SavedJdProvider');
  }
  return context;
}
