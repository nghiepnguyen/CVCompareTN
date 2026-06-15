import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Briefcase, Plus, ArrowLeft, Sparkles, Check, ArrowRight, FileSpreadsheet, StickyNote, Users } from 'lucide-react';
import { useRecruiter } from '../../context/recruiter';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { isRecruiterPlan } from '../../lib/planLimits';
import { formatLabel } from '../../translations';
import { UpgradePrompt } from '../shared/UpgradePrompt';
import { CampaignCard } from '../recruiter/CampaignCard';
import { CreateCampaignModal } from '../recruiter/CreateCampaignModal';
import { CampaignDetailView } from './CampaignDetailView';
import { useSavedJds } from '../../context/analysis/SavedJdContext';
import { createRecruiterCheckout } from '../../services/paymentService';
import { cn } from '../../lib/utils';

export function RecruiterView() {
  const { effectivePlan, user } = useAuth();
  const { t, setActiveTab } = useUI();
  const {
    campaigns,
    campaignLoading,
    loadCampaigns,
    createCampaign,
    updateCampaignStatus,
    deleteCampaign,
  } = useRecruiter();

  // Reuse SavedJdContext for the modal
  const { savedJDs } = useSavedJds();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  const isRecruiter = isRecruiterPlan(effectivePlan);

  const handleUpgrade = async () => {
    if (!user) return;
    setIsCheckingOut(true);
    try {
      const { checkoutUrl } = await createRecruiterCheckout();
      window.location.href = checkoutUrl;
    } catch {
      setIsCheckingOut(false);
    }
  };

  const BENEFITS = [
    { icon: Briefcase, text: t.recruiterUpgradeBenefitCampaigns || 'Tạo tối đa 10 đợt tuyển dụng / tháng' },
    { icon: Users, text: t.recruiterUpgradeBenefitBatch || 'Upload và phân tích 50 CV mỗi đợt' },
    { icon: FileSpreadsheet, text: t.recruiterUpgradeBenefitExcel || 'Xuất báo cáo Excel chi tiết' },
    { icon: StickyNote, text: t.recruiterUpgradeBenefitNotes || 'Ghi chú nội bộ & quản lý trạng thái ứng viên' },
  ];

  if (!isRecruiter) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 sm:py-20">
        <div className="rounded-2xl border-2 dark:border-purple-500/30 border-purple-300 dark:bg-purple-500/[0.03] bg-purple-50/70 backdrop-blur-md overflow-hidden">
          {/* Header */}
          <div className="p-6 sm:p-8 text-center dark:bg-purple-500/10 bg-purple-100 border-b dark:border-purple-500/20 border-purple-200">
            <div className="inline-flex items-center justify-center size-14 rounded-2xl dark:bg-purple-500/20 bg-purple-200 border dark:border-purple-500/30 border-purple-300 mb-4">
              <Briefcase className="size-7 dark:text-purple-400 text-purple-700" />
            </div>
            <h1 className="text-xl sm:text-2xl font-black dark:text-purple-400 text-purple-700 mb-2">
              {t.recruiterUpgradeFeature}
            </h1>
            <p className="text-sm text-text-muted max-w-md mx-auto leading-relaxed">
              {t.recruiterUpgradeDesc || 'Nâng cấp lên gói Recruiter để mở khóa bộ công cụ tuyển dụng chuyên nghiệp với AI.'}
            </p>
          </div>

          {/* Price */}
          <div className="px-6 sm:px-8 py-5 text-center border-b dark:border-purple-500/10 border-purple-200">
            <p className="text-3xl font-black dark:text-purple-400 text-purple-700">399.000đ</p>
            <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mt-0.5">/ tháng</p>
          </div>

          {/* Benefits */}
          <div className="p-6 sm:p-8 space-y-4">
            {BENEFITS.map((benefit, idx) => (
              <div key={idx} className="flex items-start gap-3">
                <div className="size-8 rounded-lg dark:bg-purple-500/10 bg-purple-100 border dark:border-purple-500/20 border-purple-300 flex items-center justify-center shrink-0 mt-0.5">
                  <benefit.icon className="size-4 dark:text-purple-400 text-purple-700" />
                </div>
                <span className="text-sm font-medium text-text-main pt-1">{benefit.text}</span>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div className="p-6 sm:p-8 pt-0 flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              disabled={isCheckingOut}
              onClick={handleUpgrade}
              className="flex-1 inline-flex items-center justify-center gap-2 h-12 rounded-xl font-bold text-sm dark:bg-purple-500 bg-purple-700 text-white cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {isCheckingOut ? (
                <div className="size-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  {t.pricingCtaRecruiter || 'Nâng cấp Recruiter'}
                  <ArrowRight className="size-4" />
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('upgrade')}
              className="flex-1 h-12 rounded-xl font-bold text-sm border dark:border-purple-500/30 border-purple-300 dark:text-purple-400 text-purple-700 cursor-pointer dark:hover:bg-purple-500/10 hover:bg-purple-100 hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              {t.recruiterUpgradeSeeComparison}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (selectedCampaignId) {
    return (
      <CampaignDetailView
        campaignId={selectedCampaignId}
        onBack={() => setSelectedCampaignId(null)}
      />
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 sm:py-10 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <motion.div
            className="inline-flex items-center justify-center size-10 rounded-xl bg-accent/10 border border-accent/30"
            layout
          >
            <Briefcase className="w-5 h-5 text-accent" />
          </motion.div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-text-main">
              {t.recruiterViewTitle}
            </h1>
            <p className="text-xs text-text-muted mt-0.5">
              {formatLabel(t.recruiterViewCount, { count: String(campaigns.length) })}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-accent text-white text-sm font-black uppercase tracking-wider cursor-pointer hover:scale-105 active:scale-95 transition-all"
        >
          <Plus className="w-4 h-4" />
          {t.recruiterCreateBtn}
        </button>
      </div>

      {/* Campaign List */}
      {campaignLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-surface border border-border rounded-2xl p-5 animate-pulse"
            >
              <div className="h-5 bg-surface-secondary rounded w-3/4 mb-3" />
              <div className="h-3 bg-surface-secondary rounded w-1/2" />
              <div className="h-3 bg-surface-secondary rounded w-full mt-4" />
            </div>
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <div className="text-center py-20 px-4">
          <div className="inline-flex items-center justify-center size-16 rounded-2xl bg-surface-secondary border border-border mb-4">
            <Briefcase className="w-7 h-7 text-text-muted" />
          </div>
          <h2 className="text-base font-black text-text-main mb-2">{t.recruiterEmptyTitle}</h2>
          <p className="text-xs text-text-muted max-w-sm mx-auto mb-6">
            {t.recruiterEmptyDesc}
          </p>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-white text-sm font-black uppercase tracking-wider cursor-pointer hover:scale-105 active:scale-95 transition-all"
          >
            <Sparkles className="w-4 h-4" />
            {t.recruiterCreateFirst}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Active campaigns first */}
          {campaigns
            .filter((c) => c.status === 'active')
            .map((campaign) => (
              <CampaignCard
                key={campaign.id}
                campaign={campaign}
                onClick={() => setSelectedCampaignId(campaign.id)}
                onChangeStatus={updateCampaignStatus}
                onDelete={deleteCampaign}
              />
            ))}
          {/* Closed/archived campaigns after */}
          {campaigns
            .filter((c) => c.status !== 'active')
            .map((campaign) => (
              <CampaignCard
                key={campaign.id}
                campaign={campaign}
                onClick={() => setSelectedCampaignId(campaign.id)}
                onChangeStatus={updateCampaignStatus}
                onDelete={deleteCampaign}
              />
            ))}
        </div>
      )}

      {/* Create Modal */}
      <CreateCampaignModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={async (title, jdTitle, jdContent) => {
          await createCampaign(title, jdTitle, jdContent);
        }}
        savedJds={savedJDs.map((jd) => ({
          id: jd.id,
          title: jd.title,
          content: jd.content,
        }))}
      />
    </div>
  );
}