import React, { useRef, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft,
  Upload,
  Play,
  Download,
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
  MoreHorizontal,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  FileSearch,
} from 'lucide-react';
import { useRecruiter } from '../../context/recruiter';
import { useUI } from '../../context/UIContext';
import { CandidateTable } from '../recruiter/CandidateTable';
import { CandidatePanel } from '../recruiter/CandidatePanel';
import type { CandidateCV, HrStatus } from '../../context/recruiter';
import { cn } from '../../lib/utils';

interface CampaignDetailViewProps {
  campaignId: string;
  onBack: () => void;
}

export function CampaignDetailView({ campaignId, onBack }: CampaignDetailViewProps) {
  const {
    campaigns,
    activeCampaign,
    candidates,
    selectedCandidate,
    isAnalyzing,
    candidatesLoading,
    setActiveCampaign,
    selectCandidate,
    loadCandidates,
    uploadCandidateCVs,
    analyzeCampaign,
    updateHrStatus,
    deleteCandidateCV,
    exportToExcel,
  } = useRecruiter();

  const { t } = useUI();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAnalyzedOnly, setShowAnalyzedOnly] = useState(false);
  const [showInlineJd, setShowInlineJd] = useState(false);

  // Find campaign from the list
  const campaign = useMemo(
    () => campaigns.find((c) => c.id === campaignId),
    [campaigns, campaignId],
  );

  // Set as active if not already
  React.useEffect(() => {
    if (campaign && activeCampaign?.id !== campaignId) {
      setActiveCampaign(campaign);
    } else if (!campaign) {
      void loadCandidates(campaignId);
    }
  }, [campaign, activeCampaign, campaignId, setActiveCampaign, loadCandidates]);

  if (!campaign) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-text-muted mx-auto mb-4" />
        <p className="text-sm text-text-muted">Đang tải...</p>
      </div>
    );
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setError(null);
    setUploading(true);

    try {
      const fileArray = Array.from(files);
      await uploadCandidateCVs(campaignId, fileArray);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload thất bại');
    } finally {
      setUploading(false);
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleAnalyzeAll = async () => {
    setError(null);
    try {
      await analyzeCampaign(campaignId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Phân tích thất bại');
    }
  };

  const handleUpdateHrStatus = async (candidateId: string, status: HrStatus, note?: string) => {
    try {
      await updateHrStatus(candidateId, status, note);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cập nhật thất bại');
    }
  };

  const handleExport = async () => {
    setError(null);
    try {
      await exportToExcel(campaignId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xuất Excel thất bại');
    }
  };

  const pendingCount = candidates.filter(
    (c) => c.status === 'pending' || c.status === 'error',
  ).length;

  const displayedCandidates = showAnalyzedOnly
    ? candidates.filter((c) => c.status === 'done')
    : candidates;

  return (
    <div className="max-w-6xl mx-auto px-4 py-4 sm:py-6 space-y-3">
      {/* Inline JD Toggle */}
      {campaign.jdContent && (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={() => setShowInlineJd(!showInlineJd)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-bold text-text-muted hover:text-text-main cursor-pointer transition-colors"
          >
            <span className="flex items-center gap-2">
              <FileSearch className="w-3.5 h-3.5 text-accent" />
              Mô tả công việc (JD)
            </span>
            {showInlineJd ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
          <AnimatePresence>
            {showInlineJd && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="px-4 pb-3 text-[11px] text-text-muted leading-relaxed max-h-36 overflow-y-auto whitespace-pre-wrap border-t border-border pt-3">
                  {campaign.jdContent}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Sticky Header */}
      <div className="sticky top-0 z-30 -mx-4 px-4 py-3 bg-surface/90 backdrop-blur-xl border-b border-border">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={onBack}
              className="p-1.5 rounded-lg text-text-muted hover:text-text-main cursor-pointer hover:scale-105 active:scale-95 transition-all shrink-0"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-base font-black text-text-main truncate">
                {campaign.title}
              </h1>
              <div className="flex items-center gap-3 text-[10px] text-text-muted mt-0.5">
                <span>
                  {campaign.candidateCount} CV · {campaign.analyzedCount} đã phân tích
                </span>
                {campaign.shortlistedCount > 0 && (
                  <span className="text-amber-600 font-bold">
                    · {campaign.shortlistedCount} shortlist
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Toggle analyzed only */}
            <button
              type="button"
              onClick={() => setShowAnalyzedOnly(!showAnalyzedOnly)}
              className={cn(
                'p-2 rounded-lg text-xs font-bold cursor-pointer transition-all hover:scale-105 active:scale-95 hidden sm:inline-flex items-center gap-1.5',
                showAnalyzedOnly
                  ? 'bg-accent/10 text-accent border border-accent/20'
                  : 'text-text-muted border border-border',
              )}
            >
              {showAnalyzedOnly ? (
                <Eye className="w-3.5 h-3.5" />
              ) : (
                <EyeOff className="w-3.5 h-3.5" />
              )}
              <span className="hidden md:inline">Đã PT</span>
            </button>

            {/* Upload CV */}
            <label
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer hover:scale-105 active:scale-95 transition-all',
                uploading
                  ? 'bg-accent/10 text-accent border border-accent/20'
                  : 'bg-surface-secondary border border-border text-text-main',
              )}
            >
              {uploading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Upload className="w-3.5 h-3.5" />
              )}
              <span className="hidden sm:inline">
                {uploading ? 'Đang tải...' : 'Upload CV'}
              </span>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.txt,.jpg,.png,.webp"
                onChange={handleFileUpload}
                disabled={uploading}
                className="hidden"
              />
            </label>

            {/* Analyze All */}
            {pendingCount > 0 && (
              <button
                type="button"
                disabled={isAnalyzing}
                onClick={handleAnalyzeAll}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-accent text-white cursor-pointer hover:scale-105 active:scale-95 transition-all',
                  isAnalyzing && 'opacity-50 cursor-not-allowed',
                )}
              >
                {isAnalyzing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
                <span className="hidden sm:inline">
                  {isAnalyzing ? 'Đang PT...' : `PT ${pendingCount} CV`}
                </span>
              </button>
            )}

            {/* Export Excel */}
            <button
              type="button"
              onClick={handleExport}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-success/10 border border-success/20 text-success cursor-pointer hover:scale-105 active:scale-95 transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Excel</span>
            </button>
          </div>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <motion.div
          className="flex items-center gap-2 p-3 bg-error/10 border border-error/20 rounded-xl"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <AlertCircle className="w-4 h-4 text-error shrink-0" />
          <p className="text-xs font-bold text-error flex-1">{error}</p>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-error hover:text-error/80 cursor-pointer text-xs font-bold"
          >
            Đóng
          </button>
        </motion.div>
      )}

      {/* Main Content */}
      <div className="flex gap-0">
        {/* Table section */}
        <div className="flex-1 min-w-0 bg-surface border border-border rounded-2xl overflow-hidden">
          {candidatesLoading ? (
            <div className="p-10 text-center">
              <Loader2 className="w-6 h-6 animate-spin text-text-muted mx-auto mb-2" />
              <p className="text-xs text-text-muted">Đang tải danh sách ứng viên...</p>
            </div>
          ) : (
            <CandidateTable
              candidates={displayedCandidates}
              onSelect={selectCandidate}
              selectedId={selectedCandidate?.id}
              isAnalyzing={isAnalyzing}
              onDelete={(candidate) => {
                if (window.confirm(`Xoá CV của "${candidate.candidateName || candidate.fileName}"? Hành động này không thể hoàn tác.`)) {
                  deleteCandidateCV(candidate.id, candidate.filePath);
                }
              }}
            />
          )}
        </div>

        {/* Candidate Panel (Desktop) */}
        <CandidatePanel
          candidate={selectedCandidate}
          jdContent={campaign.jdContent}
          onClose={() => selectCandidate(null)}
          onUpdateHrStatus={handleUpdateHrStatus}
        />
      </div>
    </div>
  );
}