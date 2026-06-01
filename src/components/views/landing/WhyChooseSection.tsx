import React from 'react';
import { cn } from '../../../lib/utils';
import { Target, ShieldCheck, Brain, BarChart3, Key, TrendingUp, FileCheck, Download, Activity } from 'lucide-react';
import type { LandingLabels } from './types';
import type { SectionTheme } from './shared';
import { GlassCard, FeatureIcon, SectionHeading, SectionBadge } from './shared';

export function WhyChooseSection({ t, theme = 'dark' }: { t: LandingLabels; theme?: SectionTheme }) {
  const isLight = theme === 'light';
  const features = [
    { icon: Target, title: t.feature1Title, desc: t.feature1Desc },
    { icon: ShieldCheck, title: t.feature2Title, desc: t.feature2Desc },
    { icon: Brain, title: t.feature3Title, desc: t.feature3Desc },
    { icon: BarChart3, title: t.feature4Title, desc: t.feature4Desc },
    { icon: Key, title: t.feature5Title, desc: t.feature5Desc },
    { icon: TrendingUp, title: t.feature6Title, desc: t.feature6Desc },
    { icon: FileCheck, title: t.feature7Title, desc: t.feature7Desc },
    { icon: Download, title: t.feature8Title, desc: t.feature8Desc },
  ];

  return (
    <section
      className={cn(
        'relative w-full section-padding overflow-hidden',
        isLight ? 'bg-gradient-to-b from-slate-50 to-white' : '',
      )}
    >
      {/* Background */}
      {isLight ? (
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute top-0 left-1/4 h-64 w-64 rounded-full bg-emerald-100/60 blur-[120px]" />
          <div className="absolute bottom-0 right-1/4 h-48 w-48 rounded-full bg-emerald-50/80 blur-[100px]" />
          <div className="absolute inset-0 bg-grid-light" />
        </div>
      ) : (
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute top-0 left-1/4 h-64 w-64 rounded-full bg-accent/3 blur-[120px]" />
        </div>
      )}

      <div className="container-premium relative z-10">
        <div className="text-center mb-14">
          <SectionBadge icon={Activity} theme={theme}>{t.badgeWhyChoose}</SectionBadge>
        </div>
        <SectionHeading as="h2" goldLine theme={theme}>
          {t.whyTitle}
        </SectionHeading>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          {features.map((item, i) => (
            <GlassCard key={i} delay={i * 0.05} className="group" theme={theme}>
              <FeatureIcon icon={item.icon} size="sm" theme={theme} />
              <h4
                className={cn(
                  'mb-3 font-sans text-lg font-bold leading-snug',
                  isLight ? 'text-slate-800' : 'text-text-main',
                )}
              >
                {item.title}
              </h4>
              <p
                className={cn(
                  'text-sm leading-relaxed transition-colors duration-500',
                  isLight
                    ? 'text-slate-500 group-hover:text-slate-700'
                    : 'text-text-muted group-hover:text-text-main/80',
                )}
              >
                {item.desc}
              </p>
            </GlassCard>
          ))}
        </div>
      </div>
    </section>
  );
}

