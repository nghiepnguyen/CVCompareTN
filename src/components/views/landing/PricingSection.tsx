import React from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Briefcase, Check, Infinity, Minus, Sparkles, Zap } from 'lucide-react';
import type { LandingLabels } from './types';
import { SectionHeading, SectionBadge } from './shared';
import { cn } from '../../../lib/utils';

type Plan = 'free' | 'pro' | 'recruiter';

type ComparisonRow = {
  key: string;
  labelKey: string;
  free: { value: string; icon: 'check' | 'dash' | 'infinity' };
  pro: { value: string; icon: 'check' | 'dash' | 'infinity' };
  recruiter: { value: string; icon: 'check' | 'dash' | 'infinity' };
};

function buildRows(t: any): ComparisonRow[] {
  return [
    { key: 'analyses', labelKey: 'pricingAnalyses', free: { value: '10', icon: 'dash' }, pro: { value: '100', icon: 'check' }, recruiter: { value: '500', icon: 'check' } },
    { key: 'batch', labelKey: 'pricingBatch', free: { value: '1', icon: 'dash' }, pro: { value: '5', icon: 'check' }, recruiter: { value: '50', icon: 'check' } },
    { key: 'campaignCvs', labelKey: 'pricingCampaignCvs', free: { value: '—', icon: 'dash' }, pro: { value: '—', icon: 'dash' }, recruiter: { value: '50', icon: 'check' } },
    { key: 'campaigns', labelKey: 'pricingCampaigns', free: { value: '—', icon: 'dash' }, pro: { value: '—', icon: 'dash' }, recruiter: { value: '10 / ' + (t.pricingPerMonth || 'tháng'), icon: 'check' } },
    { key: 'jd', labelKey: 'pricingJdStore', free: { value: '3', icon: 'dash' }, pro: { value: t.planFreeLabel === 'Free' ? 'Unlimited' : 'Không giới hạn', icon: 'infinity' }, recruiter: { value: t.planFreeLabel === 'Free' ? 'Unlimited' : 'Không giới hạn', icon: 'infinity' } },
    { key: 'history', labelKey: 'pricingHistory', free: { value: '7 ' + (t.planFreeLabel === 'Free' ? 'days' : 'ngày'), icon: 'dash' }, pro: { value: t.planFreeLabel === 'Free' ? 'Permanent' : 'Vĩnh viễn', icon: 'check' }, recruiter: { value: t.planFreeLabel === 'Free' ? 'Permanent' : 'Vĩnh viễn', icon: 'check' } },
    { key: 'export', labelKey: 'pricingExport', free: { value: '—', icon: 'dash' }, pro: { value: '—', icon: 'dash' }, recruiter: { value: t.planFreeLabel === 'Free' ? 'Yes' : 'Có', icon: 'check' } },
    { key: 'hrNotes', labelKey: 'pricingHrNotes', free: { value: '—', icon: 'dash' }, pro: { value: '—', icon: 'dash' }, recruiter: { value: t.planFreeLabel === 'Free' ? 'Yes' : 'Có', icon: 'check' } },
  ];
}

function RowIcon({ type }: { type: 'check' | 'dash' | 'infinity' }) {
  if (type === 'infinity') return <Infinity className="w-4 h-4 text-accent" />;
  if (type === 'check') return <Check className="w-4 h-4 text-success" />;
  return <Minus className="w-4 h-4 text-text-muted/30" />;
}

