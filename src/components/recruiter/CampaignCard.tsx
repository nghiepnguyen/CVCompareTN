import React from 'react';
import { motion } from 'motion/react';
import { ChevronRight, Users, CheckCircle2, Star, MoreHorizontal } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { RecruitmentCampaign } from '../../context/recruiter';

interface CampaignCardProps {
  campaign: RecruitmentCampaign;
  onClick: () => void;
  onChangeStatus: (id: string, status: 'active' | 'closed' | 'archived') => void;
  onDelete: (id: string) => void;
}

const STATUS_CONFIG = {
  active: {
    label: 'Đang mở',
    color: 'text-success bg-success/10 border-success/20',
    dot: 'bg-success',
  },
  closed: {
    label: 'Đã đóng',
    color: 'text-text-muted bg-surface-secondary/60 border-border',
    dot: 'bg-text-muted',
  },
  archived: {
    label: 'Đã lưu trữ',
    color: 'text-text-muted bg-surface-secondary/40 border-border',
    dot: 'bg-text-muted',
  },
} as const;

export function CampaignCard({ campaign, onClick, onChangeStatus, onDelete }: CampaignCardProps) {
  const config = STATUS_CONFIG[campaign.status];
  const [menuOpen, setMenuOpen] = React.useState(false);

  const donePercent =
    campaign.candidateCount > 0
      ? Math.round((campaign.analyzedCount / campaign.candidateCount) * 100)
      : 0;

  return (
    <motion.div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
      className="w-full text-left bg-surface border border-border rounded-2xl p-5 cursor-pointer hover:scale-[1.01] active:scale-[0.99] transition-all duration-200"
      layout
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border', config.color)}>
              <span className={cn('w-1.5 h-1.5 rounded-full', config.dot)} />
              {config.label}
            </span>
            {campaign.shortlistedCount > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-amber-600 bg-amber-400/10 border border-amber-400/20">
                <Star className="w-3 h-3 fill-amber-500" />
                {campaign.shortlistedCount}
              </span>
            )}
          </div>
          <h3 className="text-base font-bold text-text-main truncate">{campaign.title}</h3>
          {campaign.jdTitle && (
            <p className="text-xs text-text-muted mt-0.5 truncate">{campaign.jdTitle}</p>
          )}
        </div>

        <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-main hover:bg-surface-secondary cursor-pointer transition-colors"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-8 z-20 w-36 bg-surface-secondary border border-border rounded-xl p-1 shadow-lg">
                {campaign.status === 'active' && (
                  <button
                    type="button"
                    onClick={() => {
                      onChangeStatus(campaign.id, 'closed');
                      setMenuOpen(false);
                    }}
                    className="block w-full text-left px-3 py-1.5 rounded-lg text-xs font-medium text-text-main hover:bg-surface cursor-pointer"
                  >
                    Đóng đợt
                  </button>
                )}
                {campaign.status === 'closed' && (
                  <button
                    type="button"
                    onClick={() => {
                      onChangeStatus(campaign.id, 'active');
                      setMenuOpen(false);
                    }}
                    className="block w-full text-left px-3 py-1.5 rounded-lg text-xs font-medium text-text-main hover:bg-surface cursor-pointer"
                  >
                    Mở lại
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    onDelete(campaign.id);
                    setMenuOpen(false);
                  }}
                  className="block w-full text-left px-3 py-1.5 rounded-lg text-xs font-medium text-error hover:bg-surface cursor-pointer"
                >
                  Xoá
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 mt-4 pt-3 border-t border-border">
        <div className="flex items-center gap-1.5 text-xs text-text-muted">
          <Users className="w-3.5 h-3.5" />
          <span className="font-semibold">{campaign.candidateCount}</span> CV
        </div>
        <div className="flex items-center gap-1.5 text-xs text-text-muted">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span className="font-semibold">{campaign.analyzedCount}</span> đã PT
        </div>
        <div className="flex-1" />
        <div className="text-[10px] text-text-muted tabular-nums">
          {new Date(campaign.createdAt).toLocaleDateString('vi-VN')}
        </div>
        <ChevronRight className="w-4 h-4 text-text-muted" />
      </div>

      {/* Progress bar */}
      {campaign.candidateCount > 0 && (
        <div className="mt-3 h-1.5 bg-surface-secondary rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-accent rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${donePercent}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>
      )}
    </motion.div>
  );
}