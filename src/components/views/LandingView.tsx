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
import { CtaSection } from './landing/CtaSection';
import { FaqSection } from './landing/FaqSection';

export function LandingView() {
  const { t } = useUI();
  const { login } = useAuth();
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);
  const { scrollYProgress } = useScroll();
  const opacity = useTransform(scrollYProgress, [0, 0.15], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.15], [1, 0.97]);

  return (
    <div className="relative flex w-full flex-col items-center overflow-hidden bg-primary font-body">
      {/* Global ambient background */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute top-0 left-1/4 h-96 w-96 rounded-full bg-accent/3 blur-[150px]" />
        <div className="absolute bottom-0 right-1/4 h-96 w-96 rounded-full bg-accent/2 blur-[150px]" />
      </div>

      <div className="relative z-10 w-full">
        <HeroSection t={t} login={login} opacity={opacity} scale={scale} />
        <TrustSection t={t} />
        <ProblemSection t={t} />
        <WhyChooseSection t={t} />
        <HowItWorksSection t={t} />
        <DemoResultSection t={t} />
        <StatsSection t={t} />
        <TargetUsersSection t={t} />
        <CtaSection t={t} login={login} />
        <FaqSection t={t} openFaqIndex={openFaqIndex} setOpenFaqIndex={setOpenFaqIndex} />
      </div>
    </div>
  );
}