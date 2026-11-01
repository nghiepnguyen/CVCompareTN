// @refresh reset — provider and hooks share this module; see UIContext.tsx.
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { captureException } from '../../lib/sentry';
import { useAuth } from '../AuthContext';
import { useUI } from '../UIContext';
import { formatLabel } from '../../translations';
import { trackEvent } from '../../lib/ga4';
import { supabase } from '../../lib/supabase';
import { AnalysisResult, type ParsedCV, analyzeCV, rewriteFullCV, parseCV } from '../../services/ai';
import {
  saveToHistory,
  deleteFromHistory,
  clearUserHistory,
  getUserHistory,
  updateHistoryField,
} from '../../services/historyService';
import { checkAnalyticsQuota } from '../../services/analyticsQuotaService';
import { MAX_BATCH_BY_PLAN } from '../../lib/planLimits';
import type { UserPlan } from '../../services/userService';
import type { AnalysisRunContextType, BatchFileProgress } from './types';
import { cleanText, processFile } from '../../hooks/useFileProcessor';
import {
  isStoredCVRef, resolveToFile, makeStoredCVRef, downloadCVFromStorage, cleanupTempAnalysisFiles,
  type StoredCVRef, type SavedCV,
} from '../../services/cvService';
import { createProgressSimulator } from '../../hooks/useProgressSimulator';
import { createConcurrencyLimiter } from '../../lib/concurrencyLimiter';

const AnalysisRunContext = createContext<AnalysisRunContextType | undefined>(undefined);

// Parse is CV-only (Stage 3.10B), so it starts as soon as the CV source is
// ready and runs concurrently with analyze. Bound it to the same width as the
// analyze worker pool so a large batch cannot double unbounded Gemini load.
export const PARSE_CONCURRENCY = 5;
const limitParseCV = createConcurrencyLimiter(PARSE_CONCURRENCY);

type ParsedCVJob = {
  promise: Promise<ParsedCV | undefined>;
  done: boolean;
  value?: ParsedCV;
};

function startParsedCVJob(
  cvData: string,
  cvMimeType: string,
  language: 'vi' | 'en',
  authToken: string | undefined,
  cvPdfInlineData: string | undefined,
  cvPdfStoragePath: string | undefined,
  cvDataStoragePath: string | undefined
): ParsedCVJob {
  const job: ParsedCVJob = { done: false, promise: Promise.resolve(undefined) };
  job.promise = limitParseCV(() =>
    parseCV(cvData, cvMimeType, language, authToken, cvPdfInlineData, cvPdfStoragePath, cvDataStoragePath)
  )
    .catch((err) => {
      // Parse is an enrichment: it must never reject the analysis flow or leave
      // an unhandled rejection behind. Do not log the CV filename (PII).
      console.error('Parsed CV generation failed:', err instanceof Error ? err.name : 'error');
      return undefined;
    })
    .then((value) => {
      job.value = value;
      job.done = true;
      return value;
    });
  return job;
}

type CVWork = {
  result: AnalysisResult;
  parseJob: ParsedCVJob;
  data: string;
  mimeType: string;
  dataStoragePath?: string;
  tempPaths: string[];
};

