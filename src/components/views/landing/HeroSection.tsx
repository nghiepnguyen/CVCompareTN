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
      style={{
        background: 'linear-gradient(135deg, #F2FDF9 12%, #A8F0DC 38%, #52CBB0 64%, #147A5F 92%)',
      }}
    >
      {/* ---- Background Effects — "Mint ice" flow gradient ---- */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden bg-noise-light">
        {/* Drifting mint color blobs — flow motion */}
        <div
          className="absolute -top-24 -left-24 h-[32rem] w-[32rem] rounded-full opacity-50 blur-[110px] animate-[mintDrift_18s_ease-in-out_infinite]"
          style={{ background: '#A8F0DC' }}
        />
        <div
          className="absolute -bottom-32 -right-16 h-[36rem] w-[36rem] rounded-full opacity-60 blur-[120px] animate-[mintDrift_22s_ease-in-out_infinite_reverse]"
          style={{ background: '#147A5F' }}
        />

        {/* Soft radial glow behind the copy for guaranteed contrast */}
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(90% 65% at 50% 35%, rgba(242,253,249,0.85), transparent 75%)',
          }}
        />
      </div>

      <motion.div
        style={{ opacity, scale }}
        className="container-premium relative z-10 text-center pt-24 pb-16"
      >
        {/* Badge */}
        <SectionBadge icon={Sparkles} theme="light">
          {t.badgeHero}
        </SectionBadge>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 60, filter: 'blur(10px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 1, delay: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="font-sans text-5xl sm:text-7xl md:text-8xl lg:text-[7rem] font-bold tracking-[-0.03em] text-[#122A22] leading-[1.1] pb-2 text-balance"
        >
          {t.heroTitle}{' '}
          <span
            className="block leading-[1.1] pb-[0.12em]"
            style={{
              background: 'linear-gradient(135deg, #0B4A3A 0%, #147A5F 55%, #1F9C79 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            {t.badgeHeroHighlight}
          </span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-[#33544A] sm:text-xl lg:text-2xl font-light text-balance"
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
            href="https://recuiter.cvfit.pro/"
            target="_blank"
            rel="noopener noreferrer"
            icon={ArrowRight}
            theme="light"
          >
            {t.forEmployers}
          </OutlineButton>
        </motion.div>

        {/* Free badge */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 0.6 }}
          className="mt-6 text-sm font-medium text-[#4A6A61] uppercase tracking-wider"
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
        <div className="group relative overflow-hidden rounded-[2rem] md:rounded-[3rem] border border-[rgba(203,213,225,0.6)] bg-white/85 p-2 md:p-3 shadow-2xl backdrop-blur-2xl transition-all duration-700 hover:border-accent/25 hover:shadow-accent/10">
          {/* Reflection highlight */}
          <div className="absolute inset-0 bg-gradient-to-b from-white/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
          {/* Scan line */}
          <div className="absolute left-0 right-0 z-20 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent animate-scan pointer-events-none" />
          <img
            src="https://data.cvfit.pro/img/cvfit.jpg"
            alt={t.seoTitle || 'CV Matcher & Optimizer Dashboard'}
            className="relative z-10 w-full rounded-[1.5rem] md:rounded-[2.25rem] shadow-lg transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:scale-[1.005]"
            referrerPolicy="no-referrer"
            loading="lazy"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        </div>

        {/* Floating decoration */}
        <div className="absolute -top-8 -right-8 h-40 w-40 rounded-full bg-accent/10 blur-3xl animate-glow pointer-events-none" />
        <div className="absolute -bottom-8 -left-8 h-40 w-40 rounded-full bg-accent/5 blur-3xl animate-glow pointer-events-none" style={{ animationDelay: '2s' }} />
      </motion.div>

      {/* Bottom gradient fade — blend into the next (white) section */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-64 bg-gradient-to-t from-white via-white/50 to-transparent" />
    </section>
  );
}
