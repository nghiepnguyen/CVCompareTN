import React from 'react';
import { motion } from 'motion/react';
import { cn } from '../../../lib/utils';
import type { LandingLabels } from './types';
import type { SectionTheme } from './shared';

export function TrustSection({ t, theme = 'dark' }: { t: LandingLabels; theme?: SectionTheme }) {
  const isLight = theme === 'light';
  const experts = [
    { name: 'VietnamWorks', url: 'https://www.vietnamworks.com/' },
    { name: 'ITviec', url: 'https://itviec.com/' },
    { name: 'TopCV', url: 'https://www.topcv.vn/' },
    { name: 'CareerViet', url: 'https://careerviet.vn/' },
    { name: 'Việc Làm 24h', url: 'https://vieclam24h.vn/' },
    { name: 'LinkedIn', url: 'https://www.linkedin.com/' },
  ];

  return (
    <section
      className={cn(
        'relative w-full py-10 overflow-hidden',
        isLight
          ? 'border-y border-slate-200 bg-white'
          : 'border-y border-white/[0.06]',
      )}
    >
      <div className="container-premium">
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className={cn(
            'mb-8 text-center text-xs font-semibold uppercase tracking-[0.2em]',
            isLight ? 'text-slate-400' : 'text-text-light/60',
          )}
        >
          {t.trustedBy}
        </motion.p>
        <div className="flex flex-wrap justify-center items-center gap-x-10 gap-y-6 md:gap-x-20">
          {experts.map((expert) => (
            <a
              key={expert.name}
              href={expert.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative cursor-pointer"
            >
              <span
                className={cn(
                  'font-sans text-lg md:text-xl font-bold italic tracking-tight transition-all duration-500 group-hover:scale-110 inline-block',
                  isLight
                    ? 'text-slate-400 group-hover:text-accent'
                    : 'text-text-light/40 group-hover:text-accent',
                )}
              >
                {expert.name}
              </span>
              <div className="absolute -bottom-1 left-0 h-px w-0 bg-gradient-to-r from-accent to-accent-light transition-all duration-500 group-hover:w-full" />
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}