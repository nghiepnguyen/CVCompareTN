import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Briefcase, Plus, ArrowLeft, Sparkles } from 'lucide-react';
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

export function RecruiterView() {
  const { effectivePlan, userProfile } = useAuth();
  const { t } = useUI();
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

  const isRecruiter = isRecruiterPlan(effectivePlan);

  if (!isRecruiter) {
    return (
      <UpgradePrompt feature={t.recruiterUpgradeFeature} />
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
        savedJds={savedJDs.map((jd: any) => ({
          id: jd.id,
          title: jd.title,
          content: jd.content,
        }))}
      />
    </div>
  );
}