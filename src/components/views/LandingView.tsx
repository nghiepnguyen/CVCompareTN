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
  const opacity = useTransform(scrollYProgress, [0, 0.2], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.2], [1, 0.95]);

  return (
    <div className="relative flex w-full flex-col items-center overflow-hidden bg-surface-secondary font-body">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-[10%] -left-[10%] h-[40%] w-[40%] rounded-full bg-accent/10 blur-[120px]" />
        <div className="absolute top-[20%] -right-[5%] h-[30%] w-[30%] rounded-full bg-accent/10 blur-[100px]" />
        <div className="absolute bottom-[10%] left-[20%] h-[25%] w-[25%] rounded-full bg-accent/10 blur-[80px]" />
      </div>

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
  );
}
