import React from 'react';
import { motion } from 'motion/react';
import { Star, TrendingUp, TrendingDown, Minus, Loader2, AlertCircle, Trash2, Clock } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { CandidateCV } from '../../context/recruiter';

interface CandidateTableProps {
  candidates: CandidateCV[];
  onSelect: (candidate: CandidateCV) => void;
  onDelete?: (candidate: CandidateCV) => void;
  selectedId?: string | null;
  isAnalyzing?: boolean;
}

const HR_STATUS_ICONS: Record<string, React.ReactNode> = {
  shortlisted: <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />,
  hired: <TrendingUp className="w-3.5 h-3.5 text-success" />,
  rejected: <TrendingDown className="w-3.5 h-3.5 text-error" />,
};

const HR_STATUS_LABELS: Record<string, string> = {
  new: 'Mới',
  shortlisted: 'Shortlist',
  interviewing: 'Phỏng vấn',
  rejected: 'Loại',
  hired: 'Đã tuyển',
};

function getScoreClass(score: number | null): string {
  if (score == null) return 'text-text-muted';
  if (score >= 80) return 'text-success';
  if (score >= 60) return 'text-amber-500';
  return 'text-error';
}

export function CandidateTable({
  candidates,
  onSelect,
  onDelete,
  selectedId,
  isAnalyzing,
}: CandidateTableProps) {
  if (candidates.length === 0) {
    return (
      <div className="text-center py-16 px-4">
        <div className="inline-flex items-center justify-center size-14 rounded-2xl bg-surface-secondary border border-border mb-4">
          <Minus className="w-6 h-6 text-text-muted" />
        </div>
        <p className="text-sm font-bold text-text-main mb-1">Chưa có ứng viên</p>
        <p className="text-xs text-text-muted">
          Tải lên CV để bắt đầu phân tích và xếp hạng.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-3 px-3 text-[10px] font-extrabold uppercase tracking-wider text-text-muted w-10">
              #
            </th>
            <th className="text-left py-3 px-3 text-[10px] font-extrabold uppercase tracking-wider text-text-muted">
              Ứng viên
            </th>
            <th className="text-right py-3 px-3 text-[10px] font-extrabold uppercase tracking-wider text-text-muted w-20">
              Điểm
            </th>
            <th className="text-center py-3 px-3 text-[10px] font-extrabold uppercase tracking-wider text-text-muted w-28 hidden sm:table-cell">
              Trạng thái
            </th>
            {onDelete && (
              <th className="text-center py-3 px-3 text-[10px] font-extrabold uppercase tracking-wider text-text-muted w-12" />
            )}
          </tr>
        </thead>
        <tbody>
          {candidates.map((candidate, idx) => {
            const isSelected = candidate.id === selectedId;
            const isProcessing = candidate.status === 'analyzing' || candidate.status === 'pending';

            return (
              <motion.tr
                key={candidate.id}
                onClick={() => onSelect(candidate)}
                className={cn(
                  'border-b border-border cursor-pointer transition-all',
                  isSelected
                    ? 'bg-accent/10 border-l-2 border-l-accent'
                    : 'hover:bg-surface-secondary/50',
                )}
                layout
              >
                <td className="py-3 px-3 text-xs text-text-muted tabular-nums font-bold">
                  {idx + 1}
                </td>
                <td className="py-3 px-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-bold text-text-main truncate">
                      {candidate.candidateName || candidate.fileName}
                    </span>
                    {candidate.status === 'error' && (
                      <AlertCircle className="w-4 h-4 text-error shrink-0" />
                    )}
                  </div>
                  {candidate.fileName !== candidate.candidateName && candidate.fileName && (
                    <p className="text-[10px] text-text-muted truncate">{candidate.fileName}</p>
                  )}
                </td>
                <td className="py-3 px-3 text-right">
                  {candidate.status === 'analyzing' ? (
                    <div className="flex items-center justify-end gap-1">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
                      <span className="text-[10px] font-bold text-accent">Đang PT</span>
                    </div>
                  ) : candidate.status === 'pending' ? (
                    <div className="flex items-center justify-end gap-1">
                      <Clock className="w-3.5 h-3.5 text-text-muted" />
                      <span className="text-[10px] font-bold text-text-muted">Chờ PT</span>
                    </div>
                  ) : candidate.status === 'error' ? (
                    <div className="flex items-center justify-end gap-1">
                      <AlertCircle className="w-3.5 h-3.5 text-error" />
                      <span className="text-[10px] font-bold text-error">Lỗi</span>
                    </div>
                  ) : (
                    <span
                      className={cn(
                        'text-sm font-extrabold tabular-nums',
                        getScoreClass(candidate.matchScore),
                      )}
                    >
                      {candidate.matchScore != null ? candidate.matchScore : '—'}
                    </span>
                  )}
                </td>
                <td className="py-3 px-3 text-center hidden sm:table-cell">
                  <div className="flex items-center justify-center gap-1">
                    {HR_STATUS_ICONS[candidate.hrStatus]}
                    <span
                      className={cn(
                        'text-[11px] font-semibold',
                        candidate.hrStatus === 'new'
                          ? 'text-text-muted'
                          : candidate.hrStatus === 'shortlisted'
                            ? 'text-amber-600'
                            : candidate.hrStatus === 'interviewing'
                              ? 'text-accent'
                              : candidate.hrStatus === 'rejected'
                                ? 'text-error'
                                : candidate.hrStatus === 'hired'
                                  ? 'text-success'
                                  : 'text-text-muted',
                      )}
                    >
                      {HR_STATUS_LABELS[candidate.hrStatus] || candidate.hrStatus}
                    </span>
                  </div>
                </td>
                {onDelete && (
                  <td className="py-3 px-2 text-center">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(candidate);
                      }}
                      className="p-1.5 rounded-lg text-text-muted hover:text-error hover:bg-error/10 cursor-pointer transition-colors"
                      title="Xoá CV"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                )}
              </motion.tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}