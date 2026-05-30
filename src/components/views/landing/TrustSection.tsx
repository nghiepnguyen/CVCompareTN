import React from 'react';
import { motion } from 'motion/react';
import type { LandingLabels } from './types';

export function TrustSection({ t }: { t: LandingLabels }) {
  const experts = [
    { name: 'VietnamWorks', url: 'https://www.vietnamworks.com/' },
    { name: 'ITviec', url: 'https://itviec.com/' },
    { name: 'TopCV', url: 'https://www.topcv.vn/' },
    { name: 'CareerViet', url: 'https://careerviet.vn/' },
    { name: 'Việc Làm 24h', url: 'https://vieclam24h.vn/' },
    { name: 'LinkedIn', url: 'https://www.linkedin.com/' },
  ];

  return (
    <section className="relative w-full border-y border-white/[0.06] py-10 overflow-hidden">
      <div className="container-premium">
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-8 text-center text-xs font-semibold uppercase tracking-[0.2em] text-text-light/60"
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
              <span className="font-sans text-lg md:text-xl font-bold italic tracking-tight text-text-light/40 transition-all duration-500 group-hover:text-accent group-hover:scale-110 inline-block">
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