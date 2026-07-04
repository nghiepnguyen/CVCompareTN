import React from 'react';
import { motion } from 'motion/react';
import { cn } from '../../../lib/utils';
import { ArrowRight, Zap } from 'lucide-react';
import type { LandingLabels } from './types';
import type { SectionTheme } from './shared';
import { AccentButton, OutlineButton } from './shared';

export function CtaSection({ t, login, theme = 'dark' }: { t: LandingLabels; login: () => void; theme?: SectionTheme }) {
  const isLight = theme === 'light';

  return (
    <section className="relative w-full section-padding overflow-hidden">
      <div className="container-premium relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}
          className={cn(
            'relative overflow-hidden rounded-[2.5rem] md:rounded-[4rem] border p-10 md:p-20 text-center',
            isLight
              ? 'border-slate-200 bg-white shadow-xl'
              : 'border-white/[0.06] bg-primary-light',
          )}
        >
          {/* Background decorations */}
          <div className="pointer-events-none absolute inset-0">
            <div className={cn('absolute top-0 right-0 -mr-20 -mt-20 h-80 w-80 rounded-full blur-3xl', isLight ? 'bg-emerald-100/60' : 'bg-accent/5')} />
            <div className={cn('absolute bottom-0 left-0 -ml-20 -mb-20 h-80 w-80 rounded-full blur-3xl', isLight ? 'bg-emerald-50/50' : 'bg-accent/3')} />
            <div className={cn('absolute inset-0 opacity-30', isLight ? 'bg-grid-light' : 'bg-grid')} />
          </div>

          <div className="relative z-10">
            {/* Small badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.15em] text-accent backdrop-blur-md mb-8">
              <Zap className="h-3.5 w-3.5" strokeWidth={1.5} />
              <span>{t.badgeCta}</span>
            </div>

            <h2 className={cn('mx-auto max-w-3xl font-serif text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight leading-tight', isLight ? 'text-slate-900' : 'text-text-main')}>
              {t.ctaTitle}
            </h2>

            <div className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <AccentButton onClick={login} icon={Zap} iconPosition="left">
                {t.ctaBtn}
              </AccentButton>
              <OutlineButton
                href="https://recuiter.cvfit.pro/"
                target="_blank"
                rel="noopener noreferrer"
                icon={ArrowRight}
                theme={theme}
              >
                {t.forEmployers}
              </OutlineButton>
            </div>

            <p className={cn('mt-8 font-sans text-sm font-medium uppercase tracking-wider', isLight ? 'text-slate-400' : 'text-text-light/60')}>
              {t.ctaSub}
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}