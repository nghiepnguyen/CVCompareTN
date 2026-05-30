import React from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Zap } from 'lucide-react';
import type { LandingLabels } from './types';
import { AccentButton, OutlineButton } from './shared';

export function CtaSection({ t, login }: { t: LandingLabels; login: () => void }) {
  return (
    <section className="relative w-full section-padding overflow-hidden">
      <div className="container-premium relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="relative overflow-hidden rounded-[2.5rem] md:rounded-[4rem] border border-white/[0.06] bg-primary-light p-10 md:p-20 text-center"
        >
          {/* Background decorations */}
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute top-0 right-0 -mr-20 -mt-20 h-80 w-80 rounded-full bg-accent/5 blur-3xl" />
            <div className="absolute bottom-0 left-0 -ml-20 -mb-20 h-80 w-80 rounded-full bg-accent/3 blur-3xl" />
            <div className="absolute inset-0 bg-grid opacity-30" />
          </div>

          <div className="relative z-10">
            {/* Small badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.15em] text-accent backdrop-blur-md mb-8">
              <Zap className="h-3.5 w-3.5" />
              <span>Get Started</span>
            </div>

            <h2 className="mx-auto max-w-3xl font-serif text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-text-main leading-tight">
              {t.ctaTitle}
            </h2>

            <div className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <AccentButton onClick={login} icon={Zap} iconPosition="left">
                {t.ctaBtn}
              </AccentButton>
              <OutlineButton
                href="https://hr.thanhnghiep.top"
                target="_blank"
                rel="noopener noreferrer"
                icon={ArrowRight}
              >
                {t.forEmployers}
              </OutlineButton>
            </div>

            <p className="mt-8 font-sans text-sm font-medium text-text-light/60 uppercase tracking-wider">
              {t.ctaSub}
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}