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
      className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-[#050705]"
    >
      {/* ---- Background Effects — flowing green silk wave mesh ---- */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {/* Deep base glow, right-weighted like the reference */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(120% 90% at 82% 45%, rgba(16,185,129,0.12), transparent 62%), radial-gradient(90% 80% at 25% 75%, rgba(5,150,105,0.07), transparent 65%)',
          }}
        />

        {/* Flowing silk wave mesh (SVG, animated) — concentrated on the right */}
        <WaveMesh />

        {/* Subtle grid, masked radial fade */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(rgba(16,185,129,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(16,185,129,0.08) 1px, transparent 1px)',
            backgroundSize: '54px 54px',
            maskImage: 'radial-gradient(ellipse 70% 60% at 45% 45%, #000 20%, transparent 80%)',
            WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 45% 45%, #000 20%, transparent 80%)',
          }}
        />

        {/* Noise texture */}
        <div className="absolute inset-0 bg-noise opacity-30" />

        {/* Vignette so text stays readable on the left */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(90deg, rgba(5,7,5,0.9) 0%, rgba(5,7,5,0.35) 32%, transparent 55%)',
          }}
        />
      </div>

      <motion.div
        style={{ opacity, scale }}
        className="container-premium relative z-10 text-center pt-24 pb-16"
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
          className="font-sans text-5xl sm:text-7xl md:text-8xl lg:text-[7rem] font-bold tracking-[-0.03em] text-text-main leading-[1.1] pb-2 text-balance"
        >
          {t.heroTitle}{' '}
          <span className="block text-green-accent leading-[1.25] pb-[0.12em]">
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
            href="https://recuiter.cvfit.pro/"
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

      {/* Bottom gradient fade */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-64 bg-gradient-to-t from-[#050705] via-transparent to-transparent" />
    </section>
  );
}

/**
 * Flowing green "silk" wave mesh. A fine woven grid (warp + weft lines) is
 * warped in 3D by a turbulence displacement filter, reading as draped cloth
 * like the reference hero. Pure SVG + CSS, right-weighted, no image asset.
 */
function WaveMesh() {
  const W = 1440;
  const H = 900;
  const GAP = 22; // mesh spacing — fine woven look
  const PAD = 320; // draw past the edges so displacement never bares a corner

  const vLines: number[] = [];
  for (let x = -PAD; x <= W + PAD; x += GAP) vLines.push(x);
  const hLines: number[] = [];
  for (let y = -PAD; y <= H + PAD; y += GAP) hLines.push(y);

  return (
    <div className="absolute inset-0 flex items-center justify-end">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid slice"
        className="h-full w-full animate-[waveDrift_22s_ease-in-out_infinite]"
        style={{
          maskImage:
            'radial-gradient(130% 120% at 82% 40%, #000 20%, rgba(0,0,0,0.55) 60%, transparent 92%)',
          WebkitMaskImage:
            'radial-gradient(130% 120% at 82% 40%, #000 20%, rgba(0,0,0,0.55) 60%, transparent 92%)',
        }}
      >
        <defs>
          <linearGradient id="silkStroke" x1="0" y1="0" x2="1" y2="0.6">
            <stop offset="0%" stopColor="rgba(6,95,70,0.25)" />
            <stop offset="40%" stopColor="rgba(16,185,129,0.85)" />
            <stop offset="70%" stopColor="rgba(110,231,183,1)" />
            <stop offset="90%" stopColor="rgba(236,253,245,1)" />
            <stop offset="100%" stopColor="rgba(52,211,153,0.5)" />
          </linearGradient>

          {/* Radial crest glow — the bright "peak" of the cloth */}
          <radialGradient id="crest" cx="83%" cy="30%" r="45%">
            <stop offset="0%" stopColor="rgba(209,250,229,0.6)" />
            <stop offset="45%" stopColor="rgba(52,211,153,0.2)" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>

          {/* Silk warp — large smooth turbulence displaces the flat grid into cloth */}
          <filter id="silk" x="-30%" y="-30%" width="160%" height="160%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.0022 0.0055"
              numOctaves={3}
              seed={11}
              result="noise"
            >
              <animate
                attributeName="baseFrequency"
                dur="26s"
                values="0.0022 0.0055; 0.0028 0.0044; 0.0022 0.0055"
                repeatCount="indefinite"
              />
            </feTurbulence>
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale={150}
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>

        <g
          filter="url(#silk)"
          fill="none"
          stroke="url(#silkStroke)"
          strokeWidth="1.1"
          strokeOpacity="1"
        >
          {vLines.map((x, i) => (
            <line key={`v${i}`} x1={x} y1={-PAD} x2={x} y2={H + PAD} />
          ))}
          {hLines.map((y, i) => (
            <line key={`h${i}`} x1={-PAD} y1={y} x2={W + PAD} y2={y} />
          ))}
        </g>

        {/* Bright crest over the ridge */}
        <rect
          x="0"
          y="0"
          width={W}
          height={H}
          fill="url(#crest)"
          style={{ mixBlendMode: 'screen' }}
        />
      </svg>
    </div>
  );
}