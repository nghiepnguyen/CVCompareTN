import React from 'react';
import { motion } from 'motion/react';
import { GraduationCap, Search, Users, Globe, FileCheck } from 'lucide-react';
import type { LandingLabels } from './types';
import { SectionHeading, GlassCard, FeatureIcon } from './shared';
import { Target } from 'lucide-react';
import { SectionBadge } from './shared';

export function TargetUsersSection({ t }: { t: LandingLabels }) {
  const audiences = [
    { label: t.targetUsersItem1, icon: GraduationCap },
    { label: t.targetUsersItem2, icon: Search },
    { label: t.targetUsersItem3, icon: Users },
    { label: t.targetUsersItem4, icon: Globe },
    { label: t.targetUsersItem5, icon: FileCheck },
  ];

  return (
    <section className="relative w-full section-padding overflow-hidden">
      <div className="container-premium relative z-10">
        <div className="text-center mb-14">
          <SectionBadge icon={Target}>Audience</SectionBadge>
        </div>
        <SectionHeading goldLine>{t.targetUsersTitle}</SectionHeading>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5 md:gap-4">
          {audiences.map((item, i) => (
            <GlassCard
              key={i}
              delay={i * 0.08}
              className="flex flex-col items-center text-center p-5 md:p-8 group"
            >
              <FeatureIcon icon={item.icon} size={i === 4 ? 'lg' : 'md'} />
              <p className="font-sans text-sm md:text-base font-bold text-text-main leading-tight mt-3 group-hover:text-accent transition-colors duration-500">
                {item.label}
              </p>
            </GlassCard>
          ))}
        </div>
      </div>
    </section>
  );
}