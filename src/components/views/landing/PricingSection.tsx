import React from 'react';
import { motion } from 'motion/react';
import { Briefcase, Check, Infinity, Minus, Sparkles, Zap } from 'lucide-react';
import { cn } from '../../../lib/utils';
import type { SectionTheme } from './shared';
import { SectionHeading, SectionBadge } from './shared';

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
    { key: 'campaigns', labelKey: 'pricingCampaigns', free: { value: '—', icon: 'dash' }, pro: { value: '—', icon: 'dash' }, recruiter: { value: '10' + (t.pricingPerMonth || '/ tháng'), icon: 'check' } },
    { key: 'downloadCv', labelKey: 'pricingDownloadCv', free: { value: '—', icon: 'dash' }, pro: { value: t.planFreeLabel === 'Free' ? 'Yes' : 'Có', icon: 'check' }, recruiter: { value: t.planFreeLabel === 'Free' ? 'Yes' : 'Có', icon: 'check' } },
    { key: 'jd', labelKey: 'pricingJdStore', free: { value: '3', icon: 'dash' }, pro: { value: t.planFreeLabel === 'Free' ? 'Unlimited' : 'Không giới hạn', icon: 'infinity' }, recruiter: { value: t.planFreeLabel === 'Free' ? 'Unlimited' : 'Không giới hạn', icon: 'infinity' } },
    { key: 'history', labelKey: 'pricingHistory', free: { value: '7 ' + (t.planFreeLabel === 'Free' ? 'days' : 'ngày'), icon: 'dash' }, pro: { value: t.planFreeLabel === 'Free' ? 'Permanent' : 'Vĩnh viễn', icon: 'check' }, recruiter: { value: t.planFreeLabel === 'Free' ? 'Permanent' : 'Vĩnh viễn', icon: 'check' } },
    { key: 'export', labelKey: 'pricingExport', free: { value: '—', icon: 'dash' }, pro: { value: '—', icon: 'dash' }, recruiter: { value: t.planFreeLabel === 'Free' ? 'Yes' : 'Có', icon: 'check' } },
    { key: 'hrNotes', labelKey: 'pricingHrNotes', free: { value: '—', icon: 'dash' }, pro: { value: '—', icon: 'dash' }, recruiter: { value: t.planFreeLabel === 'Free' ? 'Yes' : 'Có', icon: 'check' } },
  ];
}

function RowIcon({ type }: { type: 'check' | 'dash' | 'infinity' }) {
  if (type === 'infinity') return <Infinity className="w-4 h-4 text-accent" />;
  if (type === 'check') return <Check className="w-4 h-4 text-success" />;
  return null;
}