export function AnalysisRunProvider({ children }: { children: React.ReactNode }) {
  const { user, userProfile, effectivePlan, setError, refreshUserProfile } = useAuth();
  const { reportLanguage, t, navigateToUpgrade } = useUI();

  const [jd, setJd] = useState('');
  const [cvText, setCvText] = useState('');
  const [cvInputMode, setCvInputMode] = useState<'file' | 'text'>('file');
  const [files, setFiles] = useState<(File | StoredCVRef)[]>([]);
  const filesRef = useRef(files);
  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  const [loadingCvIds, setLoadingCvIds] = useState<Set<string>>(new Set());

  const loadCVFromStore = useCallback((cv: SavedCV) => {
    if (filesRef.current.some(f => isStoredCVRef(f) && f.cvId === cv.cvId)) return;
    const ref = makeStoredCVRef(cv);
    const uid = user?.id ?? '';
    setLoadingCvIds(prev => new Set([...prev, cv.cvId]));
    ref.eagerProcessing = downloadCVFromStorage(cv.filePath, cv.fileName, cv.fileType)
      .then(file => processFile(file, uid))
      .finally(() => {
        setLoadingCvIds(prev => {
          const next = new Set(prev);
          next.delete(cv.cvId);
          return next;
        });
      });
    setFiles(prev => [...prev, ref]);
  }, [setFiles, user?.id]);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState<string | null>(null);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [batchFiles, setBatchFiles] = useState<BatchFileProgress[]>([]);
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [history, setHistory] = useState<AnalysisResult[]>([]);
  const [selectedResult, setSelectedResult] = useState<AnalysisResult | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [fullCVGeneratingIds, setFullCVGeneratingIds] = useState<Set<string>>(new Set());
  // Results whose Full CV was withheld by the server's fidelity check (session only).
  const [fullCVFallbackIds, setFullCVFallbackIds] = useState<Set<string>>(new Set());
  const [parsedCVGeneratingIds, setParsedCVGeneratingIds] = useState<Set<string>>(new Set());
  // JD each result was analyzed against (session only; history keeps a
  // truncated jdTitle, not the JD). P1A cover letter reads it.
  const analysisJdByIdRef = useRef(new Map<string, string>());
  const getAnalysisJd = useCallback((resultId: string) => analysisJdByIdRef.current.get(resultId), []);

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
      authToken?: string,
      cvDataStoragePath?: string,
      userId?: string
    ) => {
      setFullCVGeneratingIds((prev) => new Set([...prev, resultId]));
      try {
        const { fullRewrittenCV, fidelityFallback } = await rewriteFullCV(
          jd,
          cvData,
          cvMimeType,
          language,
          authToken,
          cvDataStoragePath
        );
        if (fidelityFallback) {
          // Nothing to show or persist: no rewrite passed the factual check.
          setFullCVFallbackIds((prev) => new Set([...prev, resultId]));
          return;
        }
        const patcher = (r: AnalysisResult) =>
          r.id === resultId ? { ...r, fullRewrittenCV } : r;
        setResults((prev) => prev.map(patcher));
        setSelectedResult((prev) => (prev?.id === resultId ? { ...prev, fullRewrittenCV } : prev));
        setHistory((prev) => prev.map(patcher));
        if (userId) {
          updateHistoryField(userId, resultId, { full_rewritten_cv: fullRewrittenCV }).catch((err) =>
            console.error('Failed to persist fullRewrittenCV to history', err)
          );
        }
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
      const workByResultId = new Map<string, CVWork>();
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
            let tempPaths: string[] = [];
            let parsedJob: ParsedCVJob | undefined;

            setBatchFiles((prev) =>
              prev.map((f, idx) => (idx === i ? { ...f, status: 'processing' } : f))
            );

            try {
              let data: string;
              let mimeType: string;
              let pdfInlineData: string | undefined;
              let pdfStoragePath: string | undefined;
              let dataStoragePath: string | undefined;
              if (isStoredCVRef(fileOrRef) && fileOrRef.eagerProcessing) {
                ({ data, mimeType, pdfInlineData, pdfStoragePath, dataStoragePath } = await fileOrRef.eagerProcessing);
              } else {
                const file = isStoredCVRef(fileOrRef) ? await resolveToFile(fileOrRef) : fileOrRef;
                ({ data, mimeType, pdfInlineData, pdfStoragePath, dataStoragePath } = await processFile(file, user?.id ?? ''));
              }

              tempPaths = [pdfStoragePath, dataStoragePath].filter((p): p is string => Boolean(p));
              // Parse is CV-only: start it as soon as the source is ready, in
              // parallel with analyze, not after the analysis result exists.
              parsedJob = startParsedCVJob(
                data, mimeType, reportLanguage, authToken, pdfInlineData, pdfStoragePath, dataStoragePath
              );
              const analysis = await analyzeCV(
                jd,
                data,
                mimeType,
                fileOrRef.name,
                reportLanguage,
                authToken,
                pdfInlineData,
                totalFiles,
                pdfStoragePath,
                dataStoragePath
              );
              const result: AnalysisResult = { ...analysis, userId: user?.id };
              if (parsedJob.done && parsedJob.value) result.parsedCV = parsedJob.value;
              newResultsSlots[i] = result;
              workByResultId.set(result.id, {
                result, parseJob: parsedJob, data, mimeType, dataStoragePath, tempPaths,
              });
              succeeded = true;

              trackEvent('analysis_success', {
                match_score: analysis.matchScore,
                input_mode: 'file',
              });
            } catch (fileErr) {
              // Analysis failed; parse may still be running. Never delete the
              // temp object it is reading until that request settles.
              if (tempPaths.length) {
                const settle = parsedJob ? parsedJob.promise : Promise.resolve();
                void settle.then(() => cleanupTempAnalysisFiles(tempPaths));
              }
              // No file name here: console output ships to Sentry logs and CV names carry PII.
              console.error('Analysis failed for batch item:', fileErr);
              captureException(fileErr, { tags: { feature: 'analyze_cv_batch_item' } });
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
        const parsedJob = startParsedCVJob(
          cvText, 'text/plain', reportLanguage, authToken, undefined, undefined, undefined
        );
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
        const result: AnalysisResult = { ...analysis, userId: user?.id };
        if (parsedJob.done && parsedJob.value) result.parsedCV = parsedJob.value;
        newResults.push(result);
        workByResultId.set(result.id, {
          result, parseJob: parsedJob, data: cvText, mimeType: 'text/plain', tempPaths: [],
        });

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

      // Start persistence before attaching background results. Parse persistence
      // waits for this promise, so an UPDATE can never race a missing history row.
      const historySave: Promise<boolean> = user?.id
        ? saveToHistory(newResults, effectivePlan)
            .then(() => true)
            .catch((err) => {
              console.error('Error saving analysis history:', err);
              return false;
            })
        : Promise.resolve(false);

      for (const resultId of workByResultId.keys()) analysisJdByIdRef.current.set(resultId, jd);
      for (const [resultId, work] of workByResultId) {
        const { result, parseJob } = work;
        const parsedInSnapshot = Boolean(result.parsedCV);

        const persistParsedCV = (parsedCV: ParsedCV) => {
          // If parse already finished before the history upsert, parsed_cv was
          // included in that upsert; do not write it twice.
          if (!user?.id || parsedInSnapshot) return;
          void historySave
            .then((saved) => (saved ? updateHistoryField(user.id, resultId, { parsed_cv: parsedCV }) : undefined))
            .catch((err) => console.error('Failed to persist parsedCV to history', err));
        };

        const applyParsedCV = (parsedCV: ParsedCV | undefined) => {
          if (parsedCV) {
            const patcher = (r: AnalysisResult) => (r.id === resultId ? { ...r, parsedCV } : r);
            setResults((prev) => prev.map(patcher));
            setSelectedResult((prev) => (prev?.id === resultId ? { ...prev, parsedCV } : prev));
            setHistory((prev) => prev.map(patcher));
            persistParsedCV(parsedCV);
          }
          setParsedCVGeneratingIds((prev) => {
            if (!prev.has(resultId)) return prev;
            const next = new Set(prev);
            next.delete(resultId);
            return next;
          });
        };

        if (parseJob.done) {
          // Parse won the race: attach now; parsed_cv is already in the upsert.
          if (!parsedInSnapshot && parseJob.value) applyParsedCV(parseJob.value);
        } else {
          // Analysis wins: show it immediately, then patch the exact result id
          // when parse settles. Opening the tab never starts another request.
          setParsedCVGeneratingIds((prev) => new Set([...prev, resultId]));
          void parseJob.promise.then(applyParsedCV);
        }
      }

      // Rewrite remains post-analysis (unchanged scheduling). Parse was already
      // started at CV-ready time; temp storage is deleted only after both settle.
      for (const [resultId, work] of workByResultId) {
        const { parseJob, data, mimeType, dataStoragePath, tempPaths } = work;
        const bgWork = Promise.allSettled([
          generateFullCV(resultId, jd, data, mimeType, reportLanguage, authToken, dataStoragePath, user?.id),
          parseJob.promise,
        ]);
        if (tempPaths.length > 0) {
          void bgWork.then(() => cleanupTempAnalysisFiles(tempPaths));
        }
      }

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
      captureException(err, {
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
        fullCVFallbackIds,
        parsedCVGeneratingIds,
        getAnalysisJd,
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
