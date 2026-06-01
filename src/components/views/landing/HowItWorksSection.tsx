import React from 'react';
import { motion } from 'motion/react';
import { cn } from '../../../lib/utils';
import { Upload, FileText, Brain, Sparkles } from 'lucide-react';
import type { LandingLabels } from './types';
import type { SectionTheme } from './shared';
import { SectionHeading, SectionBadge } from './shared';

export function HowItWorksSection({ t, theme = 'dark' }: { t: LandingLabels; theme?: SectionTheme }) {
  const isLight = theme === 'light';
  const steps = [
    { title: t.howItWorksStep1Title, desc: t.howItWorksStep1Desc, icon: Upload },
    { title: t.howItWorksStep2Title, desc: t.howItWorksStep2Desc, icon: FileText },
    { title: t.howItWorksStep3Title, desc: t.howItWorksStep3Desc, icon: Brain },
    { title: t.howItWorksStep4Title, desc: t.howItWorksStep4Desc, icon: Sparkles },
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

        {/* Desktop: horizontal steps with connecting line */}
        <div className="relative hidden md:grid md:grid-cols-4 gap-8">
          {/* Connecting line */}
          <div
            className={cn(
              'absolute top-12 left-[12.5%] right-[12.5%] h-px',
              isLight
                ? 'bg-gradient-to-r from-transparent via-slate-300 to-transparent'
                : 'bg-gradient-to-r from-transparent via-accent/30 to-transparent',
            )}
          />

          {steps.map((step, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.15 }}
              className="relative flex flex-col items-center text-center group"
            >
              {/* Step number circle */}
              <div
                className={cn(
                  'relative z-10 mb-8 flex h-24 w-24 items-center justify-center rounded-full border shadow-2xl transition-all duration-500',
                  isLight
                    ? 'border-slate-200 bg-white group-hover:border-accent/30 group-hover:shadow-accent/5'
                    : 'border-white/[0.08] bg-primary-light group-hover:border-accent/30 group-hover:shadow-accent/5',
                )}
              >
                <div
                  className={cn(
                    'absolute inset-1.5 rounded-full transition-all duration-500',
                    isLight
                      ? 'bg-emerald-50 group-hover:bg-emerald-100'
                      : 'bg-accent/5 group-hover:bg-accent/10',
                  )}
                />
                <span className="relative z-10 font-serif text-3xl font-black text-accent">
                  {String(i + 1).padStart(2, '0')}
                </span>
              </div>

              <h4 className={cn('mb-3 font-sans text-lg font-bold', isLight ? 'text-slate-800' : 'text-text-main')}>
                {step.title}
              </h4>
              <p className={cn('max-w-[200px] text-sm leading-relaxed', isLight ? 'text-slate-500' : 'text-text-muted')}>
                {step.desc}
              </p>
            </motion.div>
          ))}
        </div>

        {/* Mobile: vertical timeline */}
        <div className="md:hidden space-y-8">
          {steps.map((step, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="flex items-start gap-5 group"
            >
              <div className="relative flex flex-col items-center">
                <div
                  className={cn(
                    'flex h-14 w-14 items-center justify-center rounded-full border transition-all duration-500',
                    isLight
                      ? 'border-slate-200 bg-white group-hover:border-accent/30'
                      : 'border-white/[0.08] bg-primary-light group-hover:border-accent/30',
                  )}
                >
                  <span className="font-serif text-xl font-black text-accent">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                </div>
                {i < steps.length - 1 && (
                  <div className="mt-2 h-8 w-px bg-gradient-to-b from-accent/20 to-transparent" />
                )}
              </div>
              <div className="pt-3">
                <h4 className={cn('mb-1 font-sans text-lg font-bold', isLight ? 'text-slate-800' : 'text-text-main')}>{step.title}</h4>
                <p className={cn('text-sm leading-relaxed', isLight ? 'text-slate-500' : 'text-text-muted')}>{step.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Bottom note */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="mt-16 md:mt-20 text-center"
        >
          <div
            className={cn(
              'inline-flex items-center gap-2 rounded-full px-6 py-3 backdrop-blur-md',
              isLight
                ? 'border border-emerald-200 bg-emerald-50'
                : 'border border-accent/10 bg-accent/5',
            )}
          >
            <Sparkles className="h-4 w-4 text-accent" />
            <span className={cn('font-sans text-sm font-semibold text-accent')}>
              {t.howItWorksFooter}
            </span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}