function PriceTag({ plan, t }: { plan: Plan; t: any }) {
  if (plan === 'recruiter') {
    return (
      <div className="space-y-1">
        <p className="text-3xl font-black text-purple-400">399.000đ</p>
        <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">{t.pricingPerMonth || '/ tháng'}</p>
      </div>
    );
  }
  if (plan === 'pro') {
    return (
      <div className="space-y-1">
        <p className="text-3xl font-black text-accent">69.000đ</p>
        <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">{t.pricingPerMonth || '/ tháng'}</p>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <p className="text-3xl font-black text-text-main">0đ</p>
      <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">{t.pricingFreeLifetime || 'Miễn phí trọn đời'}</p>
    </div>
  );
}

export function PricingSection({
  t,
  login,
  onUpgrade,
}: {
  t: Record<string, any>;
  login: () => void;
  onUpgrade?: () => void;
}) {
  const Rows = buildRows(t);
  const featureLabel = t.pricingColFeature || 'Tính năng';
  const freeLabel = t.planFreeLabel || 'Miễn phí';
  const proLabel = t.planProLabel || 'Pro';
  const recruiterLabel = t.planRecruiterLabel || 'Recruiter';
  const popularBadge = t.pricingBadgePopular || 'Phổ biến';
  const enterpriseBadge = t.pricingBadgeEnterprise || 'Doanh nghiệp';
  const trustNote = t.pricingTrustNote || '';

  return (
    <section id="pricing" className="relative w-full section-padding overflow-hidden">
      <div className="container-premium relative z-10">
        {/* Section Header */}
        <div className="text-center mb-14">
          <SectionBadge icon={Sparkles}>
            {t.badgePricing || 'Bảng giá'}
          </SectionBadge>
        </div>
        <SectionHeading goldLine>
          {t.pricingSectionTitle || 'Chọn gói phù hợp với bạn'}
        </SectionHeading>

        {/* Desktop: Table */}
        <div className="hidden lg:block max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-2xl"
          >
            <table className="w-full">
              <thead>
                <tr>
                  <th className="w-[28%] p-6 border-b border-border text-left">
                    <span className="text-[10px] font-extrabold uppercase tracking-widest text-text-muted">
                      {featureLabel}
                    </span>
                  </th>
                  <th className="w-[24%] border-b border-border">
                    <div className="text-center p-6 border-b border-border">
                      <h3 className="text-base font-black text-text-main uppercase tracking-wider mb-3">{freeLabel}</h3>
                      <PriceTag plan="free" t={t} />
                    </div>
                  </th>
                  <th className="w-[24%] border-b border-border bg-accent/[0.02]">
                    <div className="text-center p-6 border-b border-border">
                      <h3 className="text-base font-black text-accent uppercase tracking-wider mb-3">{proLabel}</h3>
                      <PriceTag plan="pro" t={t} />
                      <span className="inline-block mt-3 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-accent/10 text-accent border border-accent/20">
                        {popularBadge}
                      </span>
                    </div>
                  </th>
                  <th className="w-[24%] border-b border-border bg-purple-500/[0.03]">
                    <div className="text-center p-6 border-b border-border">
                      <h3 className="text-base font-black text-purple-400 uppercase tracking-wider mb-3">{recruiterLabel}</h3>
                      <PriceTag plan="recruiter" t={t} />
                      <span className="inline-block mt-3 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-purple-500/10 text-purple-400 border border-purple-400/20">
                        {enterpriseBadge}
                      </span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {Rows.map((row, idx) => (
                  <motion.tr
                    key={row.key}
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.05 * idx }}
                    className="border-b border-border/50 hover:bg-white/[0.01] transition-colors"
                  >
                    <td className="py-4 px-6">
                      <span className="text-sm font-semibold text-text-main">{t[row.labelKey] || row.labelKey}</span>
                    </td>
                    <td className="py-4 px-6 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <RowIcon type={row.free.icon} />
                        <span className="text-sm text-text-muted tabular-nums">{row.free.value}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-center bg-accent/[0.01]">
                      <div className="flex items-center justify-center gap-2">
                        <RowIcon type={row.pro.icon} />
                        <span className="text-sm text-text-muted tabular-nums">{row.pro.value}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-center bg-purple-500/[0.02]">
                      <div className="flex items-center justify-center gap-2">
                        <RowIcon type={row.recruiter.icon} />
                        <span className="text-sm text-text-muted tabular-nums">{row.recruiter.value}</span>
                      </div>
                    </td>
                  </motion.tr>
                ))}
                {/* CTA Row — uniform button height h-12, full width */}
                <tr className="border-t-2 border-border/80">
                  <td className="py-5 px-6" />
                  <td className="py-5 px-3 text-center align-middle">
                    <button
                      type="button"
                      onClick={login}
                      className="inline-flex w-full items-center justify-center gap-2 h-12 rounded-xl text-xs font-black uppercase tracking-wider border border-border text-text-muted hover:text-text-main cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-all bg-surface-secondary"
                    >
                      <Zap className="w-4 h-4" />
                      {t.pricingCtaFree || 'Bắt đầu miễn phí'}
                    </button>
                  </td>
                  <td className="py-5 px-3 text-center align-middle bg-accent/[0.01]">
                    <button
                      type="button"
                      onClick={onUpgrade ?? login}
                      className={cn(
                        'inline-flex w-full items-center justify-center gap-2 h-12 rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-all',
                        'bg-accent text-white',
                      )}
                    >
                      <Sparkles className="w-4 h-4" />
                      {t.pricingCtaPro || 'Nâng cấp Pro'}
                    </button>
                  </td>
                  <td className="py-5 px-3 text-center align-middle bg-purple-500/[0.02]">
                    <button
                      type="button"
                      onClick={onUpgrade ?? login}
                      className="inline-flex w-full items-center justify-center gap-2 h-12 rounded-xl text-xs font-black uppercase tracking-wider bg-purple-500 text-white cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-all"
                    >
                      <Briefcase className="w-4 h-4" />
                      {t.pricingCtaRecruiter || 'Nâng cấp Recruiter'}
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </motion.div>
        </div>

        {/* Mobile: Stacked Cards */}
        <div className="lg:hidden space-y-6 max-w-md mx-auto">
          {(['free', 'pro', 'recruiter'] as Plan[]).map((plan, planIdx) => {
            const isRecruiter = plan === 'recruiter';
            const isPro = plan === 'pro';

            return (
              <motion.div
                key={plan}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 * planIdx }}
                className={cn(
                  'relative overflow-hidden rounded-2xl border-2 backdrop-blur-2xl',
                  isRecruiter
                    ? 'border-purple-500/30 bg-purple-500/[0.03]'
                    : isPro
                      ? 'border-accent/30 bg-accent/[0.02]'
                      : 'border-border bg-white/[0.02]',
                )}
              >
                {(isPro || isRecruiter) && (
                  <div className="absolute -top-0.5 left-1/2 -translate-x-1/2">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-b-full px-4 py-1 text-[10px] font-black uppercase tracking-wider text-white shadow-sm',
                        isRecruiter ? 'bg-purple-500' : 'bg-accent',
                      )}
                    >
                      <Zap className="size-2.5 fill-white" />
                      {isRecruiter ? enterpriseBadge : popularBadge}
                    </span>
                  </div>
                )}

                <div className="p-6 pt-8 text-center space-y-3">
                  <h3 className={cn(
                    'text-lg font-black uppercase tracking-wider',
                    isRecruiter ? 'text-purple-400' : isPro ? 'text-accent' : 'text-text-main',
                  )}>
                    {plan === 'recruiter' ? recruiterLabel : plan === 'pro' ? proLabel : freeLabel}
                  </h3>
                  <PriceTag plan={plan} t={t} />
                </div>

                <div className="border-t border-border divide-y divide-border/50">
                  {Rows.map((row) => (
                    <div key={row.key} className="flex items-center justify-between px-5 py-3.5">
                      <span className="text-xs font-semibold text-text-main">{t[row.labelKey] || row.labelKey}</span>
                      <div className="flex items-center gap-1.5">
                        <RowIcon type={row[plan].icon} />
                        <span className="text-xs text-text-muted tabular-nums font-medium">{row[plan].value}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="p-5">
                  {plan === 'recruiter' ? (
                    <button
                      type="button"
                      onClick={onUpgrade ?? login}
                      className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-xl font-bold text-sm bg-purple-500 text-white cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-all"
                    >
                      <Briefcase className="w-4 h-4" />
                      {t.pricingCtaRecruiter || 'Nâng cấp Recruiter'}
                    </button>
                  ) : plan === 'pro' ? (
                    <button
                      type="button"
                      onClick={onUpgrade ?? login}
                      className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-xl font-bold text-sm bg-accent text-white cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-all"
                    >
                      <Sparkles className="w-4 h-4" />
                      {t.pricingCtaPro || 'Nâng cấp Pro'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={login}
                      className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-xl font-bold text-sm border border-border text-text-muted hover:text-text-main cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-all bg-surface-secondary"
                    >
                      <Zap className="w-4 h-4" />
                      {t.pricingCtaFree || 'Bắt đầu miễn phí'}
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Trust note */}
        {trustNote && (
          <p className="text-center text-xs text-text-muted mt-8">{trustNote}</p>
        )}
      </div>
    </section>
  );
}