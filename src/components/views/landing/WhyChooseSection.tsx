import React from 'react';
import { Target, ShieldCheck, Brain, BarChart3, Key, TrendingUp, FileCheck, Download } from 'lucide-react';
import type { LandingLabels } from './types';
import { GlassCard, FeatureIcon, SectionHeading, SectionBadge } from './shared';
import { Activity } from 'lucide-react';

export function WhyChooseSection({ t }: { t: LandingLabels }) {
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
    <section className="relative w-full section-padding overflow-hidden">
      {/* Background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-0 left-1/4 h-64 w-64 rounded-full bg-accent/3 blur-[120px]" />
      </div>

      <div className="container-premium relative z-10">
        <div className="text-center mb-14">
          <SectionBadge icon={Activity}>AI-Powered Features</SectionBadge>
        </div>
        <SectionHeading as="h2" goldLine>
          {t.whyTitle}
        </SectionHeading>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          {features.map((item, i) => (
            <GlassCard key={i} delay={i * 0.05} className="group">
              <FeatureIcon icon={item.icon} size="sm" />
              <h4 className="mb-3 font-sans text-lg font-bold leading-snug text-text-main">
                {item.title}
              </h4>
              <p className="text-sm leading-relaxed text-text-muted group-hover:text-text-main/80 transition-colors duration-500">
                {item.desc}
              </p>
            </GlassCard>
          ))}
        </div>
      </div>
    </section>
  );
}