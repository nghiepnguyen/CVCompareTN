import React from 'react';
import { cn } from '../../../lib/utils';
import { GraduationCap, Search, Users, Globe, FileCheck, Target } from 'lucide-react';
import type { LandingLabels } from './types';
import type { SectionTheme } from './shared';
import { SectionHeading, GlassCard, FeatureIcon, SectionBadge } from './shared';

export function TargetUsersSection({ t, theme = 'dark' }: { t: LandingLabels; theme?: SectionTheme }) {
  const isLight = theme === 'light';
  const audiences = [
    { label: t.targetUsersItem1, icon: GraduationCap },
    { label: t.targetUsersItem2, icon: Search },
    { label: t.targetUsersItem3, icon: Users },
    { label: t.targetUsersItem4, icon: Globe },
    { label: t.targetUsersItem5, icon: FileCheck },
  ];

  return (
    <section
      className={cn(
        'relative w-full section-padding overflow-hidden',
        isLight ? 'bg-gradient-to-b from-slate-50 to-white' : '',
      )}
    >
      {/* Background */}
      {isLight && (
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute bottom-0 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-emerald-50/70 blur-[150px]" />
          <div className="absolute inset-0 bg-grid-light opacity-40" />
        </div>
      )}

      <div className="container-premium relative z-10">
        <div className="text-center mb-14">
          <SectionBadge icon={Target} theme={theme}>{t.badgeTargetUsers}</SectionBadge>
        </div>
        <SectionHeading goldLine theme={theme}>{t.targetUsersTitle}</SectionHeading>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5 md:gap-4">
          {audiences.map((item, i) => (
            <GlassCard
              key={i}
              delay={i * 0.08}
              className="flex flex-col items-center text-center p-5 md:p-8 group"
              theme={theme}
            >
              <FeatureIcon icon={item.icon} size={i === 4 ? 'lg' : 'md'} theme={theme} />
              <p
                className={cn(
                  'font-sans text-sm md:text-base font-bold leading-tight mt-3 transition-colors duration-500',
                  isLight
                    ? 'text-slate-700 group-hover:text-accent'
                    : 'text-text-main group-hover:text-accent',
                )}
              >
                {item.label}
              </p>
            </GlassCard>
          ))}
        </div>
      </div>
    </section>
  );
}