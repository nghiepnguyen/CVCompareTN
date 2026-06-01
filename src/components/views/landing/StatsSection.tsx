import React from 'react';
import { motion } from 'motion/react';
import { cn } from '../../../lib/utils';
import type { LandingLabels } from './types';
import type { SectionTheme } from './shared';
import { AnimatedCounter } from './shared';

export function StatsSection({ t, theme = 'dark' }: { t: LandingLabels; theme?: SectionTheme }) {
  const isLight = theme === 'light';

  return (
    <section className="relative w-full section-padding overflow-hidden">
      {/* Background */}
      <div className="pointer-events-none absolute inset-0">
        <div
          className={cn(
            'absolute inset-0',
            isLight
              ? 'bg-[radial-gradient(circle_at_50%_50%,rgba(5,150,105,0.06),transparent_60%)]'
              : 'bg-[radial-gradient(circle_at_50%_50%,rgba(5,150,105,0.05),transparent_60%)]',
          )}
        />
        <div className={cn('absolute inset-0 opacity-30', isLight ? 'bg-grid-light' : 'bg-grid')} />
      </div>

      <div className="container-premium relative z-10">
        <div className="grid grid-cols-1 gap-12 sm:grid-cols-3">
          {[
            { val: '35', suffix: '+', label: t.stats1 },
            { val: '98', suffix: '%', label: t.stats2 },
            { val: '2', suffix: 'M+', label: t.stats3 },
          ].map((stat, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.5 }}
              className="text-center"
            >
              <AnimatedCounter value={stat.val} suffix={stat.suffix} duration={2500} theme={theme} />
              <div
                className={cn(
                  'mt-3 font-sans text-sm font-semibold uppercase tracking-[0.2em]',
                  isLight ? 'text-slate-400' : 'text-text-light/60',
                )}
              >
                {stat.label}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}