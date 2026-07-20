import React from 'react';
import { cn } from '../../../lib/utils';
import { Briefcase, FileSpreadsheet, MessageSquareText, BarChart3, Upload, Target } from 'lucide-react';
import type { LandingLabels } from './types';
import type { SectionTheme } from './shared';
import { GlassCard, FeatureIcon, SectionHeading, SectionBadge } from './shared';

type RecruiterT = LandingLabels & {
  badgeRecruiter?: string;
  recruiterSectionTitle?: string;
  recruiterSectionDesc?: string;
  recruiterFeature1Title?: string;
  recruiterFeature1Desc?: string;
  recruiterFeature2Title?: string;
  recruiterFeature2Desc?: string;
  recruiterFeature3Title?: string;
  recruiterFeature3Desc?: string;
  recruiterFeature4Title?: string;
  recruiterFeature4Desc?: string;
  recruiterFeature5Title?: string;
  recruiterFeature5Desc?: string;
  recruiterFeature6Title?: string;
  recruiterFeature6Desc?: string;
  recruiterViewPlans?: string;
};

export function RecruiterFeaturesSection({ t, theme = 'dark' }: { t: RecruiterT; theme?: SectionTheme }) {
  const isLight = theme === 'light';
  const features = [
    {
      icon: Upload,
      title: t.recruiterFeature1Title || 'Upload hàng loạt CV',
      desc: t.recruiterFeature1Desc || '',
    },
    {
      icon: Target,
      title: t.recruiterFeature2Title || 'Phân tích & Xếp hạng tự động',
      desc: t.recruiterFeature2Desc || '',
    },
    {
      icon: BarChart3,
      title: t.recruiterFeature3Title || 'Báo cáo điểm theo hạng mục',
      desc: t.recruiterFeature3Desc || '',
    },
    {
      icon: FileSpreadsheet,
      title: t.recruiterFeature4Title || 'Xuất báo cáo Excel',
      desc: t.recruiterFeature4Desc || '',
    },
    {
      icon: MessageSquareText,
      title: t.recruiterFeature5Title || 'Ghi chú nội bộ',
      desc: t.recruiterFeature5Desc || '',
    },
    {
      icon: Briefcase,
      title: t.recruiterFeature6Title || 'Quản lý nhiều đợt tuyển dụng',
      desc: t.recruiterFeature6Desc || '',
    },
  ];

  return (
    <section className="relative w-full section-padding overflow-hidden">
      {/* Background */}
      <div className="pointer-events-none absolute inset-0">
        <div className={cn('absolute bottom-0 right-1/4 h-64 w-64 rounded-full blur-[120px]', isLight ? 'bg-purple-100/60' : 'bg-purple-500/5')} />
        <div className={cn('absolute top-0 left-1/3 h-48 w-48 rounded-full blur-[100px]', isLight ? 'bg-emerald-100/50' : 'bg-accent/3')} />
      </div>

      <div className="container-premium relative z-10">
        <div className="mb-6 text-left">
          <SectionBadge icon={Briefcase} theme={theme}>
            {t.badgeRecruiter || 'Dành cho Nhà tuyển dụng'}
          </SectionBadge>
        </div>
        <SectionHeading as="h2" goldLine theme={theme} align="left">
          {t.recruiterSectionTitle || 'Tuyển dụng thông minh với AI'}
        </SectionHeading>

        <p className={cn('text-left text-sm max-w-2xl -mt-10 mb-14', isLight ? 'text-slate-500' : 'text-text-muted')}>
          {t.recruiterSectionDesc || ''}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {features.map((item, i) => (
            <GlassCard key={i} delay={i * 0.06} className="group" theme={theme}>
              <FeatureIcon icon={item.icon} size="sm" theme={theme} />
              <h4 className={cn('mb-3 font-sans text-lg font-bold leading-snug', isLight ? 'text-slate-800' : 'text-text-main')}>
                {item.title}
              </h4>
              <p className={cn('text-sm leading-relaxed transition-colors duration-500', isLight ? 'text-slate-500 group-hover:text-slate-700' : 'text-text-muted group-hover:text-text-main/80')}>
                {item.desc}
              </p>
            </GlassCard>
          ))}
        </div>

      </div>
    </section>
  );
}