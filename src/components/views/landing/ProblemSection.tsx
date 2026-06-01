import React from 'react';
import { cn } from '../../../lib/utils';
import { AlertCircle, Clock, Search, ShieldAlert } from 'lucide-react';
import type { LandingLabels } from './types';
import type { SectionTheme } from './shared';
import { GlassCard, FeatureIcon, SectionHeading } from './shared';

export function ProblemSection({ t, theme = 'dark' }: { t: LandingLabels; theme?: SectionTheme }) {
  const isLight = theme === 'light';

  return (
    <section className="relative w-full section-padding overflow-hidden">
      <div className="container-premium relative z-10">
        <SectionHeading goldLine theme={theme}>{t.problemTitle}</SectionHeading>

        <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-3">
          {/* Card 1 - span 2 */}
          <GlassCard className="lg:col-span-2" delay={0} theme={theme}>
            <FeatureIcon icon={AlertCircle} size="md" theme={theme} />
            <h3 className={cn('mb-3 font-sans text-xl md:text-2xl font-bold', isLight ? 'text-slate-800' : 'text-text-main')}>
              {t.problemItem1}
            </h3>
            <p className={cn('leading-relaxed', isLight ? 'text-slate-500' : 'text-text-muted')}>
              {t.problemItem2}. {t.problemDescCard1}
            </p>
          </GlassCard>

          {/* Card 2 */}
          <GlassCard className="lg:col-span-1" delay={0.1} theme={theme}>
            <FeatureIcon icon={Clock} size="md" theme={theme} />
            <h3 className={cn('mb-3 font-sans text-xl md:text-2xl font-bold', isLight ? 'text-slate-800' : 'text-text-main')}>
              {t.problemDescCard2}
            </h3>
            <p className={cn('leading-relaxed', isLight ? 'text-slate-500' : 'text-text-muted')}>
              {t.problemItem4}. {t.problemDescCard2Detail}
            </p>
          </GlassCard>

          {/* Card 3 */}
          <GlassCard className="lg:col-span-1" delay={0.15} theme={theme}>
            <FeatureIcon icon={Search} size="md" theme={theme} />
            <h3 className={cn('mb-3 font-sans text-xl md:text-2xl font-bold', isLight ? 'text-slate-800' : 'text-text-main')}>
              {t.problemItem3}
            </h3>
            <p className={cn('leading-relaxed', isLight ? 'text-slate-500' : 'text-text-muted')}>
              {t.problemDescCard3Detail}
            </p>
          </GlassCard>

          {/* Card 4 - highlight */}
          <GlassCard className={cn('lg:col-span-2', isLight ? 'border-accent/30' : 'border-accent/20 animate-border-glow')} delay={0.2} hover={false} theme={theme}>
            <div className="flex h-full flex-col justify-center">
              <FeatureIcon icon={ShieldAlert} size="md" theme={theme} />
              <h3 className={cn('mb-4 font-serif text-2xl md:text-3xl font-bold leading-tight', isLight ? 'text-slate-900' : 'text-white')}>
                {t.problemResult}
              </h3>
              <p className={cn('leading-relaxed', isLight ? 'text-slate-500' : 'text-text-muted')}>
                {t.problemDescCard4Detail}
              </p>
            </div>
          </GlassCard>
        </div>
      </div>

      {/* Background decoration */}
      <div className={cn('pointer-events-none absolute top-1/2 right-0 h-96 w-96 -translate-y-1/2 translate-x-1/2 rounded-full blur-[150px]', isLight ? 'bg-emerald-100/50' : 'bg-accent/3')} />
    </section>
  );
}