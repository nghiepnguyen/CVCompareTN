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
    <div className="relative flex w-full flex-col items-center overflow-hidden font-body bg-[#F8FAFC]">
      {/* Global ambient background — subtle emerald wash, single light tone */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute top-0 left-1/4 h-96 w-96 rounded-full bg-emerald-100/40 blur-[150px]" />
        <div className="absolute bottom-0 right-1/4 h-96 w-96 rounded-full bg-emerald-50/50 blur-[150px]" />
      </div>

      <div className="relative z-10 w-full">
        {/* Hero — light mint gradient, fades into the page */}
        <HeroSection t={t} login={() => openAuthModal('signUp')} opacity={opacity} scale={scale} />

        {/* Consistent light theme throughout — sections vary only by subtle
            surface shade (white ↔ slate-50) for gentle rhythm, no hard flips */}
        <TrustSection t={t} theme="light" />
        <ProblemSection t={t} theme="light" />
        <WhyChooseSection t={t} theme="light" />
        <HowItWorksSection t={t} theme="light" />
        <DemoResultSection t={t} theme="light" />
        <StatsSection t={t} theme="light" />
        <TargetUsersSection t={t} theme="light" />
        <RecruiterFeaturesSection t={t} theme="light" />
        <PricingSection t={t} login={() => openAuthModal('signUp')} theme="light" />
        <CtaSection t={t} login={() => openAuthModal('signUp')} theme="light" />
        <FaqSection t={t} openFaqIndex={openFaqIndex} setOpenFaqIndex={setOpenFaqIndex} theme="light" />
      </div>
    </div>
  );
}