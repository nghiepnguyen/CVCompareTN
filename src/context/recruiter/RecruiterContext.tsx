// @refresh reset — provider and hook share this module; see UIContext.tsx.
import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../AuthContext';
import { useUI } from '../UIContext';
import { analyzeCV, deriveRequirementInsights, displayProbability, localizeAiError, type AnalysisResult } from '../../services/ai';
import type { DetailedComparison } from '../../services/ai/types';
import { checkAnalyticsQuota } from '../../services/analyticsQuotaService';
import { processFile as processFileUtil } from '../../hooks/useFileProcessor';
import { cleanText } from '../../hooks/useFileProcessor';
import { cleanupTempAnalysisFiles } from '../../services/cvService';
import { formatLabel } from '../../translations';
import { trackEvent } from '../../lib/ga4';
import {
  getUserCampaigns,
  getCampaignCandidates,
  createCampaign as createCampaignService,
  updateCampaignStatus,
  deleteCampaign,
  createCandidate,
  uploadCandidateFile,
  claimCandidateAnalysis,
  releaseCandidateAnalysis,
  updateCandidateHrStatus,
  saveCandidateAnalysis,
  deleteCandidate,
  getCandidateFileUrl,
  type RecruitmentCampaign,
  type CandidateCV,
  type CampaignStatus,
  type HrStatus,
  type ClaimResult,
} from '../../services/recruiterService';
import type { RecruiterContextValue, ChargeConfirmItem } from './types';
import { isRetryableCandidate, leaseAllowsDispatch } from './analysisLease';
import { VN_TIME_ZONE } from '../../lib/vnTime';
import { withTimeout } from '../../lib/withTimeout';

const RecruiterContext = createContext<RecruiterContextValue | undefined>(undefined);

const SAVE_ATTEMPTS = 3;
const SAVE_BACKOFF_MS = [500, 1500];
const CANDIDATE_FILE_TIMEOUT_MS = 60_000;
const SESSION_TIMEOUT_MS = 6_000;

class LeaseExpiredError extends Error {}