function PriceTag({ plan, t, isLight }: { plan: Plan; t: any; isLight: boolean }) {
  const mutedClass = isLight ? 'text-slate-400' : 'text-text-muted';
  if (plan === 'recruiter') {
    return (
      <div className="space-y-1">
        <p className="text-3xl font-black text-purple-500">399.000đ</p>
        <p className={cn('text-[10px] font-semibold uppercase tracking-wider', mutedClass)}>{t.pricingPerMonth || '/ tháng'}</p>
      </div>
    );
  }
  if (plan === 'pro') {
    return (
      <div className="space-y-1">
        <p className="text-3xl font-black text-accent">69.000đ</p>
        <p className={cn('text-[10px] font-semibold uppercase tracking-wider', mutedClass)}>{t.pricingPerMonth || '/ tháng'}</p>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <p className={cn('text-3xl font-black', isLight ? 'text-slate-800' : 'text-text-main')}>0đ</p>
      <p className={cn('text-[10px] font-semibold uppercase tracking-wider', mutedClass)}>{t.pricingFreeLifetime || 'Miễn phí trọn đời'}</p>
    </div>
  );
}

export function PricingSection({
  t,
  login,
  onUpgrade,
  theme = 'dark',
}: {
  t: Record<string, any>;
  login: () => void;
  onUpgrade?: () => void;
  theme?: SectionTheme;
}) {
  const isLight = theme === 'light';
  const Rows = buildRows(t);
  const featureLabel = t.pricingColFeature || 'Tính năng';
  const freeLabel = t.planFreeLabel || 'Miễn phí';
  const proLabel = t.planProLabel || 'Pro';
  const recruiterLabel = t.planRecruiterLabel || 'Recruiter';
  const popularBadge = t.pricingBadgePopular || 'Phổ biến';
  const enterpriseBadge = t.pricingBadgeEnterprise || 'Doanh nghiệp';
  const trustNote = t.pricingTrustNote || '';

  const labelMuted = isLight ? 'text-slate-500' : 'text-text-muted';
  const labelText = isLight ? 'text-slate-800' : 'text-text-main';
  const borderClass = isLight ? 'border-slate-200' : 'border-border';
  const sectionBg = isLight ? 'bg-gradient-to-b from-white to-slate-50' : '';
  const tableBg = isLight
    ? 'border border-slate-200 bg-white shadow-lg'
    : 'border border-white/[0.06] bg-white/[0.02] backdrop-blur-2xl';
  const tableHoverRow = isLight ? 'hover:bg-slate-50' : 'hover:bg-white/[0.01]';
  const freeBtnClasses = isLight
    ? 'border border-slate-200 text-slate-600 hover:text-slate-800 bg-slate-50'
    : 'border border-border text-text-muted hover:text-text-main bg-surface-secondary';

  return (
    <section id="pricing" className={cn('relative w-full section-padding overflow-hidden', sectionBg)}>
      {/* Light bg decoration */}
      {isLight && (
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute top-1/3 left-1/4 h-96 w-96 rounded-full bg-emerald-50/60 blur-[150px]" />
          <div className="absolute bottom-0 right-1/4 h-64 w-64 rounded-full bg-purple-50/50 blur-[100px]" />
        </div>
      )}

      <div className="container-premium relative z-10">
        {/* Section Header */}
        <div className="text-center mb-14">
          <SectionBadge icon={Sparkles} theme={theme}>
            {t.badgePricing || 'Bảng giá'}
          </SectionBadge>
        </div>
        <SectionHeading goldLine theme={theme}>
          {t.pricingSectionTitle || 'Chọn gói phù hợp với bạn'}
        </SectionHeading>

        {/* Desktop: Table */}
        <div className="hidden lg:block max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className={cn('overflow-hidden rounded-2xl', tableBg)}
          >
            <table className="w-full">
              <thead>
                <tr>
                  <th className={cn('w-[28%] p-6 border-b text-left', borderClass)}>
                    <span className={cn('text-[10px] font-extrabold uppercase tracking-widest', labelMuted)}>
                      {featureLabel}
                    </span>
                  </th>
                  <th className={cn('w-[24%] border-b', borderClass)}>
                    <div className="text-center p-6">
                      <h3 className={cn('text-base font-black uppercase tracking-wider mb-3', labelText)}>{freeLabel}</h3>
                      <PriceTag plan="free" t={t} isLight={isLight} />
                    </div>
                  </th>
                  <th className={cn('w-[24%] border-b', borderClass, isLight ? 'bg-emerald-50/50' : 'bg-accent/[0.06]')}>
                    <div className="text-center p-6">
                      <h3 className="text-base font-black text-accent uppercase tracking-wider mb-3">{proLabel}</h3>
                      <PriceTag plan="pro" t={t} isLight={isLight} />
                      <span className="inline-block mt-3 px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-accent text-white shadow-sm shadow-accent/30">
                        {popularBadge}
                      </span>
                    </div>
                  </th>
                  <th className={cn('w-[24%] border-b', borderClass, isLight ? 'bg-purple-50/30' : 'bg-purple-500/[0.03]')}>
                    <div className="text-center p-6">
                      <h3 className="text-base font-black text-purple-500 uppercase tracking-wider mb-3">{recruiterLabel}</h3>
                      <PriceTag plan="recruiter" t={t} isLight={isLight} />
                      <span className="inline-block mt-3 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-purple-500/10 text-purple-500 border border-purple-400/20">
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
                    className={cn('border-b transition-colors', isLight ? 'border-slate-200/60' : 'border-white/[0.04]', tableHoverRow)}
                  >
                    <td className="py-4 px-6">
                      <span className={cn('text-sm font-semibold', labelText)}>{t[row.labelKey] || row.labelKey}</span>
                    </td>
                    <td className="py-4 px-6 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <RowIcon type={row.free.icon} />
                        <span className={cn('text-sm tabular-nums', labelMuted)}>{row.free.value}</span>
                      </div>
                    </td>
                    <td className={cn('py-4 px-6 text-center', isLight ? 'bg-emerald-50/30' : 'bg-accent/[0.04]')}>
                      <div className="flex items-center justify-center gap-2">
                        <RowIcon type={row.pro.icon} />
                        <span className={cn('text-sm tabular-nums', labelMuted)}>{row.pro.value}</span>
                      </div>
                    </td>
                    <td className={cn('py-4 px-6 text-center', isLight ? 'bg-purple-50/20' : 'bg-purple-500/[0.02]')}>
                      <div className="flex items-center justify-center gap-2">
                        <RowIcon type={row.recruiter.icon} />
                        <span className={cn('text-sm tabular-nums', labelMuted)}>{row.recruiter.value}</span>
                      </div>
                    </td>
                  </motion.tr>
                ))}
                {/* CTA Row */}
                <tr className={cn('border-t', isLight ? 'border-slate-200/60' : 'border-white/[0.05]')}>
                  <td className="py-5 px-6" />
                  <td className="py-5 px-3 text-center align-middle">
                    <button
                      type="button"
                      onClick={login}
                      className={cn('inline-flex w-full items-center justify-center gap-2 h-12 rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-all', freeBtnClasses)}
                    >
                      <Zap className="w-4 h-4" />
                      {t.pricingCtaFree || 'Bắt đầu miễn phí'}
                    </button>
                  </td>
                  <td className={cn('py-5 px-3 text-center align-middle', isLight ? 'bg-emerald-50/30' : 'bg-accent/[0.04]')}>
                    <button
                      type="button"
                      onClick={onUpgrade ?? login}
                      className="inline-flex w-full items-center justify-center gap-2 h-12 rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-all bg-accent text-white shadow-lg shadow-accent/20"
                    >
                      <Sparkles className="w-4 h-4" />
                      {t.pricingCtaPro || 'Nâng cấp Pro'}
                    </button>
                  </td>
                  <td className={cn('py-5 px-3 text-center align-middle', isLight ? 'bg-purple-50/20' : 'bg-purple-500/[0.02]')}>
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
                  'relative overflow-hidden rounded-2xl border-2',
                  isRecruiter
                    ? 'border-purple-500/30 bg-purple-500/[0.03] backdrop-blur-2xl'
                    : isPro
                      ? 'border-accent/40 bg-accent/[0.06] backdrop-blur-2xl shadow-lg shadow-accent/10'
                      : cn(isLight ? 'border-slate-200 bg-white' : 'border-border bg-white/[0.02] backdrop-blur-2xl'),
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
                    isRecruiter ? 'text-purple-500' : isPro ? 'text-accent' : (isLight ? 'text-slate-800' : 'text-text-main'),
                  )}>
                    {plan === 'recruiter' ? recruiterLabel : plan === 'pro' ? proLabel : freeLabel}
                  </h3>
                  <PriceTag plan={plan} t={t} isLight={isLight} />
                </div>

                <div className={cn('border-t divide-y', borderClass, borderClass + '/50')}>
                  {Rows.map((row) => (
                    <div key={row.key} className="flex items-center justify-between px-5 py-3.5">
                      <span className={cn('text-xs font-semibold', labelText)}>{t[row.labelKey] || row.labelKey}</span>
                      <div className="flex items-center gap-1.5">
                        <RowIcon type={row[plan].icon} />
                        <span className={cn('text-xs tabular-nums font-medium', labelMuted)}>{row[plan].value}</span>
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
                      className={cn('w-full inline-flex items-center justify-center gap-2 h-12 rounded-xl font-bold text-sm cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-all', freeBtnClasses)}
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
          <p className={cn('text-center text-xs mt-8', labelMuted)}>{trustNote}</p>
        )}
      </div>
    </section>
  );
}