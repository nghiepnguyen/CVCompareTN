import React from 'react';
import { motion } from 'motion/react';
import { Upload, FileText, Brain, Sparkles } from 'lucide-react';
import type { LandingLabels } from './types';
import { SectionHeading, SectionBadge } from './shared';

export function HowItWorksSection({ t }: { t: LandingLabels }) {
  const steps = [
    { title: t.howItWorksStep1Title, desc: t.howItWorksStep1Desc, icon: Upload },
    { title: t.howItWorksStep2Title, desc: t.howItWorksStep2Desc, icon: FileText },
    { title: t.howItWorksStep3Title, desc: t.howItWorksStep3Desc, icon: Brain },
    { title: t.howItWorksStep4Title, desc: t.howItWorksStep4Desc, icon: Sparkles },
  ];

  return (
    <section className="relative w-full section-padding overflow-hidden">
      {/* Background */}
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-50" />

      <div className="container-premium relative z-10">
        <div className="text-center mb-14">
          <SectionBadge icon={Sparkles}>{t.badgeHowItWorks}</SectionBadge>
        </div>
        <SectionHeading goldLine>{t.howItWorksTitle}</SectionHeading>

        {/* Desktop: horizontal steps with connecting line */}
        <div className="relative hidden md:grid md:grid-cols-4 gap-8">
          {/* Connecting line */}
          <div className="absolute top-12 left-[12.5%] right-[12.5%] h-px bg-gradient-to-r from-transparent via-accent/30 to-transparent" />

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
              <div className="relative z-10 mb-8 flex h-24 w-24 items-center justify-center rounded-full border border-white/[0.08] bg-primary-light shadow-2xl transition-all duration-500 group-hover:border-accent/30 group-hover:shadow-accent/5">
                <div className="absolute inset-1.5 rounded-full bg-accent/5 transition-all duration-500 group-hover:bg-accent/10" />
                <span className="relative z-10 font-serif text-3xl font-black text-accent">
                  {String(i + 1).padStart(2, '0')}
                </span>
              </div>

              <h4 className="mb-3 font-sans text-lg font-bold text-text-main">
                {step.title}
              </h4>
              <p className="max-w-[200px] text-sm leading-relaxed text-text-muted">
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
                <div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/[0.08] bg-primary-light transition-all duration-500 group-hover:border-accent/30">
                  <span className="font-serif text-xl font-black text-accent">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                </div>
                {i < steps.length - 1 && (
                  <div className="mt-2 h-8 w-px bg-gradient-to-b from-accent/20 to-transparent" />
                )}
              </div>
              <div className="pt-3">
                <h4 className="mb-1 font-sans text-lg font-bold text-text-main">{step.title}</h4>
                <p className="text-sm leading-relaxed text-text-muted">{step.desc}</p>
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
          <div className="inline-flex items-center gap-2 rounded-full border border-accent/10 bg-accent/5 px-6 py-3 backdrop-blur-md">
            <Sparkles className="h-4 w-4 text-accent" />
            <span className="font-sans text-sm font-semibold text-accent">
              {t.howItWorksFooter}
            </span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}