import React, { useRef } from 'react';
import { motion, useScroll, useTransform } from 'motion/react';
import { ArrowRight, Sparkles, Zap } from 'lucide-react';
import type { MotionValue } from 'motion/react';
import type { LandingLabels } from './types';
import { AccentButton, OutlineButton, SectionBadge } from './shared';

export function HeroSection({
  t,
  login,
  opacity,
  scale,
}: {
  t: LandingLabels;
  login: () => void;
  opacity: MotionValue<number>;
  scale: MotionValue<number>;
}) {
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const parallaxY = useTransform(scrollYProgress, [0, 1], [0, 150]);

  return (
    <section
      ref={heroRef}
      className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden"
    >
      {/* ---- Background Effects ---- */}
      <div className="pointer-events-none absolute inset-0">
        {/* Grid pattern */}
        <div className="absolute inset-0 bg-grid" />
        {/* Noise texture */}
        <div className="absolute inset-0 bg-noise" />
        {/* Glow orbs */}
        <div className="absolute top-1/4 -left-32 h-96 w-96 rounded-full bg-accent/5 blur-[120px] animate-glow" />
        <div className="absolute bottom-1/4 -right-32 h-80 w-80 rounded-full bg-accent/5 blur-[100px] animate-glow" style={{ animationDelay: '1.5s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[500px] rounded-full bg-accent/3 blur-[180px]" />
      </div>

      <motion.div
        style={{ opacity, scale }}
        className="container-premium relative z-10 text-center pt-20 pb-16"
      >
        {/* Badge */}
        <SectionBadge icon={Sparkles}>
          {t.badgeHero}
        </SectionBadge>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 60, filter: 'blur(10px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 1, delay: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="font-serif text-5xl sm:text-7xl md:text-8xl lg:text-9xl font-bold tracking-tight text-text-main leading-[1.05] text-balance"
        >
          {t.heroTitle}{' '}
          <span className="text-green-accent">
            {t.badgeHeroHighlight}
          </span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-text-muted sm:text-xl lg:text-2xl font-light text-balance"
        >
          {t.heroDesc}
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.7, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row px-4 w-full sm:px-0"
        >
          <AccentButton onClick={login} icon={Zap} iconPosition="left">
            {t.startNow}
          </AccentButton>
          <OutlineButton
            href="#"
            target="_blank"
            rel="noopener noreferrer"
            icon={ArrowRight}
          >
            {t.forEmployers}
          </OutlineButton>
        </motion.div>

        {/* Free badge */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 0.6 }}
          className="mt-6 text-sm font-medium text-text-light uppercase tracking-wider"
        >
          {t.heroSub}
        </motion.p>
      </motion.div>

      {/* ---- Floating Dashboard Preview ---- */}
      <motion.div
        initial={{ opacity: 0, y: 120 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.2, delay: 0.6, type: 'spring', stiffness: 50, damping: 20 }}
        style={{ y: parallaxY }}
        className="relative z-10 w-full max-w-6xl px-4 pb-16"
      >
        <div className="group relative overflow-hidden rounded-[2rem] md:rounded-[3rem] border border-white/[0.08] bg-white/[0.02] p-2 md:p-3 shadow-2xl backdrop-blur-3xl transition-all duration-700 hover:border-accent/20 hover:shadow-accent/5">
          {/* Reflection highlight */}
          <div className="absolute inset-0 bg-gradient-to-b from-white/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
          {/* Scan line */}
          <div className="absolute left-0 right-0 z-20 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent animate-scan pointer-events-none" />
          <img
            src="https://data.cvfit.pro/img/cvfit.jpg"
            alt={t.seoTitle || 'CV Matcher & Optimizer Dashboard'}
            className="relative z-10 w-full rounded-[1.5rem] md:rounded-[2.5rem] shadow-lg transition-transform duration-700 group-hover:scale-[1.005]"
            referrerPolicy="no-referrer"
            loading="lazy"
          />
        </div>

        {/* Floating decoration */}
        <div className="absolute -top-8 -right-8 h-40 w-40 rounded-full bg-accent/10 blur-3xl animate-glow pointer-events-none" />
        <div className="absolute -bottom-8 -left-8 h-40 w-40 rounded-full bg-accent/5 blur-3xl animate-glow pointer-events-none" style={{ animationDelay: '2s' }} />
      </motion.div>

      {/* Bottom gradient fade */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-64 bg-gradient-to-t from-primary via-transparent to-transparent" />
    </section>
  );
}