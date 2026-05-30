import React from 'react';
import { AlertCircle, Clock, Search, ShieldAlert } from 'lucide-react';
import type { LandingLabels } from './types';
import { GlassCard, FeatureIcon, SectionHeading } from './shared';

export function ProblemSection({ t }: { t: LandingLabels }) {
  return (
    <section className="relative w-full section-padding overflow-hidden">
      <div className="container-premium relative z-10">
        <SectionHeading goldLine>{t.problemTitle}</SectionHeading>

        <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-3">
          {/* Card 1 - span 2 */}
          <GlassCard className="lg:col-span-2" delay={0}>
            <FeatureIcon icon={AlertCircle} size="md" />
            <h3 className="mb-3 font-sans text-xl md:text-2xl font-bold text-text-main">
              {t.problemItem1}
            </h3>
            <p className="text-text-muted leading-relaxed">
              {t.problemItem2}. {t.problemDescCard1}
            </p>
          </GlassCard>

          {/* Card 2 */}
          <GlassCard className="lg:col-span-1" delay={0.1}>
            <FeatureIcon icon={Clock} size="md" />
            <h3 className="mb-3 font-sans text-xl md:text-2xl font-bold text-text-main">
              {t.problemDescCard2}
            </h3>
            <p className="text-text-muted leading-relaxed">
              {t.problemItem4}. {t.problemDescCard2Detail}
            </p>
          </GlassCard>

          {/* Card 3 */}
          <GlassCard className="lg:col-span-1" delay={0.15}>
            <FeatureIcon icon={Search} size="md" />
            <h3 className="mb-3 font-sans text-xl md:text-2xl font-bold text-text-main">
              {t.problemItem3}
            </h3>
            <p className="text-text-muted leading-relaxed">
              {t.problemDescCard3Detail}
            </p>
          </GlassCard>

          {/* Card 4 - highlight */}
          <GlassCard className="lg:col-span-2 border-accent/20 animate-border-glow" delay={0.2} hover={false}>
            <div className="flex h-full flex-col justify-center">
              <FeatureIcon icon={ShieldAlert} size="md" />
              <h3 className="mb-4 font-serif text-2xl md:text-3xl font-bold leading-tight text-white">
                {t.problemResult}
              </h3>
            <p className="text-text-muted leading-relaxed">
              {t.problemDescCard4Detail}
            </p>
            </div>
          </GlassCard>
        </div>
      </div>

      {/* Background decoration */}
      <div className="pointer-events-none absolute top-1/2 right-0 h-96 w-96 -translate-y-1/2 translate-x-1/2 rounded-full bg-accent/3 blur-[150px]" />
    </section>
  );
}