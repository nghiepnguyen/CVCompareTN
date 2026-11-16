// @refresh reset — provider and hooks share this module; see UIContext.tsx.
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { captureException } from '../../lib/sentry';
import { useAuth } from '../AuthContext';
import { useUI } from '../UIContext';
import { formatLabel } from '../../translations';
import { trackEvent } from '../../lib/ga4';
import { supabase } from '../../lib/supabase';
import { AnalysisResult, type ParsedCV, analyzeCV, rewriteFullCV, parseCV, localizeAiError } from '../../services/ai';
import {
  saveToHistory,
  deleteFromHistory,
  clearUserHistory,
  getUserHistory,
  updateHistoryField,
} from '../../services/historyService';
import { checkAnalyticsQuota } from '../../services/analyticsQuotaService';
import { MAX_BATCH_BY_PLAN } from '../../lib/planLimits';
import { MAX_CV_TEXT_CHARS, MAX_JD_CHARS } from '../../lib/inputLimits';
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
// Full CV starts automatically for every result once the batch settles; a
// recruiter batch of 50 used to open 50 rewrite requests at once (M2-A P1-3).
export const REWRITE_CONCURRENCY = 5;
const limitRewriteCV = createConcurrencyLimiter(REWRITE_CONCURRENCY);

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
  const resultsRef = useRef(results);
  useEffect(() => {
    resultsRef.current = results;
  }, [results]);
  const runTokenRef = useRef(0);
  // M2-D2 F4: results whose history upsert failed (offered a save-only retry).
  const unsavedResultIdsRef = useRef(new Set<string>());
  // A background field (parsed CV, Full CV) can be written once its history
  // row exists: the run's upsert succeeded, or a Retry save did since. While
  // still unsaved, the field rides along with the next Retry save instead.
  const rowExists = (runSaved: boolean, resultId: string) => runSaved || !unsavedResultIdsRef.current.has(resultId);
  // M2-D2 F3: the last file run. After a partial failure, re-running with the
  // same JD analyzes only inputs that have no result yet.
  const lastFileRunRef = useRef<{
    jd: string;
    resultByInput: Map<File | StoredCVRef, AnalysisResult>;
    hadFailures: boolean;
  } | null>(null);
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
      userId?: string,
      // Persist only once the history row exists (M2-D2 F4); an UPDATE on a
      // missing row matches nothing and fails silently.
      historySaved: Promise<boolean> = Promise.resolve(true)
    ) => {
      setFullCVGeneratingIds((prev) => new Set([...prev, resultId]));
      try {
        const { fullRewrittenCV, fidelityFallback } = await limitRewriteCV(() => rewriteFullCV(
          jd,
          cvData,
          cvMimeType,
          language,
          authToken,
          cvDataStoragePath
        ));
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
          void historySaved
            .then((saved) => (rowExists(saved, resultId) ? updateHistoryField(userId, resultId, { full_rewritten_cv: fullRewrittenCV }) : undefined))
            .catch((err) => console.error('Failed to persist fullRewrittenCV to history', err));
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

  // Puts saved results into the sidebar history, preferring the live copy
  // (it may already carry a parsed CV or Full CV attached after the run).
  const addSavedToHistory = (saved: AnalysisResult[]) => {
    const ids = new Set(saved.map((r) => r.id));
    const latest = saved.map((r) => resultsRef.current.find((x) => x.id === r.id) ?? r);
    const historyLimit = effectivePlan === 'free' ? 50 : 500;
    setHistory((prev) => [...latest, ...prev.filter((h) => !ids.has(h.id))].slice(0, historyLimit));
  };

  const retrySaveHistory = async () => {
    if (!user?.id) return;
    const pending = resultsRef.current.filter((r) => unsavedResultIdsRef.current.has(r.id));
    if (pending.length === 0) return setError(null);
    try {
      // Upsert on (user_id, analysis_id): a retry after a lost response
      // updates the same row, never a duplicate.
      await saveToHistory(pending, effectivePlan);
      for (const r of pending) unsavedResultIdsRef.current.delete(r.id);
      addSavedToHistory(pending);
      setError(null);
    } catch (err) {
      console.error('Retry saving analysis history failed:', err);
      setError(runOutcomeMessage([], pending.length, false));
    }
  };

  const runOutcomeMessage = (
    failures: { name: string; message: string }[],
    okCount: number,
    saved: boolean
  ): React.ReactNode => {
    const vi = reportLanguage === 'vi';
    const total = okCount + failures.length;
    const names = failures.map((f) => f.name).join(', ');
    const failed = failures.length === 0
      ? ''
      : vi
        ? `${failures.length}/${total} CV phân tích thất bại: ${names}. `
        : `${failures.length}/${total} CVs failed to analyze: ${names}. `;
    const rest = saved
      ? vi
        ? 'Các CV còn lại đã được lưu. Bấm Phân tích để chạy lại các CV lỗi.'
        : 'The rest were saved. Press Analyze to re-run the failed CVs.'
      : failures.length > 0
        ? vi
          ? 'Các CV còn lại đã phân tích xong nhưng chưa lưu được vào lịch sử.'
          : 'The rest were analyzed but could not be saved to history.'
        : vi
          ? 'Phân tích xong nhưng chưa lưu được vào lịch sử.'
          : 'Analysis finished but could not be saved to history.';
    if (saved) return failed + rest;
    return (
      <span>
        {failed + rest}{' '}
        <button type="button" onClick={() => void retrySaveHistory()} className="underline cursor-pointer hover:opacity-80">
          {vi ? 'Thử lưu lại' : 'Retry save'}
        </button>
      </span>
    );
  };

  // Set synchronously on click: `isAnalyzing` only flips after the quota
  // check awaits, so a double click used to start two full runs (M2-A P1-2).
  const runInFlightRef = useRef(false);
  const handleAnalyze = async () => {
    if (runInFlightRef.current) return;
    runInFlightRef.current = true;
    try {
      await runAnalyze();
    } finally {
      runInFlightRef.current = false;
    }
  };

  const runAnalyze = async () => {
    if (!jd.trim()) return setError('Vui lòng cung cấp Mô tả công việc (JD).');
    if (cvInputMode === 'file' && files.length === 0) return setError('Vui lòng tải lên ít nhất một CV.');
    if (cvInputMode === 'text' && !cvText.trim()) return setError('Vui lòng dán nội dung CV của bạn.');

    // K0: reject oversize input before any CV parse starts (server stays authoritative).
    if (jd.trim().length > MAX_JD_CHARS) return setError(formatLabel(t.aiErrorInputTooLarge, { max: String(MAX_JD_CHARS) }));
    if (cvInputMode === 'text' && cvText.trim().length > MAX_CV_TEXT_CHARS) {
      return setError(formatLabel(t.aiErrorInputTooLarge, { max: String(MAX_CV_TEXT_CHARS) }));
    }

    // F3: after a partial failure with the same JD, skip inputs that already
    // have a result (analyzed, charged and shown); run only the rest.
    // With nothing left to retry (every input has a result), it is a new full run.
    const lastRun = lastFileRunRef.current;
    const keptResults = new Map<File | StoredCVRef, AnalysisResult>();
    if (cvInputMode === 'file' && lastRun?.hadFailures && lastRun.jd === jd) {
      for (const f of files) {
        const r = lastRun.resultByInput.get(f);
        if (r) keptResults.set(f, r);
      }
    }
    const retryOnly = keptResults.size > 0 && keptResults.size < files.length;
    if (!retryOnly) keptResults.clear();
    const runFiles = retryOnly ? files.filter((f) => !keptResults.has(f)) : files;

    const plannedRuns = cvInputMode === 'file' ? runFiles.length : 1;
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
    const runToken = ++runTokenRef.current;
    // Retry-only keeps the earlier results on screen; a full run starts fresh.
    if (!retryOnly) {
      setResults([]);
      unsavedResultIdsRef.current.clear();
    }
    setBatchFiles([]);

    setProgress(10);

    trackEvent('analyze_cv', {
      input_mode: cvInputMode,
      jd_mode: 'text',
      cv_count: cvInputMode === 'file' ? runFiles.length : 1,
    });

    try {
      const newResults: AnalysisResult[] = [];
      const workByResultId = new Map<string, CVWork>();
      setAnalysisStatus(reportLanguage === 'vi' ? 'Đang đọc CV...' : 'Reading CV...');
      setProgress(15);

      const { data: { session } } = await supabase.auth.getSession();
      const authToken = session?.access_token;

      const failures: { name: string; message: string }[] = [];

      const succeededInputs = new Map<File | StoredCVRef, AnalysisResult>();
      if (cvInputMode === 'file') {
        const totalFiles = runFiles.length;
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
        setBatchFiles(runFiles.map((f) => ({ name: f.name, status: 'pending' })));
        setProgress(20);
        // Creep toward the first milestone right away instead of sitting idle
        // while the first CVs are still in flight.
        creepProgress(Math.min(94, 15 + perFileShare * 0.6), 9000);

        const worker = async () => {
          while (true) {
            const i = nextIndex++;
            if (i >= totalFiles) return;
            const fileOrRef = runFiles[i];
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
                // F7: consume once. Its temp upload is deleted after this run,
                // so a later run must process the stored CV again.
                const eager = fileOrRef.eagerProcessing;
                fileOrRef.eagerProcessing = undefined;
                ({ data, mimeType, pdfInlineData, pdfStoragePath, dataStoragePath } = await eager);
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
              succeededInputs.set(fileOrRef, result);
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
                message: localizeAiError(fileErr, t),
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
        lastFileRunRef.current = {
          jd,
          resultByInput: new Map([...keptResults, ...succeededInputs]),
          hadFailures: failures.length > 0,
        };
      } else {
        lastFileRunRef.current = null;
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
      // Before any state update that renders these results (the ref itself
      // never triggers a render).
      for (const resultId of workByResultId.keys()) analysisJdByIdRef.current.set(resultId, jd);
      setResults(retryOnly ? [...keptResults.values(), ...newResults] : newResults);

      // Start persistence before attaching background results. Parse and Full
      // CV persistence wait for this promise, so an UPDATE can never race a
      // missing history row. The sidebar history shows a result only once it
      // is saved (F4).
      // Kept results whose save failed earlier ride along with this upsert.
      const toPersist = [
        ...newResults,
        ...[...keptResults.values()].filter((r) => unsavedResultIdsRef.current.has(r.id)),
      ];
      const historySave: Promise<boolean> = user?.id
        ? saveToHistory(toPersist, effectivePlan)
            .then(() => {
              for (const r of toPersist) unsavedResultIdsRef.current.delete(r.id);
              addSavedToHistory(toPersist);
              return true;
            })
            .catch((err) => {
              console.error('Error saving analysis history:', err);
              captureException(err, { tags: { feature: 'analyze_history_save' } });
              for (const r of toPersist) unsavedResultIdsRef.current.add(r.id);
              return false;
            })
        : Promise.resolve(false);

      for (const [resultId, work] of workByResultId) {
        const { result, parseJob } = work;
        const parsedInSnapshot = Boolean(result.parsedCV);

        const persistParsedCV = (parsedCV: ParsedCV) => {
          // If parse already finished before the history upsert, parsed_cv was
          // included in that upsert; do not write it twice.
          if (!user?.id || parsedInSnapshot) return;
          void historySave
            .then((saved) => (rowExists(saved, resultId) ? updateHistoryField(user.id, resultId, { parsed_cv: parsedCV }) : undefined))
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
          generateFullCV(resultId, jd, data, mimeType, reportLanguage, authToken, dataStoragePath, user?.id, historySave),
          parseJob.promise,
        ]);
        if (tempPaths.length > 0) {
          void bgWork.then(() => cleanupTempAnalysisFiles(tempPaths));
        }
      }

      if (newResults.length === 1 && !retryOnly) setSelectedResult(newResults[0]);
      // Claim "saved" only once the upsert answered (F4). Not awaited: a slow
      // upsert must not hold the run open; a newer run drops this banner.
      void historySave.then((saved) => {
        if (runToken !== runTokenRef.current) return;
        if (failures.length > 0 || !saved) setError(runOutcomeMessage(failures, newResults.length, saved));
      });

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
      const message = localizeAiError(err, t);
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
