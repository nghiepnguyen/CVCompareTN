import React from 'react';
import { motion } from 'motion/react';
import type { MotionValue } from 'motion/react';
import { ArrowRight, Sparkles, Zap } from 'lucide-react';
import type { LandingLabels } from './types';

export function HeroSection({ t, login, opacity, scale }: { t: LandingLabels; login: () => void; opacity: MotionValue<number>; scale: MotionValue<number> }) {
  return (
  <section className="relative flex min-h-[90vh] w-full flex-col items-center justify-center px-4 pt-20 pb-32">
    <motion.div
      style={{ opacity, scale }}
      className="container relative z-10 mx-auto max-w-6xl text-center"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="mb-8 inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent-light px-4 py-1.5 text-sm font-bold text-accent backdrop-blur-md"
      >
        <Sparkles className="h-4 w-4" />
        <span>AI-Powered CV Intelligence</span>
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1 }}
        className="font-sans text-4xl font-extrabold tracking-tight text-text-main sm:text-7xl lg:text-8xl"
      >
        {t.heroTitle.split(' ').slice(0, -1).join(' ')} <br className="hidden sm:block" />
        <span className="block mt-2 bg-gradient-to-r from-accent to-accent bg-clip-text text-transparent sm:inline sm:mt-0">
          {t.heroTitle.split(' ').slice(-1)} Smart Insights
        </span>
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-text-muted sm:text-xl"
      >
        {t.heroDesc}
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.3 }}
        className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row px-4 w-full sm:px-0"
      >
        <button
          onClick={login}
          className="group relative flex h-14 w-full sm:w-auto items-center justify-center gap-2 overflow-hidden rounded-2xl bg-text-main px-10 font-bold text-white transition-all hover:bg-slate-800 hover:shadow-xl hover:shadow-slate-900/20 active:scale-95 cursor-pointer"
        >
          <Zap className="h-5 w-5 fill-current text-accent" />
          <span>{t.startNow}</span>
          <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
        </button>
        <a
          href="https://hr.thanhnghiep.top"
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-14 w-full sm:w-auto items-center justify-center gap-2 rounded-2xl border border-border bg-surface px-8 font-bold text-text-main transition-all hover:bg-surface-secondary hover:shadow-lg active:scale-95 cursor-pointer"
        >
          <span className="truncate">{t.forEmployers}</span>
          <ArrowRight className="h-5 w-5 text-text-light shrink-0" />
        </a>
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="mt-6 text-sm font-semibold text-text-light"
      >
        {t.heroSub}
      </motion.p>
    </motion.div>

    {/* Floating Preview */}
    <motion.div
      initial={{ opacity: 0, y: 100 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 1, delay: 0.4, type: 'spring' }}
      className="relative mt-20 w-full max-w-6xl px-4"
    >
      <div className="group relative overflow-hidden rounded-[2.5rem] border border-white/40 bg-white/30 p-2 shadow-2xl backdrop-blur-2xl transition-transform hover:scale-[1.01]">
        <div className="absolute inset-0 bg-gradient-to-tr from-accent/5 to-accent/5 opacity-0 transition-opacity group-hover:opacity-100" />
          <img
            src="https://thanhnghiep.top/CVMatcher/cv-dash.jpg"
            alt={t.seoTitle || "CV Matcher & Optimizer Dashboard"}
            className="relative z-10 rounded-[2rem] shadow-sm transition-transform"
            referrerPolicy="no-referrer"
            loading="lazy"
          />
      </div>

      {/* Decorative Elements */}
      <div className="absolute -top-10 -right-10 h-32 w-32 animate-pulse rounded-full bg-accent/20 blur-3xl" />
      <div className="absolute -bottom-10 -left-10 h-32 w-32 animate-pulse rounded-full bg-accent/20 blur-3xl" />
    </motion.div>
  </section>
);

}
