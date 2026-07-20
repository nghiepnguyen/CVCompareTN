import React from 'react';
import { cn } from '../../../lib/utils';
import { Target, ShieldCheck, Brain, BarChart3, Key, TrendingUp, FileCheck, Download, Activity } from 'lucide-react';
import type { LandingLabels } from './types';
import type { SectionTheme } from './shared';
import { GlassCard, FeatureIcon, SectionHeading, SectionBadge } from './shared';
import { MatchRing, MeterStack, SkillChips, SuggestionList } from './FeatureVisuals';

export function WhyChooseSection({ t, theme = 'dark' }: { t: LandingLabels; theme?: SectionTheme }) {
  const isLight = theme === 'light';
  // Wide bento cells carry a product-authentic visual (sample mirrors the
  // Demo section) so the grid shows the output, not just describes it.
  const features = [
    { icon: Target, title: t.feature1Title, desc: t.feature1Desc, visual: <MatchRing value={72} label="Độ khớp" /> },
    { icon: ShieldCheck, title: t.feature2Title, desc: t.feature2Desc },
    { icon: Brain, title: t.feature3Title, desc: t.feature3Desc },
    { icon: BarChart3, title: t.feature4Title, desc: t.feature4Desc },
    { icon: Key, title: t.feature5Title, desc: t.feature5Desc },
    { icon: TrendingUp, title: t.feature6Title, desc: t.feature6Desc, visual: <SuggestionList items={[t.suggestion1, t.suggestion2, t.suggestion3]} /> },
    { icon: FileCheck, title: t.feature7Title, desc: t.feature7Desc, visual: <MeterStack items={[{ label: 'Độ phù hợp', value: 72 }, { label: 'Điểm ATS', value: 81 }]} /> },
    { icon: Download, title: t.feature8Title, desc: t.feature8Desc, visual: <SkillChips missing={['SQL', 'Communication', 'Leadership']} strong={['UX Design', 'Figma', 'Research']} /> },
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
        <div className="mb-6 text-left">
          <SectionBadge icon={Activity} theme={theme}>{t.badgeWhyChoose}</SectionBadge>
        </div>
        <SectionHeading as="h2" goldLine theme={theme} align="left">
          {t.whyTitle}
        </SectionHeading>

        {/* Bento — asymmetric spans break the uniform 4×2 grid; first card
            anchors as a larger feature-hero */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 lg:auto-rows-fr">
          {features.map((item, i) => {
            const wide = i === 0 || i === 5 || i === 6 || i === 7;
            const hero = i === 0;
            const hasVisual = Boolean(item.visual);
            return (
              <GlassCard
                key={i}
                delay={i * 0.05}
                className={cn(
                  'group',
                  wide && 'lg:col-span-2',
                  hasVisual ? 'flex flex-col lg:flex-row lg:items-center lg:gap-8' : 'flex flex-col',
                )}
                theme={theme}
              >
                <div className={cn('flex flex-col', hasVisual && 'lg:flex-1')}>
                  <FeatureIcon icon={item.icon} size={hero ? 'md' : 'sm'} theme={theme} />
                  <h4
                    className={cn(
                      'mb-3 font-sans font-bold leading-snug',
                      hero ? 'text-xl md:text-2xl' : 'text-lg',
                      isLight ? 'text-slate-800' : 'text-text-main',
                    )}
                  >
                    {item.title}
                  </h4>
                  <p
                    className={cn(
                      'leading-relaxed transition-colors duration-500',
                      hero ? 'text-base' : 'text-sm',
                      isLight
                        ? 'text-slate-500 group-hover:text-slate-700'
                        : 'text-text-muted group-hover:text-text-main/80',
                    )}
                  >
                    {item.desc}
                  </p>
                </div>
                {hasVisual && (
                  <div className="mt-6 flex shrink-0 justify-center lg:mt-0 lg:flex-1 lg:justify-end">
                    {item.visual}
                  </div>
                )}
              </GlassCard>
            );
          })}
        </div>
      </div>
    </section>
  );
}

