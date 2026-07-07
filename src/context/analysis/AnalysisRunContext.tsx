import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import * as Sentry from '@sentry/react';
import { useAuth } from '../AuthContext';
import { useUI } from '../UIContext';
import { formatLabel } from '../../translations';
import { trackEvent } from '../../lib/ga4';
import { supabase } from '../../lib/supabase';
import { AnalysisResult, analyzeCV, rewriteFullCV, parseCV } from '../../services/ai';
import {
  saveToHistory,
  deleteFromHistory,
  clearUserHistory,
  getUserHistory,
} from '../../services/historyService';
import { checkAnalyticsQuota } from '../../services/analyticsQuotaService';
import { MAX_BATCH_BY_PLAN } from '../../lib/planLimits';
import type { UserPlan } from '../../services/userService';
import type { AnalysisRunContextType, BatchFileProgress } from './types';
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
  const [batchFiles, setBatchFiles] = useState<BatchFileProgress[]>([]);
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [history, setHistory] = useState<AnalysisResult[]>([]);
  const [selectedResult, setSelectedResult] = useState<AnalysisResult | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [fullCVGeneratingIds, setFullCVGeneratingIds] = useState<Set<string>>(new Set());
  const [parsedCVGeneratingIds, setParsedCVGeneratingIds] = useState<Set<string>>(new Set());

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

  const generateFullCV = useCallback(
    async (
      resultId: string,
      jd: string,
      cvData: string,
      cvMimeType: string,
      language: 'vi' | 'en',
      authToken?: string
    ) => {
      setFullCVGeneratingIds((prev) => new Set([...prev, resultId]));
      try {
        const fullRewrittenCV = await rewriteFullCV(
          jd,
          cvData,
          cvMimeType,
          language,
          authToken
        );
        const patcher = (r: AnalysisResult) =>
          r.id === resultId ? { ...r, fullRewrittenCV } : r;
        setResults((prev) => prev.map(patcher));
        setSelectedResult((prev) => (prev?.id === resultId ? { ...prev, fullRewrittenCV } : prev));
        setHistory((prev) => prev.map(patcher));
      } catch (err) {
        console.error('generateFullCV failed for', resultId, err);
      } finally {
        setFullCVGeneratingIds((prev) => {
          const next = new Set(prev);
          next.delete(resultId);
          return next;
        });
      }
    },
    []
  );

  const generateParsedCVForResult = useCallback(
    async (
      resultId: string,
      jd: string,
      cvData: string,
      cvMimeType: string,
      language: 'vi' | 'en',
      authToken?: string,
      cvPdfInlineData?: string
    ) => {
      setParsedCVGeneratingIds((prev) => new Set([...prev, resultId]));
      try {
        const parsedCV = await parseCV(jd, cvData, cvMimeType, language, authToken, cvPdfInlineData);
        const patcher = (r: AnalysisResult) =>
          r.id === resultId ? { ...r, parsedCV } : r;
        setResults((prev) => prev.map(patcher));
        setSelectedResult((prev) => (prev?.id === resultId ? { ...prev, parsedCV } : prev));
        setHistory((prev) => prev.map(patcher));
      } catch (err) {
        console.error('generateParsedCVForResult failed for', resultId, err);
      } finally {
        setParsedCVGeneratingIds((prev) => {
          const next = new Set(prev);
          next.delete(resultId);
          return next;
        });
      }
    },
    []
  );

  const progressStopRef = useRef<(() => void) | null>(null);
  const currentProgressRef = useRef(0);

  const setProgress = useCallback((value: number) => {
    currentProgressRef.current = value;
    setAnalysisProgress(value);
  }, []);

  const startFakeProgress = useCallback(
    (from: number, to: number, durationMs: number) => {
      progressStopRef.current?.();
      const { stop } = createProgressSimulator({
        from,
        to,
        durationMs,
        onProgress: setProgress,
      });
      progressStopRef.current = stop;
      return stop;
    },
    [setProgress],
  );

  // Eases toward `to`, creeping past known milestones so the bar keeps
  // moving during long waits instead of freezing until the next real event.
  const creepProgress = useCallback(
    (to: number, durationMs: number) => {
      startFakeProgress(currentProgressRef.current, to, durationMs);
    },
    [startFakeProgress],
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
    setProgress(0);
    setAnalysisStatus(reportLanguage === 'vi' ? 'Đang chuẩn bị...' : 'Preparing...');
    setError(null);
    setResults([]);
    setBatchFiles([]);

    setProgress(10);

    trackEvent('analyze_cv', {
      input_mode: cvInputMode,
      jd_mode: 'text',
      cv_count: cvInputMode === 'file' ? files.length : 1,
    });

    try {
      const newResults: AnalysisResult[] = [];
      const cvDataMap = new Map<string, { data: string; mimeType: string; pdfInlineData?: string }>();
      setAnalysisStatus(reportLanguage === 'vi' ? 'Đang đọc CV...' : 'Reading CV...');
      setProgress(15);

      const { data: { session } } = await supabase.auth.getSession();
      const authToken = session?.access_token;

      const failures: { name: string; message: string }[] = [];

      if (cvInputMode === 'file') {
        const totalFiles = files.length;
        const CONCURRENCY = 5;
        const perFileShare = 75 / totalFiles;
        const newResultsSlots: (AnalysisResult | undefined)[] = new Array(totalFiles);
        let nextIndex = 0;
        let completedCount = 0;

        setAnalysisStatus(
          reportLanguage === 'vi'
            ? `Đang phân tích 0/${totalFiles} CV...`
            : `Analyzing 0/${totalFiles} CVs...`
        );
        setBatchFiles(files.map((f) => ({ name: f.name, status: 'pending' })));
        setProgress(20);
        // Creep toward the first milestone right away instead of sitting idle
        // while the first CVs are still in flight.
        creepProgress(Math.min(94, 15 + perFileShare * 0.6), 9000);

        const worker = async () => {
          while (true) {
            const i = nextIndex++;
            if (i >= totalFiles) return;
            const fileOrRef = files[i];
            let succeeded = false;

            setBatchFiles((prev) =>
              prev.map((f, idx) => (idx === i ? { ...f, status: 'processing' } : f))
            );

            try {
              let data: string;
              let mimeType: string;
              let pdfInlineData: string | undefined;
              if (isStoredCVRef(fileOrRef) && fileOrRef.eagerProcessing) {
                ({ data, mimeType, pdfInlineData } = await fileOrRef.eagerProcessing);
              } else {
                const file = isStoredCVRef(fileOrRef) ? await resolveToFile(fileOrRef) : fileOrRef;
                ({ data, mimeType, pdfInlineData } = await processFile(file));
              }

              const analysis = await analyzeCV(
                jd,
                data,
                mimeType,
                fileOrRef.name,
                reportLanguage,
                authToken,
                pdfInlineData,
                totalFiles
              );
              newResultsSlots[i] = { ...analysis, userId: user?.id };
              cvDataMap.set(analysis.id, { data, mimeType, pdfInlineData });
              succeeded = true;

              trackEvent('analysis_success', {
                match_score: analysis.matchScore,
                input_mode: 'file',
              });
            } catch (fileErr) {
              console.error(`Analysis failed for ${fileOrRef.name}:`, fileErr);
              Sentry.captureException(fileErr, {
                tags: { feature: 'analyze_cv_batch_item' },
                contexts: { file: { name: fileOrRef.name } },
              });
              failures.push({
                name: fileOrRef.name,
                message: fileErr instanceof Error ? fileErr.message : String(fileErr),
              });
            } finally {
              completedCount++;
              const isLast = completedCount >= totalFiles;
              const floor = 15 + (completedCount / totalFiles) * 75;
              setBatchFiles((prev) =>
                prev.map((f, idx) => (idx === i ? { ...f, status: succeeded ? 'done' : 'error' } : f))
              );
              setAnalysisStatus(
                reportLanguage === 'vi'
                  ? `Đang phân tích ${completedCount}/${totalFiles} CV...`
                  : `Analyzing ${completedCount}/${totalFiles} CVs...`
              );
              // Snap to the confirmed milestone, then keep creeping toward the
              // next one so the bar never freezes between completions.
              creepProgress(
                isLast ? floor : Math.min(94, floor + perFileShare * 0.6),
                isLast ? 400 : 9000
              );
            }
          }
        };

        await Promise.all(
          Array.from({ length: Math.min(CONCURRENCY, totalFiles) }, () => worker())
        );

        for (const slot of newResultsSlots) {
          if (slot) newResults.push(slot);
        }
      } else {
        setAnalysisStatus(
          reportLanguage === 'vi' ? 'Đang đọc nội dung CV...' : 'Reading CV content...'
        );
        setProgress(25);
        setAnalysisStatus(
          reportLanguage === 'vi' ? 'Đang phân tích nội dung CV...' : 'Analyzing CV content...'
        );
        setProgress(45);

        const stopFake = startFakeProgress(45, 75, 15000);
        const analysis = await analyzeCV(
          jd,
          cvText,
          'text/plain',
          'CV_Pasted.txt',
          reportLanguage,
          authToken
        );
        stopFake();
        setProgress(75);
        newResults.push({ ...analysis, userId: user?.id });
        cvDataMap.set(analysis.id, { data: cvText, mimeType: 'text/plain' });

        trackEvent('analysis_success', {
          match_score: analysis.matchScore,
          input_mode: 'text',
        });
        setProgress(90);
      }

      if (newResults.length === 0 && failures.length > 0) {
        throw new Error(
          failures.length === 1
            ? failures[0].message
            : reportLanguage === 'vi'
              ? `Tất cả ${failures.length} CV đều phân tích thất bại.`
              : `All ${failures.length} CVs failed to analyze.`
        );
      }

      setAnalysisStatus(
        reportLanguage === 'vi' ? 'Đang tổng hợp kết quả...' : 'Synthesizing results...'
      );
      creepProgress(95, 300);
      setResults(newResults);
      const historyLimit = effectivePlan === 'free' ? 50 : 500;
      setHistory((prev) => [...newResults, ...prev].slice(0, historyLimit));

      // Background: generate fullRewrittenCV and parsedCV for each result via separate
      // calls so the main analyze stays fast (neither is in the main Gemini prompt).
      for (const [resultId, { data, mimeType, pdfInlineData }] of cvDataMap) {
        void generateFullCV(resultId, jd, data, mimeType, reportLanguage, authToken);
        void generateParsedCVForResult(
          resultId, jd, data, mimeType, reportLanguage, authToken, pdfInlineData
        );
      }

      if (user?.id) saveToHistory(newResults, effectivePlan).catch(console.error);
      if (newResults.length === 1) setSelectedResult(newResults[0]);

      if (failures.length > 0) {
        const names = failures.map((f) => f.name).join(', ');
        setError(
          reportLanguage === 'vi'
            ? `${failures.length}/${newResults.length + failures.length} CV phân tích thất bại: ${names}. Các CV còn lại đã được lưu.`
            : `${failures.length}/${newResults.length + failures.length} CVs failed to analyze: ${names}. The rest were saved.`
        );
      }

      creepProgress(100, 300);
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
        batchFiles,
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
        fullCVGeneratingIds,
        parsedCVGeneratingIds,
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