export function RecruiterProvider({ children }: { children: React.ReactNode }) {
  const { user, effectivePlan, userProfile, refreshUserProfile } = useAuth();
  const { reportLanguage, t } = useUI();

  const [campaigns, setCampaigns] = useState<RecruitmentCampaign[]>([]);
  const [activeCampaign, setActiveCampaign] = useState<RecruitmentCampaign | null>(null);
  const [candidates, setCandidates] = useState<CandidateCV[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<CandidateCV | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [campaignLoading, setCampaignLoading] = useState(false);
  const [candidatesLoading, setCandidatesLoading] = useState(false);

  const loadCampaigns = useCallback(async () => {
    if (!user?.id) return;
    setCampaignLoading(true);
    try {
      const data = await getUserCampaigns(user.id);
      setCampaigns(data);
    } catch (err) {
      console.error('loadCampaigns failed:', err);
    } finally {
      setCampaignLoading(false);
    }
  }, [user?.id]);

  // M2-D2 F1: analyses that succeeded (quota already charged) but could not be
  // saved. A later run saves them again under the same attempt, without
  // calling Gemini. Tab memory only: after a reload the row stays 'analyzing'
  // and, once its lease ends, the claim RPC reports it as paid_result_lost.
  const unsavedAnalysesRef = useRef(new Map<string, { analysis: AnalysisResult; attemptId: string; message: string }>());

  const loadCandidates = useCallback(async (campaignId: string) => {
    setCandidatesLoading(true);
    try {
      const data = await getCampaignCandidates(campaignId);
      // Keep unsaved results retryable across a list reload.
      setCandidates(data.map((c) => {
        const unsaved = unsavedAnalysesRef.current.get(c.id);
        if (!unsaved) return c;
        if (c.status === 'done') {
          unsavedAnalysesRef.current.delete(c.id);
          return c;
        }
        return { ...c, status: 'error' as const, errorMessage: unsaved.message };
      }));
    } catch (err) {
      console.error('loadCandidates failed:', err);
    } finally {
      setCandidatesLoading(false);
    }
  }, []);

  const selectCandidate = useCallback((candidate: CandidateCV | null) => {
    setSelectedCandidate(candidate);
  }, []);

  // Auto-load campaigns when user changes
  useEffect(() => {
    if (user?.id && effectivePlan === 'recruiter') {
      void loadCampaigns();
    } else {
      setCampaigns([]);
      setActiveCampaign(null);
      setCandidates([]);
    }
  }, [user?.id, effectivePlan, loadCampaigns]);

  // When active campaign changes, load candidates
  const handleSetActiveCampaign = useCallback(
    (campaign: RecruitmentCampaign | null) => {
      setActiveCampaign(campaign);
      setSelectedCandidate(null);
      if (campaign) {
        void loadCandidates(campaign.id);
      } else {
        setCandidates([]);
      }
    },
    [loadCandidates],
  );

  const handleCreateCampaign = useCallback(
    async (title: string, jdTitle: string, jdContent: string) => {
      const created = await createCampaignService({ title, jdTitle, jdContent });
      setCampaigns((prev) => [created, ...prev]);
      trackEvent('recruiter_create_campaign', {
        campaign_id: created.id,
      });
    },
    [],
  );

  const handleUpdateCampaignStatus = useCallback(
    async (campaignId: string, status: CampaignStatus) => {
      await updateCampaignStatus(campaignId, status);
      setCampaigns((prev) =>
        prev.map((c) => (c.id === campaignId ? { ...c, status } : c)),
      );
      if (activeCampaign?.id === campaignId) {
        setActiveCampaign((prev) => (prev ? { ...prev, status } : prev));
      }
    },
    [activeCampaign],
  );

  const handleDeleteCampaign = useCallback(
    async (campaignId: string) => {
      await deleteCampaign(campaignId);
      setCampaigns((prev) => prev.filter((c) => c.id !== campaignId));
      if (activeCampaign?.id === campaignId) {
        setActiveCampaign(null);
        setCandidates([]);
        setSelectedCandidate(null);
      }
    },
    [activeCampaign],
  );

  const handleUploadCandidateCVs = useCallback(
    async (campaignId: string, files: File[]) => {
      if (!user?.id) throw new Error('Chưa đăng nhập');

      const newCandidates: CandidateCV[] = [];

      for (const file of files) {
        // Upload file to storage
        const { filePath, fileName, candidateId } = await uploadCandidateFile({
          userId: user.id,
          campaignId,
          file,
        });

        // Create candidate record
        const candidateName = file.name.replace(/\.[^.]+$/, '');
        const candidate = await createCandidate({
          campaignId,
          candidateName,
          candidateId,
          fileName,
          filePath,
          fileSize: file.size,
        });

        newCandidates.push(candidate);
      }

      setCandidates((prev) => [...newCandidates, ...prev]);
      // Reload to get fresh count from cache in campaign counter
      void loadCandidates(campaignId);
      void loadCampaigns();

      trackEvent('recruiter_upload_cvs', {
        campaign_id: campaignId,
        count: files.length,
      });
    },
    [user?.id, loadCandidates, loadCampaigns],
  );

  const runCampaignAnalysis = useCallback(
    async (campaignId: string, confirmChargeIds?: string[]): Promise<ChargeConfirmItem[]> => {
      if (!user?.id) return [];
      if (!activeCampaign) return [];

      const jdContent = activeCampaign.jdContent;
      if (!jdContent.trim()) return [];

      // A confirmed re-run touches only the candidates the user confirmed.
      const confirmSet = new Set(confirmChargeIds ?? []);
      const now = Date.now();
      const pendingCandidates = confirmChargeIds
        ? candidates.filter((c) => confirmSet.has(c.id) && c.status !== 'done')
        : candidates.filter((c) => isRetryableCandidate(c, now));

      if (pendingCandidates.length === 0) return [];
      // Save-only retries cost no analysis and are not quota-checked.
      const analysisCount = pendingCandidates.filter((c) => !unsavedAnalysesRef.current.has(c.id)).length;

      // Check quota
      if (analysisCount > 0) try {
        const quota = await checkAnalyticsQuota(user.id, analysisCount);
        if (!quota.allowed) {
          const limitText =
            quota.limit != null
              ? formatLabel(t.monthlyUsageLimitExceededDetail, {
                  used: String(quota.used),
                  limit: String(quota.limit),
                })
              : '';
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
          throw new Error(
            [t.monthlyUsageLimitExceeded, limitText, resetDateText].filter(Boolean).join(' '),
          );
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes(t.monthlyUsageLimitExceeded)) {
          throw err;
        }
        console.error('Quota check failed:', err);
      }

      const setLocal = (id: string, patch: Partial<CandidateCV>) =>
        setCandidates((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));

      // Fenced release; a failed write must not end the batch (M2-D2 F2).
      const release = async (id: string, attemptId: string, errorMessage: string) => {
        try {
          await releaseCandidateAnalysis(id, attemptId, errorMessage);
        } catch (err) {
          console.error(`Releasing analysis attempt failed for candidate ${id}:`, err);
        }
      };

      const needsConfirmation: ChargeConfirmItem[] = [];
      let reloadAfterRun = false;

      // Bounded save retry. Never re-analyzes: the analysis is already paid for.
      const persist = async (candidate: CandidateCV, analysis: AnalysisResult, attemptId: string) => {
        for (let attempt = 0; attempt < SAVE_ATTEMPTS; attempt++) {
          try {
            const saved = await saveCandidateAnalysis(
              candidate.id,
              analysis as unknown as Record<string, unknown>,
              analysis.matchScore,
              attemptId,
            );
            unsavedAnalysesRef.current.delete(candidate.id);
            if (saved === 'superseded') {
              // Another attempt already saved a result: keep it, show it.
              console.warn(`Analysis for candidate ${candidate.id} superseded by a newer saved result`);
              reloadAfterRun = true;
              return;
            }
            trackEvent('recruiter_analysis_done', {
              candidate_id: candidate.id,
              match_score: analysis.matchScore,
            });
            setLocal(candidate.id, {
              status: 'done',
              errorMessage: null,
              matchScore: analysis.matchScore,
              analysisResult: analysis as unknown as Record<string, unknown>,
              analyzedAt: new Date().toISOString(),
            });
            return;
          } catch (err) {
            console.error(`Saving analysis failed for candidate ${candidate.id} (attempt ${attempt + 1}):`, err);
            const wait = SAVE_BACKOFF_MS[attempt];
            if (wait !== undefined) await new Promise((r) => setTimeout(r, wait));
          }
        }
        // Keep the result for a save-only retry. The DB row is left as is
        // (not 'error'), so a reload never re-analyzes a paid result.
        unsavedAnalysesRef.current.set(candidate.id, { analysis, attemptId, message: t.recruiterSaveFailed });
        setLocal(candidate.id, { status: 'error', errorMessage: t.recruiterSaveFailed });
      };

      setIsAnalyzing(true);

      try {
        for (let i = 0; i < pendingCandidates.length; i++) {
          const candidate = pendingCandidates[i];

          const unsaved = unsavedAnalysesRef.current.get(candidate.id);
          if (unsaved) {
            setLocal(candidate.id, { status: 'analyzing' });
            await persist(candidate, unsaved.analysis, unsaved.attemptId);
            continue;
          }

          // M2-D3: take ownership atomically. If the claim cannot be confirmed,
          // do not analyze (M2-D2 F2): an unowned run could be charged twice.
          const attemptId = crypto.randomUUID();
          const claimedAt = Date.now();
          let claim: ClaimResult;
          try {
            claim = await claimCandidateAnalysis(candidate.id, attemptId, confirmSet.has(candidate.id));
          } catch (err) {
            console.error(`Claiming candidate ${candidate.id} failed:`, err);
            setLocal(candidate.id, { status: 'error', errorMessage: t.recruiterStatusWriteFailed });
            continue;
          }
          if (claim.result === 'needs_confirm') {
            console.warn(`Candidate ${candidate.id} needs charge confirmation (${claim.reason})`);
            trackEvent('recruiter_analysis_recovery', { candidate_id: candidate.id, outcome: `needs_confirm:${claim.reason}` });
            needsConfirmation.push({ id: candidate.id, name: candidate.candidateName || candidate.fileName, reason: claim.reason });
            setLocal(candidate.id, {
              status: 'error',
              errorMessage: claim.reason === 'paid_result_lost' ? t.recruiterRecoveryPaidLost : t.recruiterRecoveryUnknown,
            });
            continue;
          }
          if (claim.result === 'active') {
            // Owned by another tab or still running on the server.
            setLocal(candidate.id, { status: 'analyzing', errorMessage: null, analysisStartedAt: claim.startedAt });
            continue;
          }
          if (claim.result !== 'claimed') {
            reloadAfterRun = true;
            continue;
          }
          if (claim.recovered) {
            console.info(`Candidate ${candidate.id} re-analysis confirmed (${claim.recovered})`);
            trackEvent('recruiter_analysis_recovery', { candidate_id: candidate.id, outcome: `confirmed:${claim.recovered}` });
          }
          setLocal(candidate.id, { status: 'analyzing', errorMessage: null, analysisStartedAt: claim.startedAt });

          let tempPaths: string[] = [];
          let analysis: AnalysisResult;
          try {
            const blob = await withTimeout(
              (async () => {
                const response = await fetch(await getCandidateFileUrl(candidate.filePath));
                if (!response.ok) throw new Error('Không tải được CV ứng viên');
                return response.blob();
              })(),
              CANDIDATE_FILE_TIMEOUT_MS,
              'Candidate file download',
            );
            const file = new File([blob], candidate.fileName, { type: blob.type });

            const { data: textData, mimeType, pdfInlineData, pdfStoragePath, dataStoragePath } =
              await processFileUtil(file, user?.id ?? '');

            tempPaths = [pdfStoragePath, dataStoragePath].filter((p): p is string => Boolean(p));

            // Get session token for authenticated API call
            const { data: { session } } = await withTimeout(
              supabase.auth.getSession(),
              SESSION_TIMEOUT_MS,
              'Session lookup',
            );
            const authToken = session?.access_token;

            // Slow download/processing or a resumed suspended tab: the lease
            // may be over and another tab may own the row. Never dispatch then.
            if (!leaseAllowsDispatch(claimedAt)) throw new LeaseExpiredError();

            analysis = await analyzeCV(
              jdContent,
              textData,
              mimeType,
              candidate.fileName,
              reportLanguage,
              authToken,
              pdfInlineData,
              undefined,
              pdfStoragePath,
              dataStoragePath,
              attemptId,
            );
          } catch (err) {
            console.error(`Analysis failed for candidate ${candidate.id}:`, err);
            const errorMsg = err instanceof LeaseExpiredError
              ? t.recruiterLeaseExpired
              : err instanceof Error ? localizeAiError(err, t) : 'Unknown error';
            await release(candidate.id, attemptId, errorMsg);
            setLocal(candidate.id, { status: 'error', errorMessage: errorMsg });
            continue;
          } finally {
            if (tempPaths.length) void cleanupTempAnalysisFiles(tempPaths);
          }

          await persist(candidate, analysis, attemptId);
        }
      } finally {
        setIsAnalyzing(false);
        void refreshUserProfile();
        void loadCampaigns();
        if (reloadAfterRun) void loadCandidates(campaignId);
      }
      return needsConfirmation;
    },
    [user?.id, activeCampaign, candidates, reportLanguage, t, refreshUserProfile, loadCampaigns, loadCandidates],
  );

  // Synchronous guard: `isAnalyzing` flips only after the quota check awaits,
  // so a double click used to analyze the same candidates twice (M2-A P1-2).
  const campaignRunInFlightRef = useRef(false);
  const handleAnalyzeCampaign = useCallback(
    async (campaignId: string, confirmChargeIds?: string[]) => {
      if (campaignRunInFlightRef.current) return [];
      campaignRunInFlightRef.current = true;
      try {
        return await runCampaignAnalysis(campaignId, confirmChargeIds);
      } finally {
        campaignRunInFlightRef.current = false;
      }
    },
    [runCampaignAnalysis],
  );

  const handleUpdateHrStatus = useCallback(
    async (candidateId: string, status: HrStatus, note?: string) => {
      await updateCandidateHrStatus(candidateId, status, note);
      setCandidates((prev) =>
        prev.map((c) =>
          c.id === candidateId
            ? { ...c, hrStatus: status, hrNote: note ?? c.hrNote }
            : c,
        ),
      );
      if (selectedCandidate?.id === candidateId) {
        setSelectedCandidate((prev) =>
          prev ? { ...prev, hrStatus: status, hrNote: note ?? prev.hrNote } : prev,
        );
      }
      void loadCampaigns();

      trackEvent('recruiter_update_hr_status', {
        candidate_id: candidateId,
        hr_status: status,
      });
    },
    [selectedCandidate, loadCampaigns],
  );

  const handleDeleteCandidateCV = useCallback(
    async (candidateId: string, filePath: string) => {
      // Remove from database
      await deleteCandidate(candidateId);
      unsavedAnalysesRef.current.delete(candidateId);
      // Update local state
      setCandidates((prev) => prev.filter((c) => c.id !== candidateId));
      if (selectedCandidate?.id === candidateId) {
        setSelectedCandidate(null);
      }
      void loadCampaigns();

      trackEvent('recruiter_delete_candidate', {
        candidate_id: candidateId,
      });
    },
    [selectedCandidate, loadCampaigns],
  );

  const handleExportToExcel = useCallback(
    async (campaignId: string) => {
      const campaignCandidates = candidates.filter(
        (c) => c.status === 'done',
      );

      try {
        const ExcelJS = await import('exceljs');

        const rows = campaignCandidates.map((c, idx) => {
          type ExportData = {
            categoryScores?: Record<string, number>;
            matchingPoints?: Array<{ content?: string } | string>;
            missingGaps?: Array<{ content?: string } | string>;
            successProbability?: string;
            passProbability?: string;
            probabilityVersion?: string;
            mainFactor?: string;
            detailedComparison?: DetailedComparison;
          };
          const r = c.analysisResult as ExportData | null;
          const catScores = r?.categoryScores;
          // Stage 3.12B: requirement columns are derived from canonical
          // detailedComparison. Existing column names are kept for export
          // compatibility; partial requirements are omitted (never reported
          // as missing) because this sheet has no partial column.
          const insights = deriveRequirementInsights(r?.detailedComparison, {
            matchingPoints: r?.matchingPoints,
            missingGaps: r?.missingGaps,
          });
          const strengths = insights.matched.map((item) => item.requirement).join('; ');
          const weaknesses = insights.missing.map((item) => item.requirement).join('; ');
          return {
            STT: idx + 1,
            'Tên ứng viên': c.candidateName,
            'Điểm khớp': c.matchScore ?? '',
            'Kỹ năng': catScores?.skills ?? '',
            'Kinh nghiệm': catScores?.experience ?? '',
            'Công cụ': catScores?.tools ?? '',
            'Học vấn': catScores?.education ?? '',
            'Khả năng vượt sàng lọc': displayProbability(r ?? {}, 'recruiter'),
            'Yếu tố chính': r?.mainFactor || '',
            'Điểm mạnh': strengths,
            'Điểm yếu': weaknesses,
            'Trạng thái HR':
              c.hrStatus === 'new'
                ? 'Mới'
                : c.hrStatus === 'shortlisted'
                  ? 'Shortlist'
                  : c.hrStatus === 'interviewing'
                    ? 'Phỏng vấn'
                    : c.hrStatus === 'rejected'
                      ? 'Loại'
                      : c.hrStatus === 'hired'
                        ? 'Đã tuyển'
                        : c.hrStatus,
            'Ghi chú': c.hrNote ?? '',
            'Thời gian PT': c.analyzedAt
              ? new Date(c.analyzedAt).toLocaleString('vi-VN', { timeZone: VN_TIME_ZONE })
              : '',
          };
        });

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Candidates');
        if (rows.length > 0) {
          worksheet.columns = Object.keys(rows[0]).map((key) => ({ header: key, key }));
        }
        worksheet.addRows(rows);

        const campaignTitle =
          activeCampaign?.title || campaignId.slice(0, 8);
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${campaignTitle}_ranking.xlsx`;
        anchor.click();
        URL.revokeObjectURL(url);

        trackEvent('recruiter_export_excel', {
          campaign_id: campaignId,
          count: rows.length,
        });
      } catch (err) {
        console.error('Export Excel failed:', err);
        throw new Error('Xuất Excel thất bại');
      }
    },
    [candidates, activeCampaign],
  );

  return (
    <RecruiterContext.Provider
      value={{
        campaigns,
        activeCampaign,
        candidates,
        selectedCandidate,
        isAnalyzing,
        campaignLoading,
        candidatesLoading,

        loadCampaigns,
        setActiveCampaign: handleSetActiveCampaign,
        selectCandidate,
        loadCandidates,

        createCampaign: handleCreateCampaign,
        updateCampaignStatus: handleUpdateCampaignStatus,
        deleteCampaign: handleDeleteCampaign,

        uploadCandidateCVs: handleUploadCandidateCVs,
        analyzeCampaign: handleAnalyzeCampaign,
        updateHrStatus: handleUpdateHrStatus,
        deleteCandidateCV: handleDeleteCandidateCV,
        exportToExcel: handleExportToExcel,
      }}
    >
      {children}
    </RecruiterContext.Provider>
  );
}

export function useRecruiter(): RecruiterContextValue {
  const context = useContext(RecruiterContext);
  if (context === undefined) {
    throw new Error('useRecruiter must be used within RecruiterProvider');
  }
  return context;
}