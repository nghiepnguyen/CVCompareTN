import React from 'react';
import { motion } from 'motion/react';
import { Download, FileText, Brain, CheckCircle2 } from 'lucide-react';
import type { LandingLabels } from './types';

export function HowItWorksSection({ t }: { t: LandingLabels }) {
  return (
  <section className="w-full py-32">
    <div className="container mx-auto max-w-6xl px-4">
      <div className="mb-20 text-center">
        <h2 className="font-sans text-4xl font-extrabold tracking-tight text-text-main sm:text-5xl">
          {t.howItWorksTitle}
        </h2>
      </div>

      <div className="relative grid grid-cols-1 gap-8 md:grid-cols-4">
        <div className="absolute top-10 left-0 hidden h-0.5 w-full bg-border md:block" />

        {[
          { title: t.howItWorksStep1Title, desc: t.howItWorksStep1Desc, icon: Download },
          { title: t.howItWorksStep2Title, desc: t.howItWorksStep2Desc, icon: FileText },
          { title: t.howItWorksStep3Title, desc: t.howItWorksStep3Desc, icon: Brain },
          { title: t.howItWorksStep4Title, desc: t.howItWorksStep4Desc, icon: CheckCircle2 }
        ].map((step, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1 }}
            className="relative flex flex-col items-center text-center"
          >
            <div className="relative z-10 mb-8 flex h-20 w-20 items-center justify-center rounded-full border-4 border-surface-secondary bg-surface shadow-xl shadow-border/50">
              <span className="font-sans text-2xl font-black text-accent">{i + 1}</span>
            </div>
            <h4 className="mb-3 font-sans text-xl font-extrabold text-text-main">{step.title}</h4>
            <p className="max-w-[200px] text-sm leading-relaxed text-text-muted">{step.desc}</p>
          </motion.div>
        ))}
      </div>

      <div className="mt-20 flex flex-col items-center justify-center gap-4 rounded-[2.5rem] bg-accent-light p-8 text-center border border-accent/10">
        <p className="font-sans text-lg font-bold text-accent">
          {t.howItWorksFooter}
        </p>
      </div>
    </div>
  </section>
);

}
