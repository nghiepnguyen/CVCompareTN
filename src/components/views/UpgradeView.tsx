import React, { useState } from 'react';
import type { UiLabels } from '../../translations/types';
import {
  AlertCircle,
  ArrowRight,
  Briefcase,
  Check,
  ChevronRight,
  Infinity,
  Loader2,
  Minus,
  Sparkles,
  Zap,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { createProCheckout, createRecruiterCheckout } from '../../services/paymentService';
import { cn } from '../../lib/utils';
import { formatPlanExpiryDate, isProPlan, isRecruiterPlan } from '../../lib/planLimits';
import { formatLabel } from '../../translations';

type Plan = 'free' | 'pro' | 'recruiter';

type StringLabelKey = Exclude<keyof UiLabels, 'faqItems'>;

type ComparisonRow = {
  key: string;
  labelKey: StringLabelKey;
  free: { value: string; icon: 'check' | 'dash' | 'infinity' };
  pro: { value: string; icon: 'check' | 'dash' | 'infinity' };
  recruiter: { value: string; icon: 'check' | 'dash' | 'infinity' };
};

function buildRows(t: UiLabels): ComparisonRow[] {
  return [
    { key: 'analyses', labelKey: 'upgradeCompareAnalyses', free: { value: '10', icon: 'dash' }, pro: { value: '100', icon: 'check' }, recruiter: { value: '500', icon: 'check' } },
    { key: 'batch', labelKey: 'upgradeCompareBatch', free: { value: '1', icon: 'dash' }, pro: { value: '5', icon: 'check' }, recruiter: { value: '50', icon: 'check' } },
    { key: 'campaignCvs', labelKey: 'upgradeCompareCampaignCvs', free: { value: '—', icon: 'dash' }, pro: { value: '—', icon: 'dash' }, recruiter: { value: '50 CV', icon: 'check' } },
    { key: 'campaigns', labelKey: 'upgradeCompareCampaigns', free: { value: '—', icon: 'dash' }, pro: { value: '—', icon: 'dash' }, recruiter: { value: t.upgradeRecruiterCampaignsPerMonth, icon: 'check' } },
    { key: 'cv', labelKey: 'upgradeCompareCV', free: { value: '1 CV', icon: 'dash' }, pro: { value: '10 CV', icon: 'check' }, recruiter: { value: '50 CV', icon: 'check' } },
    { key: 'downloadCv', labelKey: 'upgradeCompareDownloadCv', free: { value: '—', icon: 'dash' }, pro: { value: t.upgradeProExport, icon: 'check' }, recruiter: { value: t.upgradeProExport, icon: 'check' } },
    { key: 'jd', labelKey: 'upgradeCompareJd', free: { value: '3', icon: 'dash' }, pro: { value: t.upgradeProJd, icon: 'infinity' }, recruiter: { value: t.upgradeProJd, icon: 'infinity' } },
    { key: 'history', labelKey: 'upgradeCompareHistory', free: { value: t.upgradeFreeHistory, icon: 'dash' }, pro: { value: t.upgradeProHistory, icon: 'check' }, recruiter: { value: t.upgradeProHistory, icon: 'check' } },
    { key: 'export', labelKey: 'upgradeCompareExportExcel', free: { value: '—', icon: 'dash' }, pro: { value: '—', icon: 'dash' }, recruiter: { value: t.upgradeProExport, icon: 'check' } },
    { key: 'hrNotes', labelKey: 'upgradeCompareHrNotes', free: { value: '—', icon: 'dash' }, pro: { value: '—', icon: 'dash' }, recruiter: { value: t.upgradeProExport, icon: 'check' } },
  ];
}

function RowIcon({ type }: { type: 'check' | 'dash' | 'infinity' }) {
  if (type === 'infinity') return <Infinity className="w-4 h-4 text-accent" />;
  if (type === 'check') return <Check className="w-4 h-4 text-success" />;
  return <Minus className="w-4 h-4 text-text-muted/30" />;
}

function PriceTag({ plan, className }: { plan: Plan; className?: string }) {
  if (plan === 'recruiter') {
    return (
      <div className={cn('space-y-0.5', className)}>
        <p className="text-2xl sm:text-3xl font-black text-purple-400">399.000đ</p>
        <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">/ tháng</p>
      </div>
    );
  }
  if (plan === 'pro') {
    return (
      <div className={cn('space-y-0.5', className)}>
        <p className="text-2xl sm:text-3xl font-black text-accent">69.000đ</p>
        <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">/ tháng</p>
      </div>
    );
  }
  return (
    <div className={cn('space-y-0.5', className)}>
      <p className="text-2xl sm:text-3xl font-black text-text-main">0đ</p>
      <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Miễn phí trọn đời</p>
    </div>
  );
}

export function UpgradeView() {
  const { user, effectivePlan, userProfile } = useAuth();
  const { t, setActiveTab, reportLanguage } = useUI();
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [checkoutPlan, setCheckoutPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);

  const alreadyPro = userProfile?.role === 'admin' || isProPlan(effectivePlan);
  const alreadyRecruiter = userProfile?.role === 'admin' || isRecruiterPlan(effectivePlan);
  const planExpiryLabel =
    (alreadyPro || alreadyRecruiter) && userProfile?.planExpiresAt
      ? formatLabel(t.planExpiresUntil, {
          date: formatPlanExpiryDate(userProfile.planExpiresAt, reportLanguage) ?? '',
        })
      : null;

  const handleCheckout = async (plan: 'pro' | 'recruiter') => {
    if (!user) {
      setError(t.login);
      return;
    }
    setError(null);
    setIsCheckingOut(true);
    setCheckoutPlan(plan);
    try {
      const { checkoutUrl } = plan === 'recruiter'
        ? await createRecruiterCheckout()
        : await createProCheckout('pro');
      window.location.href = checkoutUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : t.checkoutError);
      setIsCheckingOut(false);
      setCheckoutPlan(null);
    }
  };

  const currentPlan: Plan = alreadyRecruiter ? 'recruiter' : alreadyPro ? 'pro' : 'free';
  const ROWS = buildRows(t);

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 sm:py-16 space-y-10">
      {/* Hero */}
      <header className="text-center space-y-4">
        <div className="inline-flex items-center justify-center size-14 rounded-2xl bg-accent/10 border border-accent/30">
          <Sparkles className="size-7 text-accent" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-text-main">
          {t.upgradePageTitle}
        </h1>
        <p className="text-text-muted max-w-lg mx-auto leading-relaxed">{t.upgradePageDesc}</p>

        {planExpiryLabel && (
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-400/10 px-4 py-1.5 text-sm font-bold text-amber-600 dark:text-amber-400">
            <Sparkles className="size-3.5" />
            {planExpiryLabel}
          </div>
        )}
        {!alreadyPro && !alreadyRecruiter && (
          <p className="text-xs text-text-muted">{t.planStackingNote}</p>
        )}
      </header>

      {/* Desktop: Comparison Table */}
      <div className="hidden lg:block max-w-5xl mx-auto">
        <div className="overflow-hidden rounded-2xl border border-border bg-surface/40 backdrop-blur-md">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="w-[30%] p-6 text-left">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-text-muted">
                    {t.pricingColFeature}
                  </span>
                </th>
                <th className={cn('w-[23%] p-5 border-b', currentPlan === 'free' && 'bg-success/5')}>
                  <div className="text-center space-y-2">
                    <h3 className="text-base font-black text-text-main uppercase tracking-wider">{t.planFreeLabel}</h3>
                    <PriceTag plan="free" />
                    {currentPlan === 'free' && (
                      <span className="inline-block mt-2 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-success/10 text-success border border-success/20">
                        {t.upgradeBadgeCurrentPlan}
                      </span>
                    )}
                  </div>
                </th>
                <th className={cn('w-[23%] p-5 border-b bg-accent/[0.02]', currentPlan === 'pro' && 'bg-accent/10')}>
                  <div className="text-center space-y-2">
                    <h3 className="text-base font-black text-accent uppercase tracking-wider">{t.planProLabel}</h3>
                    <PriceTag plan="pro" />
                    <span className="inline-block mt-2 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-accent/10 text-accent border border-accent/20">
                      {t.pricingBadgePopular}
                    </span>
                    {currentPlan === 'pro' && (
                      <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-success/10 text-success border border-success/20">
                        {t.upgradeBadgeCurrentPlan}
                      </span>
                    )}
                  </div>
                </th>
                <th className={cn('w-[24%] p-5 border-b bg-purple-500/[0.03]', currentPlan === 'recruiter' && 'bg-purple-500/10')}>
                  <div className="text-center space-y-2">
                    <h3 className="text-base font-black text-purple-400 uppercase tracking-wider">{t.planRecruiterLabel}</h3>
                    <PriceTag plan="recruiter" />
                    <span className="inline-block mt-2 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-500/10 text-purple-400 border border-purple-400/20">
                      {t.pricingBadgeEnterprise}
                    </span>
                    {currentPlan === 'recruiter' && (
                      <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-success/10 text-success border border-success/20">
                        {t.upgradeBadgeCurrentPlan}
                      </span>
                    )}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.key} className="border-b border-border/50 hover:bg-white/[0.01] transition-colors">
                  <td className="py-4 px-6">
                    <span className="text-sm font-semibold text-text-main">{t[row.labelKey]}</span>
                  </td>
                  <td className="py-4 px-5 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <RowIcon type={row.free.icon} />
                      <span className="text-sm text-text-muted tabular-nums">{row.free.value}</span>
                    </div>
                  </td>
                  <td className="py-4 px-5 text-center bg-accent/[0.01]">
                    <div className="flex items-center justify-center gap-2">
                      <RowIcon type={row.pro.icon} />
                      <span className="text-sm text-text-muted tabular-nums">{row.pro.value}</span>
                    </div>
                  </td>
                  <td className="py-4 px-5 text-center bg-purple-500/[0.02]">
                    <div className="flex items-center justify-center gap-2">
                      <RowIcon type={row.recruiter.icon} />
                      <span className="text-sm text-text-muted tabular-nums">{row.recruiter.value}</span>
                    </div>
                  </td>
                </tr>
              ))}
              {/* CTA Row */}
              <tr className="border-t-2 border-border/80">
                <td className="py-5 px-6" />
                <td className="py-5 px-4 text-center">
                  <button
                    type="button"
                    onClick={() => setActiveTab('analyze')}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 font-sans text-xs font-semibold border border-border text-text-muted hover:text-text-main cursor-pointer hover:scale-105 active:scale-95 transition-all"
                  >
                    <Zap className="h-4 w-4" />
                    {t.pricingCtaFree}
                  </button>
                </td>
                <td className="py-5 px-4 text-center bg-accent/[0.01]">
                  {currentPlan === 'pro' || currentPlan === 'recruiter' ? (
                    <button
                      type="button"
                      onClick={() => setActiveTab('analyze')}
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 font-sans text-xs font-bold border border-border text-text-muted cursor-pointer hover:scale-105 active:scale-95 transition-all bg-surface-secondary"
                    >
                      {t.upgradeBadgeCurrentPlan}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={isCheckingOut}
                      onClick={() => handleCheckout('pro')}
                      className="group relative inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 font-sans text-xs font-bold bg-accent text-white cursor-pointer hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
                    >
                      {isCheckingOut && checkoutPlan === 'pro' ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4" />
                          <span>{t.upgradeCta}</span>
                          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                        </>
                      )}
                    </button>
                  )}
                </td>
                <td className="py-5 px-4 text-center bg-purple-500/[0.02]">
                  {currentPlan === 'recruiter' ? (
                    <button
                      type="button"
                      onClick={() => setActiveTab('analyze')}
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 font-sans text-xs font-bold border border-border text-text-muted cursor-pointer hover:scale-105 active:scale-95 transition-all bg-surface-secondary"
                    >
                      {t.upgradeBadgeCurrentPlan}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={isCheckingOut}
                      onClick={() => handleCheckout('recruiter')}
                      className="group relative inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 font-sans text-xs font-bold bg-purple-500 text-white cursor-pointer hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
                    >
                      {isCheckingOut && checkoutPlan === 'recruiter' ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Briefcase className="h-4 w-4" />
                          <span>{t.pricingCtaRecruiter}</span>
                          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                        </>
                      )}
                    </button>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile: Stacked Cards */}
      <div className="lg:hidden space-y-5 max-w-md mx-auto">
        {(['free', 'pro', 'recruiter'] as Plan[]).map((plan) => {
          const isRecruiter = plan === 'recruiter';
          const isPro = plan === 'pro';
          const isCurrent = currentPlan === plan;

          return (
            <div
              key={plan}
              className={cn(
                'relative overflow-hidden rounded-2xl border-2 bg-surface/50 backdrop-blur-sm',
                isRecruiter
                  ? 'border-purple-500/30'
                  : isPro
                    ? 'border-accent/30'
                    : 'border-border',
                isCurrent && 'ring-2 ring-success/30',
              )}
            >
              {/* Badge */}
              {(isPro || isRecruiter) && (
                <div className={cn(
                  'text-center py-1.5',
                  isRecruiter ? 'bg-purple-500' : 'bg-accent',
                )}>
                  <span className="text-[10px] font-black uppercase tracking-wider text-white">
                    {isRecruiter ? t.pricingBadgeEnterprise : t.pricingBadgePopular}
                  </span>
                </div>
              )}

              {/* Header */}
              <div className="p-5 text-center">
                <div className="flex items-center justify-center gap-2 mb-3">
                  <h3 className={cn(
                    'text-lg font-black uppercase tracking-wider',
                    isRecruiter ? 'text-purple-400' : isPro ? 'text-accent' : 'text-text-main',
                  )}>
                    {plan === 'recruiter' ? t.planRecruiterLabel : plan === 'pro' ? t.planProLabel : t.planFreeLabel}
                  </h3>
                  {isCurrent && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-success/10 text-success border border-success/20">
                      {t.upgradeBadgeCurrentPlan}
                    </span>
                  )}
                </div>
                <PriceTag plan={plan} />
              </div>

              {/* Rows */}
              <div className="border-t border-border divide-y divide-border/50">
                {ROWS.map((row) => (
                  <div key={row.key} className="flex items-center justify-between px-5 py-3">
                    <span className="text-xs font-semibold text-text-main">{t[row.labelKey]}</span>
                    <div className="flex items-center gap-1.5">
                      <RowIcon type={row[plan].icon} />
                      <span className="text-xs text-text-muted tabular-nums font-medium">{row[plan].value}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* CTA */}
              <div className="p-5">
                {plan === 'recruiter' ? (
                  currentPlan === 'recruiter' ? (
                    <button
                      type="button"
                      onClick={() => setActiveTab('analyze')}
                      className="w-full h-12 rounded-xl font-bold text-sm border border-border text-text-muted bg-surface-secondary cursor-pointer"
                    >
                      {t.upgradeBadgeCurrentPlan}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={isCheckingOut}
                      onClick={() => handleCheckout('recruiter')}
                      className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-xl font-bold text-sm bg-purple-500 text-white cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                    >
                      {isCheckingOut && checkoutPlan === 'recruiter' ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Briefcase className="h-4 w-4" />
                          {t.pricingCtaRecruiter}
                        </>
                      )}
                    </button>
                  )
                ) : plan === 'pro' ? (
                  currentPlan === 'pro' || currentPlan === 'recruiter' ? (
                    <button
                      type="button"
                      onClick={() => setActiveTab('analyze')}
                      className="w-full h-12 rounded-xl font-bold text-sm border border-border text-text-muted bg-surface-secondary cursor-pointer"
                    >
                      {t.upgradeBadgeCurrentPlan}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={isCheckingOut}
                      onClick={() => handleCheckout('pro')}
                      className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-xl font-bold text-sm bg-accent text-white cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                    >
                      {isCheckingOut && checkoutPlan === 'pro' ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4" />
                          {t.upgradeCta}
                        </>
                      )}
                    </button>
                  )
                ) : (
                  <button
                    type="button"
                    onClick={() => setActiveTab('analyze')}
                    className="w-full h-12 rounded-xl font-bold text-sm border border-border text-text-muted cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-all bg-surface-secondary"
                  >
                    {t.pricingCtaFree}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 p-4 bg-error/10 border border-error/30 rounded-2xl max-w-2xl mx-auto">
          <AlertCircle className="size-5 text-error shrink-0 mt-0.5" />
          <p className="text-sm font-bold text-error">{error}</p>
        </div>
      )}

      {/* Guarantee */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-6 text-xs text-text-muted max-w-2xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-lg bg-success/10 border border-success/20 flex items-center justify-center">
            <Check className="size-4 text-success" />
          </div>
          <span>{t.upgradeCancelAnytime}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center">
            <Zap className="size-4 text-accent" />
          </div>
          <span>{t.upgradeInstantActivation}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
            <Briefcase className="size-4 text-purple-400" />
          </div>
          <span>{t.upgradeRecruiterCampaignNote}</span>
        </div>
      </div>

      {/* Back link */}
      <div className="text-center">
        <button
          type="button"
          onClick={() => setActiveTab('analyze')}
          className="text-sm text-text-muted hover:text-text-main transition-colors duration-200 cursor-pointer inline-flex items-center gap-1"
        >
          <ChevronRight className="size-4 rotate-180" />
          {t.paymentBackToApp}
        </button>
      </div>
    </div>
  );
}