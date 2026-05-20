import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../../lib/utils';
import type { LandingLabels } from './types';

export function FaqSection({ t, openFaqIndex, setOpenFaqIndex }: { t: LandingLabels; openFaqIndex: number | null; setOpenFaqIndex: React.Dispatch<React.SetStateAction<number | null>> }) {
  return (
  <section className="w-full border-t border-border bg-surface py-32">
    <div className="container mx-auto max-w-3xl px-4">
      <div className="mb-20 text-center">
        <h2 className="font-sans text-4xl font-extrabold tracking-tight text-text-main">{t.faqTitle}</h2>
      </div>

      <div className="space-y-6">
        {t.faqItems.map((item: any, index: number) => (
          <motion.div
            layout
            key={index}
            className="group overflow-hidden rounded-[2rem] border border-border transition-all hover:border-accent/40"
          >
            <button
              onClick={() => setOpenFaqIndex(openFaqIndex === index ? null : index)}
              className="flex w-full items-center justify-between p-6 md:p-8 text-left transition-colors focus:outline-none group-hover:bg-accent-light/20 cursor-pointer"
            >
              <span className="font-sans text-base md:text-lg font-bold text-text-main pr-4">{item.q}</span>
              <div className={cn(
                "flex h-8 w-8 md:h-10 md:w-10 shrink-0 items-center justify-center rounded-full transition-all duration-500",
                openFaqIndex === index ? "rotate-180 bg-accent text-white" : "bg-surface-secondary text-text-light"
              )}>
                <ChevronDown className="h-5 w-5 md:h-6 md:w-6" />
              </div>
            </button>
            <AnimatePresence initial={false}>
              {openFaqIndex === index && (
                <motion.div
                  key="content"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] }}
                >
                  <div className="px-8 pb-8 text-text-muted leading-relaxed whitespace-pre-line border-t border-surface-secondary pt-6">
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
