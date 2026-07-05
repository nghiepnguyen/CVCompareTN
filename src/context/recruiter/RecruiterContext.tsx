import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../AuthContext';
import { useUI } from '../UIContext';
import { analyzeCV, type AnalysisResult } from '../../services/ai';
import { checkAnalyticsQuota } from '../../services/analyticsQuotaService';
import { processFile as processFileUtil } from '../../hooks/useFileProcessor';
import { cleanText } from '../../hooks/useFileProcessor';
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
  updateCandidateStatus,
  updateCandidateHrStatus,
  saveCandidateAnalysis,
  deleteCandidate,
  deleteCandidateFile,
  type RecruitmentCampaign,
  type CandidateCV,
  type CampaignStatus,
  type HrStatus,
} from '../../services/recruiterService';
import type { RecruiterContextValue } from './types';

const RecruiterContext = createContext<RecruiterContextValue | undefined>(undefined);

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

  const loadCandidates = useCallback(async (campaignId: string) => {
    setCandidatesLoading(true);
    try {
      const data = await getCampaignCandidates(campaignId);
      setCandidates(data);
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
        const { filePath, fileName } = await uploadCandidateFile({
          userId: user.id,
          campaignId,
          file,
        });

        // Create candidate record
        const candidateName = file.name.replace(/\.[^.]+$/, '');
        const candidate = await createCandidate({
          campaignId,
          candidateName,
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

  const handleAnalyzeCampaign = useCallback(
    async (campaignId: string) => {
      if (!user?.id) return;
      if (!activeCampaign) return;

      const jdContent = activeCampaign.jdContent;
      if (!jdContent.trim()) return;

      // Get all pending candidates
      const pendingCandidates = candidates.filter(
        (c) => c.status === 'pending' || c.status === 'error',
      );

      if (pendingCandidates.length === 0) return;

      // Check quota
      try {
        const quota = await checkAnalyticsQuota(user.id, pendingCandidates.length);
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

      setIsAnalyzing(true);

      try {
        for (let i = 0; i < pendingCandidates.length; i++) {
          const candidate = pendingCandidates[i];

          // Mark as analyzing
          await updateCandidateStatus(candidate.id, 'analyzing');
          setCandidates((prev) =>
            prev.map((c) =>
              c.id === candidate.id
                ? { ...c, status: 'analyzing' as const }
                : c,
            ),
          );

          try {
            // Get file content from storage URL
            const { data: publicUrl } = supabase.storage
              .from('cv-files')
              .getPublicUrl(candidate.filePath);

            // Download file and process
            const response = await fetch(publicUrl.publicUrl);
            const blob = await response.blob();
            const file = new File([blob], candidate.fileName, { type: blob.type });

            const { data: textData, mimeType, pdfInlineData } = await processFileUtil(file);

            // Get session token for authenticated API call
            const { data: { session } } = await supabase.auth.getSession();
            const authToken = session?.access_token;

            const analysis = await analyzeCV(
              jdContent,
              textData,
              mimeType,
              candidate.fileName,
              reportLanguage,
              undefined,
              authToken,
              pdfInlineData,
            );

            // Save result via backend API (service_role RPC)
            await saveCandidateAnalysis(
              candidate.id,
              analysis as unknown as Record<string, unknown>,
              analysis.matchScore,
              'done',
            );

            trackEvent('recruiter_analysis_done', {
              candidate_id: candidate.id,
              match_score: analysis.matchScore,
            });

            // Update local state
            setCandidates((prev) =>
              prev.map((c) =>
                c.id === candidate.id
                  ? {
                      ...c,
                      status: 'done' as const,
                      matchScore: analysis.matchScore,
                      analysisResult: analysis as unknown as Record<string, unknown>,
                      parsedText: textData,
                      analyzedAt: new Date().toISOString(),
                    }
                  : c,
              ),
            );
          } catch (err) {
            console.error(`Analysis failed for candidate ${candidate.id}:`, err);
            const errorMsg = err instanceof Error ? err.message : 'Unknown error';

            await updateCandidateStatus(candidate.id, 'error', errorMsg);

            setCandidates((prev) =>
              prev.map((c) =>
                c.id === candidate.id
                  ? {
                      ...c,
                      status: 'error' as const,
                      errorMessage: errorMsg,
                    }
                  : c,
              ),
            );
          }
        }
      } finally {
        setIsAnalyzing(false);
        void refreshUserProfile();
        void loadCampaigns();
      }
    },
    [user?.id, activeCampaign, candidates, reportLanguage, t, refreshUserProfile, loadCampaigns],
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
      // Remove file from storage
      deleteCandidateFile(filePath).catch((err) =>
        console.error('Failed to delete candidate file:', err),
      );
      // Remove from database
      await deleteCandidate(candidateId);
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
            mainFactor?: string;
          };
          const r = c.analysisResult as ExportData | null;
          const catScores = r?.categoryScores;
          const strengths = Array.isArray(r?.matchingPoints)
            ? r.matchingPoints.map((p) => (typeof p === 'string' ? p : p.content)).join('; ')
            : '';
          const weaknesses = Array.isArray(r?.missingGaps)
            ? r.missingGaps.map((g) => (typeof g === 'string' ? g : g.content)).join('; ')
            : '';
          return {
            STT: idx + 1,
            'Tên ứng viên': c.candidateName,
            'Điểm khớp': c.matchScore ?? '',
            'Kỹ năng': catScores?.skills ?? '',
            'Kinh nghiệm': catScores?.experience ?? '',
            'Công cụ': catScores?.tools ?? '',
            'Học vấn': catScores?.education ?? '',
            'Xác suất': r?.successProbability || r?.passProbability || '',
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
              ? new Date(c.analyzedAt).toLocaleString('vi-VN')
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