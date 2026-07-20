import React from 'react';
import { motion } from 'motion/react';
import { cn } from '../../../lib/utils';
import { Sparkles } from 'lucide-react';
import type { LandingLabels } from './types';
import type { SectionTheme } from './shared';
import { SectionHeading, SectionBadge } from './shared';
import { UploadTile, PasteTile, AnalyzeTile, ReportTile } from './HowItWorksVisuals';

export function HowItWorksSection({ t, theme = 'dark' }: { t: LandingLabels; theme?: SectionTheme }) {
  const isLight = theme === 'light';
  const steps = [
    { title: t.howItWorksStep1Title, desc: t.howItWorksStep1Desc, visual: <UploadTile /> },
    { title: t.howItWorksStep2Title, desc: t.howItWorksStep2Desc, visual: <PasteTile /> },
    { title: t.howItWorksStep3Title, desc: t.howItWorksStep3Desc, visual: <AnalyzeTile /> },
    { title: t.howItWorksStep4Title, desc: t.howItWorksStep4Desc, visual: <ReportTile /> },
  ];

  return (
    <section className="relative w-full section-padding overflow-hidden">
      {/* Background */}
      <div className={cn('pointer-events-none absolute inset-0 opacity-50', isLight ? 'bg-grid-light' : 'bg-grid')} />

      <div className="container-premium relative z-10">
        <div className="text-center mb-14">
          <SectionBadge icon={Sparkles} theme={theme}>{t.badgeHowItWorks}</SectionBadge>
        </div>
        <SectionHeading goldLine theme={theme}>{t.howItWorksTitle}</SectionHeading>

        {/* Process cards — each step carries a diagrammatic mini-visual */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.5, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] }}
              className="group flex flex-col rounded-3xl border border-slate-200 bg-white p-5 transition-[border-color,box-shadow,transform] duration-500 hover:-translate-y-1 hover:border-accent/30 hover:shadow-[0_8px_30px_rgba(5,150,105,0.08)]"
            >
              {step.visual}
              <div className="mt-5 flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 font-serif text-sm font-black tabular-nums text-accent">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h4 className="font-sans text-base font-bold leading-snug text-slate-800">{step.title}</h4>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">{step.desc}</p>
            </motion.div>
          ))}
        </div>

        {/* Bottom note */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mt-16 md:mt-20 text-center"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-6 py-3">
            <Sparkles className="h-4 w-4 text-accent" strokeWidth={1.5} />
            <span className="font-sans text-sm font-semibold text-accent">{t.howItWorksFooter}</span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
