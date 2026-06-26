import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import * as Sentry from '@sentry/react';
import { useAuth } from '../AuthContext';
import { useUI } from '../UIContext';
import { formatLabel } from '../../translations';
import { trackEvent } from '../../lib/ga4';
import { supabase } from '../../lib/supabase';
import { AnalysisResult, analyzeCV } from '../../services/ai';
import {
  saveToHistory,
  deleteFromHistory,
  clearUserHistory,
  getUserHistory,
} from '../../services/historyService';
import { useGoogleReCaptcha } from 'react-google-recaptcha-v3';
import { checkAnalyticsQuota } from '../../services/analyticsQuotaService';
import { MAX_BATCH_BY_PLAN } from '../../lib/planLimits';
import type { UserPlan } from '../../services/userService';
import type { AnalysisRunContextType } from './types';
import { cleanText, processFile } from '../../hooks/useFileProcessor';
import {
  isStoredCVRef, resolveToFile, makeStoredCVRef, downloadCVFromStorage,
  type StoredCVRef, type SavedCV,
} from '../../services/cvService';
import { createProgressSimulator } from '../../hooks/useProgressSimulator';

const AnalysisRunContext = createContext<AnalysisRunContextType | undefined>(undefined);

export function AnalysisRunProvider({ children }: { children: React.ReactNode }) {
  const { user, userProfile, effectivePlan, setError, refreshUserProfile } = useAuth();
  const { reportLanguage, t, navigateToUpgrade } = useUI();
  const { executeRecaptcha } = useGoogleReCaptcha();

  const [jd, setJd] = useState('');
  const [cvText, setCvText] = useState('');
  const [cvInputMode, setCvInputMode] = useState<'file' | 'text'>('file');
  const [files, setFiles] = useState<(File | StoredCVRef)[]>([]);

  const [loadingCvIds, setLoadingCvIds] = useState<Set<string>>(new Set());

  const loadCVFromStore = useCallback((cv: SavedCV) => {
    const ref = makeStoredCVRef(cv);
    setLoadingCvIds(prev => new Set([...prev, cv.cvId]));
    ref.eagerProcessing = downloadCVFromStorage(cv.filePath, cv.fileName, cv.fileType)
      .then(file => processFile(file))
      .finally(() => {
        setLoadingCvIds(prev => {
          const next = new Set(prev);
          next.delete(cv.cvId);
          return next;
        });
      });
    setFiles(prev => [...prev, ref]);
  }, [setFiles]);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState<string | null>(null);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [history, setHistory] = useState<AnalysisResult[]>([]);
  const [selectedResult, setSelectedResult] = useState<AnalysisResult | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const loadHistory = useCallback(async () => {
    if (user?.id) {
      setIsLoadingHistory(true);
      try {
        const userHistory = await getUserHistory(user.id, effectivePlan);
        setHistory(userHistory);
      } catch (err) {
        console.error('Error loading history:', err);
      } finally {
        setIsLoadingHistory(false);
      }
    }
  }, [user?.id, effectivePlan]);

  useEffect(() => {
    if (user?.id) {
      void loadHistory();
    } else {
      setHistory([]);
    }
  }, [user?.id, effectivePlan, loadHistory]);

  const progressStopRef = useRef<(() => void) | null>(null);

  const startFakeProgress = useCallback(
    (from: number, to: number, durationMs: number) => {
      progressStopRef.current?.();
      const { stop } = createProgressSimulator({
        from,
        to,
        durationMs,
        onProgress: setAnalysisProgress,
      });
      progressStopRef.current = stop;
      return stop;
    },
    [],
  );

  const handleAnalyze = async () => {
    if (!jd.trim()) return setError('Vui lòng cung cấp Mô tả công việc (JD).');
    if (cvInputMode === 'file' && files.length === 0) return setError('Vui lòng tải lên ít nhất một CV.');
    if (cvInputMode === 'text' && !cvText.trim()) return setError('Vui lòng dán nội dung CV của bạn.');

    const plannedRuns = cvInputMode === 'file' ? files.length : 1;
    const planForLimits: UserPlan =
      userProfile?.role === 'admin' ? 'pro' : effectivePlan;
    const maxBatch = MAX_BATCH_BY_PLAN[planForLimits] ?? 1;
    if (plannedRuns > maxBatch) {
      setError(
        planForLimits === 'free'
          ? t.batchLimitFree.replace('{max}', String(maxBatch))
          : t.batchLimitPro.replace('{max}', String(maxBatch))
      );
      return;
    }

    if (user?.id && userProfile?.role !== 'admin') {
      try {
        const quota = await checkAnalyticsQuota(user.id, plannedRuns);
        if (!quota.allowed) {
          const limitText =
            quota.limit != null
              ? formatLabel(t.monthlyUsageLimitExceededDetail, {
                  used: String(quota.used),
                  limit: String(quota.limit),
                })
              : '';
          const isPaidPlan = effectivePlan === 'pro' || effectivePlan === 'recruiter';
          let resetDateText = '';
          if (quota.month && quota.limit != null) {
            const [y, m] = quota.month.split('-').map(Number);
            if (y && m) {
              const nextDate = new Date(y, m - 1 + 1, Math.min(quota.resetDay, new Date(y, m - 1 + 1, 0).getDate()));
              const formatted = reportLanguage === 'vi'
                ? nextDate.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
                : nextDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
              resetDateText = formatLabel(t.quotaExhaustedOrWait, { date: formatted });
            }
          }
          setError(
            <span>
              {t.monthlyUsageLimitExceeded}
              {limitText && ` ${limitText}`}
              {' '}
              {isPaidPlan ? (
                <>
                  <button
                    type="button"
                    onClick={() => { setError(null); navigateToUpgrade(); }}
                    className="underline cursor-pointer hover:opacity-80"
                  >
                    {t.quotaExhaustedBuyMore}
                  </button>
                  {resetDateText && ` ${resetDateText}`}
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => { setError(null); navigateToUpgrade(); }}
                  className="underline cursor-pointer hover:opacity-80"
                >
                  {t.quotaExhaustedUpgradePro}
                </button>
              )}
            </span>
          );
          return;
        }
      } catch (err) {
        console.error('Quota check failed:', err);
      }
    }

    setIsAnalyzing(true);
    setAnalysisProgress(0);
    setAnalysisStatus(reportLanguage === 'vi' ? 'Đang chuẩn bị...' : 'Preparing...');
    setError(null);
    setResults([]);

    // Get reCAPTCHA token (verification handled server-side in /api/analyze)
    let recaptchaToken: string | undefined;
    try {
      const isLocal =
        window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      if (!isLocal && executeRecaptcha) {
        recaptchaToken = await executeRecaptcha('analyze_cv');
      }
    } catch (err) {
      console.error('reCAPTCHA token error:', err);
    }
    setAnalysisProgress(10);

    trackEvent('analyze_cv', {
      input_mode: cvInputMode,
      jd_mode: 'text',
      cv_count: cvInputMode === 'file' ? files.length : 1,
    });

    try {
      const newResults: AnalysisResult[] = [];
      setAnalysisStatus(reportLanguage === 'vi' ? 'Đang đọc CV...' : 'Reading CV...');
      setAnalysisProgress(15);

      const { data: { session } } = await supabase.auth.getSession();
      const authToken = session?.access_token;

      if (cvInputMode === 'file') {
        const totalFiles = files.length;
        for (let i = 0; i < totalFiles; i++) {
          const fileOrRef = files[i];
          const fileBaseProgress = 15 + (i / totalFiles) * 75;

          setAnalysisStatus(
            reportLanguage === 'vi' ? `Đang đọc file: ${fileOrRef.name}` : `Reading file: ${fileOrRef.name}`
          );
          setAnalysisProgress(fileBaseProgress + 5);

          let data: string;
          let mimeType: string;
          if (isStoredCVRef(fileOrRef) && fileOrRef.eagerProcessing) {
            setAnalysisStatus(
              reportLanguage === 'vi' ? `Đang tải CV: ${fileOrRef.name}...` : `Loading CV: ${fileOrRef.name}...`
            );
            ({ data, mimeType } = await fileOrRef.eagerProcessing);
          } else {
            const file = isStoredCVRef(fileOrRef) ? await resolveToFile(fileOrRef) : fileOrRef;
            ({ data, mimeType } = await processFile(file));
          }

          setAnalysisStatus(
            reportLanguage === 'vi' ? `Đang phân tích: ${fileOrRef.name}` : `Analyzing: ${fileOrRef.name}`
          );
          setAnalysisProgress(fileBaseProgress + 15);

          const fakeStart = fileBaseProgress + 15;
          const fakeEnd = fileBaseProgress + 65;
          const stopFake = startFakeProgress(fakeStart, fakeEnd, 15000);
          const analysis = await analyzeCV(
            jd,
            data,
            mimeType,
            fileOrRef.name,
            reportLanguage,
            recaptchaToken,
            authToken
          );
          stopFake();
          setAnalysisProgress(fakeEnd);
          newResults.push({ ...analysis, userId: user?.id });

          trackEvent('analysis_success', {
            match_score: analysis.matchScore,
            input_mode: 'file',
          });
          setAnalysisProgress(fileBaseProgress + (1 / totalFiles) * 75);
        }
      } else {
        setAnalysisStatus(
          reportLanguage === 'vi' ? 'Đang đọc nội dung CV...' : 'Reading CV content...'
        );
        setAnalysisProgress(25);
        setAnalysisStatus(
          reportLanguage === 'vi' ? 'Đang phân tích nội dung CV...' : 'Analyzing CV content...'
        );
        setAnalysisProgress(45);

        const stopFake = startFakeProgress(45, 75, 15000);
        const analysis = await analyzeCV(
          jd,
          cvText,
          'text/plain',
          'CV_Pasted.txt',
          reportLanguage,
          recaptchaToken,
          authToken
        );
        stopFake();
        setAnalysisProgress(75);
        newResults.push({ ...analysis, userId: user?.id });

        trackEvent('analysis_success', {
          match_score: analysis.matchScore,
          input_mode: 'text',
        });
        setAnalysisProgress(90);
      }

      setAnalysisStatus(
        reportLanguage === 'vi' ? 'Đang tổng hợp kết quả...' : 'Synthesizing results...'
      );
      setAnalysisProgress(95);
      setResults(newResults);
      setHistory((prev) => [...newResults, ...prev].slice(0, 20));

      if (user?.id) saveToHistory(newResults).catch(console.error);
      if (newResults.length === 1) setSelectedResult(newResults[0]);

      setAnalysisProgress(100);
    } catch (err: unknown) {
      console.error(err);
      Sentry.captureException(err, {
        tags: { feature: 'analyze_cv' },
        contexts: {
          analysis: {
            cvInputMode,
            fileCount: cvInputMode === 'file' ? files.length : 1,
            language: reportLanguage,
          },
        },
      });
      const message = err instanceof Error ? err.message : String(err);
      setError(message || 'Đã xảy ra lỗi trong quá trình phân tích.');
    } finally {
      progressStopRef.current?.();
      progressStopRef.current = null;
      if (user?.id) void refreshUserProfile();
      setTimeout(() => {
        setIsAnalyzing(false);
        setAnalysisStatus(null);
        setAnalysisProgress(0);
      }, 500);
    }
  };

  const clearHistory = async () => {
    if (window.confirm('Bạn có chắc chắn muốn xóa toàn bộ lịch sử không?')) {
      setHistory([]);
      if (user?.id) {
        try {
          await clearUserHistory(user.id);
        } catch (err) {
          console.error('Error clearing history:', err);
        }
      }
    }
  };

  const deleteHistoryItem = async (id: string) => {
    setHistory((prev) => prev.filter((item) => item.id !== id));
    if (user?.id) {
      try {
        await deleteFromHistory(user.id, id);
      } catch (err) {
        console.error('Error deleting history item:', err);
      }
    }
  };

  return (
    <AnalysisRunContext.Provider
      value={{
        jd,
        setJd,
        cvText,
        setCvText,
        cvInputMode,
        setCvInputMode,
        files,
        setFiles,
        isAnalyzing,
        analysisStatus,
        analysisProgress,
        results,
        setResults,
        history,
        setHistory,
        selectedResult,
        setSelectedResult,
        isLoadingHistory,
        handleAnalyze,
        clearHistory,
        deleteHistoryItem,
        loadingCvIds,
        loadCVFromStore,
      }}
    >
      {children}
    </AnalysisRunContext.Provider>
  );
}

export function useAnalysisRun(): AnalysisRunContextType {
  const context = useContext(AnalysisRunContext);
  if (context === undefined) {
    throw new Error('useAnalysisRun must be used within AnalysisRunProvider');
  }
  return context;
}
