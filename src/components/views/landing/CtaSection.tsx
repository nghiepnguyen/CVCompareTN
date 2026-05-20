import React from 'react';
import { motion } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import type { LandingLabels } from './types';

export function CtaSection({ t, login }: { t: LandingLabels; login: () => void }) {
  return (
  <section className="w-full pb-32 pt-16 px-4">
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      className="container relative mx-auto max-w-6xl overflow-hidden rounded-[3rem] bg-accent px-8 py-20 text-center shadow-2xl shadow-accent/30 md:px-20 md:py-32"
    >
      <div className="absolute top-0 right-0 -mr-20 -mt-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
      <div className="absolute bottom-0 left-0 -ml-20 -mb-20 h-64 w-64 rounded-full bg-accent-hover/20 blur-3xl" />

      <div className="relative z-10">
        <h2 className="mx-auto max-w-3xl font-sans text-4xl font-extrabold tracking-tight text-white sm:text-6xl">
          {t.ctaTitle}
        </h2>
        <div className="mt-12 flex flex-col items-center justify-center gap-6 sm:flex-row">
          <button
            onClick={login}
            className="h-16 rounded-2xl bg-surface px-12 font-sans text-xl font-black text-accent transition-all hover:bg-surface-secondary hover:shadow-2xl active:scale-95 cursor-pointer"
          >
            {t.ctaBtn}
          </button>
          <a
            href="https://hr.thanhnghiep.top"
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-16 items-center justify-center gap-3 rounded-2xl border-2 border-white/30 bg-white/10 px-10 font-sans text-lg font-bold text-white backdrop-blur-md transition-all hover:bg-white/20 active:scale-95 cursor-pointer"
          >
            <span>{t.forEmployers}</span>
            <ArrowRight className="h-5 w-5" />
          </a>
        </div>
        <p className="mt-8 font-sans text-lg font-bold text-white/80">
          {t.ctaSub}
        </p>
      </div>
    </motion.div>
  </section>
);

}
