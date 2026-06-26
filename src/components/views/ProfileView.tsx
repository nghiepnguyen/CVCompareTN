import React, { useEffect, useState } from 'react';
import { User, ArrowLeft, Mail, Shield, Calendar, BarChart3, Loader2, Briefcase, FileSpreadsheet, FileText, StickyNote } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { useRecruiter } from '../../context/recruiter';
import { checkAnalyticsQuota, type AnalyticsQuota } from '../../services/analyticsQuotaService';
import { formatPlanExpiryDate, isProPlan, isRecruiterPlan, MAX_CAMPAIGNS, MAX_CAMPAIGN_CVS } from '../../lib/planLimits';
import { formatLabel } from '../../translations';

export function ProfileView() {
  const { user, userProfile, effectivePlan } = useAuth();
  const { setActiveTab, t, reportLanguage } = useUI();
  const { campaigns } = useRecruiter();

  const [quota, setQuota] = useState<AnalyticsQuota | null>(null);
  const [isLoadingQuota, setIsLoadingQuota] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    setIsLoadingQuota(true);
    checkAnalyticsQuota(user.id, 0)
      .then((q) => {
        if (!cancelled) setQuota(q);
      })
      .catch((err) => {
        console.error('Profile quota fetch failed:', err);
        if (!cancelled) setQuota(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingQuota(false);
      });
    return () => { cancelled = true; };
  }, [user?.id]);

  const displayName = user?.user_metadata?.full_name || userProfile?.displayName || '';
  const email = user?.email || '';
  const isPro = isProPlan(effectivePlan);
  const isRecruiter = isRecruiterPlan(effectivePlan);
  const expiryDate = userProfile?.planExpiresAt
    ? formatPlanExpiryDate(userProfile.planExpiresAt, 'vi')
    : null;

  const analyticsText = quota == null
    ? '—'
    : quota.limit == null
      ? `${quota.used} / ${t.profileAnalyticsUnlimited}`
      : `${quota.used} / ${quota.limit}`;

  const analyticsResetText = (() => {
    if (!quota?.month || quota.limit == null) return null;
    const [y, m, d] = quota.month.split('-').map(Number);
    if (!y || !m || !d) {
      // Fallback: old YYYY-MM format — show next month day 1
      if (!y || !m) return null;
      const nextY = m === 12 ? y + 1 : y;
      const nextM = m === 12 ? 1 : m + 1;
      const nextDate = new Date(nextY, nextM - 1, quota.resetDay ?? 1);
      const date = reportLanguage === 'vi'
        ? nextDate.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
        : nextDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      return formatLabel(t.profileAnalyticsResetOn, { date });
    }
    // YYYY-MM-DD format: add one month from cycle start, clamp to resetDay
    const nextDate = new Date(y, m - 1 + 1, Math.min(quota.resetDay, new Date(y, m - 1 + 1, 0).getDate()));
    const date = reportLanguage === 'vi'
      ? nextDate.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : nextDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return formatLabel(t.profileAnalyticsResetOn, { date });
  })();

  const campaignLimit = MAX_CAMPAIGNS.recruiter;
  const campaignUsed = campaigns.length;
  const campaignText = formatLabel(t.profileRecruiterCampaignsLimit, {
    used: String(campaignUsed),
    limit: String(campaignLimit),
  });

  const batchCvMax = MAX_CAMPAIGN_CVS.recruiter;
  const batchText = formatLabel(t.profileRecruiterBatchValue, { max: String(batchCvMax) });

  const planLabel = isRecruiter
    ? t.profilePlanRecruiter
    : isPro
      ? t.profilePlanPro
      : t.profilePlanFree;

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center py-12 px-4">
      <div className="w-full max-w-lg">
        {/* Back button */}
        <button
          onClick={() => { setActiveTab('analyze'); }}
          className="flex items-center gap-2 text-text-muted hover:text-text-main transition-colors mb-8 cursor-pointer hover:scale-105 active:scale-95"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm font-bold">{t.profileBack}</span>
        </button>

        {/* Card */}
        <div className="bg-surface border border-border rounded-3xl p-8 shadow-2xl">
          {/* Avatar & Name */}
          <div className="flex flex-col items-center mb-8">
            {(userProfile?.photoURL || user?.user_metadata?.avatar_url) ? (
              <img
                src={userProfile?.photoURL || user?.user_metadata?.avatar_url || ''}
                alt={displayName}
                className="w-20 h-20 rounded-full border-2 dark:border-white/[0.1] border-border mb-4"
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-accent/10 flex items-center justify-center mb-4 border-2 dark:border-white/[0.1] border-border">
                <User className="w-10 h-10 text-accent" />
              </div>
            )}
            <h2 className="text-xl font-extrabold text-text-main tracking-tight">
              {displayName || email}
            </h2>
            {isRecruiter && (
              <span className="mt-2 text-[10px] font-black px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {t.planBadgeRecruiter}
              </span>
            )}
            {isPro && (
              <span className="mt-2 text-[10px] font-black px-2 py-0.5 rounded bg-accent/10 text-accent border border-accent/20">
                {t.planBadgePro}
              </span>
            )}
          </div>

          {/* Divider */}
          <div className="border-t dark:border-white/[0.06] border-border my-6" />

          {/* Info rows */}
          <div className="space-y-5">
            {/* Name */}
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl dark:bg-white/[0.03] bg-surface-secondary flex items-center justify-center shrink-0">
                <User className="w-5 h-5 text-text-muted" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold text-text-light uppercase tracking-wider mb-0.5">
                  {t.profileNameLabel}
                </p>
                <p className="text-sm font-bold text-text-main truncate">
                  {displayName || '—'}
                </p>
              </div>
            </div>

            {/* Email */}
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl dark:bg-white/[0.03] bg-surface-secondary flex items-center justify-center shrink-0">
                <Mail className="w-5 h-5 text-text-muted" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold text-text-light uppercase tracking-wider mb-0.5">
                  {t.profileEmailLabel}
                </p>
                <p className="text-sm font-bold text-text-main truncate">
                  {email || '—'}
                </p>
              </div>
            </div>

            {/* Plan */}
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl dark:bg-white/[0.03] bg-surface-secondary flex items-center justify-center shrink-0">
                <Shield className="w-5 h-5 text-text-muted" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold text-text-light uppercase tracking-wider mb-0.5">
                  {t.profilePlanLabel}
                </p>
                <p className="text-sm font-bold text-text-main">
                  {planLabel}
                </p>
              </div>
            </div>

            {/* Expiry */}
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl dark:bg-white/[0.03] bg-surface-secondary flex items-center justify-center shrink-0">
                <Calendar className="w-5 h-5 text-text-muted" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold text-text-light uppercase tracking-wider mb-0.5">
                  {t.profileExpiryLabel}
                </p>
                <p className="text-sm font-bold text-text-main">
                  {expiryDate || t.profileExpiryNone}
                </p>
              </div>
            </div>

            {/* Analytics quota */}
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl dark:bg-white/[0.03] bg-surface-secondary flex items-center justify-center shrink-0">
                <BarChart3 className="w-5 h-5 text-text-muted" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold text-text-light uppercase tracking-wider mb-0.5">
                  {t.profileAnalyticsLabel}
                </p>
                {isLoadingQuota ? (
                  <Loader2 className="w-4 h-4 animate-spin text-accent" />
                ) : (
                  <>
                    <p className="text-sm font-bold text-text-main tabular-nums">
                      {analyticsText}
                    </p>
                    {analyticsResetText && (
                      <p className="text-[11px] text-text-muted mt-0.5">
                        {analyticsResetText}
                      </p>
                    )}
                    {quota != null && quota.limit != null && quota.used >= quota.limit && (
                      <button
                        type="button"
                        onClick={() => setActiveTab('upgrade')}
                        className="mt-1.5 text-[11px] font-bold text-accent underline cursor-pointer hover:opacity-80"
                      >
                        {(isPro || isRecruiter) ? t.quotaExhaustedBuyMore : t.quotaExhaustedUpgradePro}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Recruiter-specific info section */}
          {isRecruiter && (
            <>
              <div className="border-t border-white/[0.06] my-6" />
              <div className="mb-4">
                <p className="text-[11px] font-bold text-text-light uppercase tracking-wider mb-0.5">
                  {t.profileRecruiterLabel}
                </p>
              </div>
              <div className="space-y-4">
                {/* Campaigns */}
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/[0.06] flex items-center justify-center shrink-0">
                    <Briefcase className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold text-text-light uppercase tracking-wider mb-0.5">
                      {t.profileRecruiterCampaigns}
                    </p>
                    <p className="text-sm font-bold text-text-main tabular-nums">
                      {campaignText}
                    </p>
                  </div>
                </div>

                {/* Batch CV */}
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/[0.06] flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold text-text-light uppercase tracking-wider mb-0.5">
                      {t.profileRecruiterBatchLabel}
                    </p>
                    <p className="text-sm font-bold text-text-main">
                      {batchText}
                    </p>
                  </div>
                </div>

                {/* Export */}
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/[0.06] flex items-center justify-center shrink-0">
                    <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold text-text-light uppercase tracking-wider mb-0.5">
                      {t.profileRecruiterExportLabel}
                    </p>
                    <p className="text-sm font-bold text-emerald-400">
                      {t.profileRecruiterExportYes}
                    </p>
                  </div>
                </div>

                {/* Internal notes */}
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/[0.06] flex items-center justify-center shrink-0">
                    <StickyNote className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold text-text-light uppercase tracking-wider mb-0.5">
                      {t.profileRecruiterNoteLabel}
                    </p>
                    <p className="text-sm font-bold text-emerald-400">
                      {t.profileRecruiterExportYes}
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
