import React, { useState } from 'react';
import { useScroll, useTransform } from 'motion/react';
import { useUI } from '../../context/UIContext';
import { useAuth } from '../../context/AuthContext';
import { HeroSection } from './landing/HeroSection';
import { TrustSection } from './landing/TrustSection';
import { ProblemSection } from './landing/ProblemSection';
import { WhyChooseSection } from './landing/WhyChooseSection';
import { HowItWorksSection } from './landing/HowItWorksSection';
import { DemoResultSection } from './landing/DemoResultSection';
import { StatsSection } from './landing/StatsSection';
import { TargetUsersSection } from './landing/TargetUsersSection';
import { RecruiterFeaturesSection } from './landing/RecruiterFeaturesSection';
import { PricingSection } from './landing/PricingSection';
import { CtaSection } from './landing/CtaSection';
import { FaqSection } from './landing/FaqSection';

export function LandingView() {
  const { t } = useUI();
  const { login, openAuthModal } = useAuth();
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);
  const { scrollYProgress } = useScroll();
  const opacity = useTransform(scrollYProgress, [0, 0.15], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.15], [1, 0.97]);

  return (
    <div className="relative flex w-full flex-col items-center overflow-hidden font-body dark bg-[#0A0A0A]">
      {/* Global ambient background — only visible behind dark sections */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute top-0 left-1/4 h-96 w-96 rounded-full bg-accent/3 blur-[150px]" />
        <div className="absolute bottom-0 right-1/4 h-96 w-96 rounded-full bg-accent/2 blur-[150px]" />
      </div>

      <div className="relative z-10 w-full">
        {/* DARK */}
        <HeroSection t={t} login={() => openAuthModal('signUp')} opacity={opacity} scale={scale} />

        {/* LIGHT */}
        <TrustSection t={t} theme="light" />

        {/* DARK */}
        <ProblemSection t={t} />

        {/* LIGHT */}
        <WhyChooseSection t={t} theme="light" />

        {/* DARK */}
        <HowItWorksSection t={t} />

        {/* LIGHT — showcase product in clean environment */}
        <DemoResultSection t={t} theme="light" />

        {/* DARK */}
        <StatsSection t={t} />

        {/* LIGHT */}
        <TargetUsersSection t={t} theme="light" />

        {/* DARK */}
        <RecruiterFeaturesSection t={t} />

        {/* LIGHT — pricing table shines on white */}
        <PricingSection t={t} login={() => openAuthModal('signUp')} theme="light" />

        {/* DARK */}
        <CtaSection t={t} login={() => openAuthModal('signUp')} />

        {/* LIGHT — friendly ending */}
        <FaqSection t={t} openFaqIndex={openFaqIndex} setOpenFaqIndex={setOpenFaqIndex} theme="light" />
      </div>
    </div>
  );
}