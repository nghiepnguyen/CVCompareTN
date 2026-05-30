import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, HelpCircle } from 'lucide-react';
import { cn } from '../../../lib/utils';
import type { LandingLabels } from './types';
import { SectionHeading, SectionBadge } from './shared';

export function FaqSection({
  t,
  openFaqIndex,
  setOpenFaqIndex,
}: {
  t: LandingLabels;
  openFaqIndex: number | null;
  setOpenFaqIndex: React.Dispatch<React.SetStateAction<number | null>>;
}) {
  return (
    <section className="relative w-full section-padding overflow-hidden">
      {/* Background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full bg-accent/2 blur-[180px]" />
      </div>

      <div className="container-premium relative z-10 max-w-3xl">
        <div className="text-center mb-14">
          <SectionBadge icon={HelpCircle}>{t.badgeFaq}</SectionBadge>
        </div>
        <SectionHeading goldLine>{t.faqTitle}</SectionHeading>

        <div className="space-y-4">
          {t.faqItems.map((item: any, index: number) => (
            <motion.div
              layout
              key={index}
              className="group overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.01] backdrop-blur-sm transition-all duration-500 hover:border-accent/20"
            >
              <button
                onClick={() => setOpenFaqIndex(openFaqIndex === index ? null : index)}
                className="flex w-full items-center justify-between p-6 md:p-7 text-left transition-colors focus:outline-none cursor-pointer"
              >
                <span className="font-sans text-sm md:text-base font-semibold text-text-main pr-4 leading-snug">
                  {item.q}
                </span>
                <div
                  className={cn(
                    'flex h-8 w-8 md:h-10 md:w-10 shrink-0 items-center justify-center rounded-full transition-all duration-500',
                    openFaqIndex === index
                      ? 'rotate-180 bg-accent/15 text-accent border border-accent/20'
                      : 'bg-white/[0.03] text-text-light border border-white/[0.05]',
                  )}
                >
                  <ChevronDown className="h-4 w-4 md:h-5 md:w-5" />
                </div>
              </button>
              <AnimatePresence initial={false}>
                {openFaqIndex === index && (
                  <motion.div
                    key="content"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] }}
                  >
                    <div className="px-7 pb-7 text-text-muted leading-relaxed whitespace-pre-line border-t border-white/[0.04] pt-6 text-sm">
                      {item.a}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}