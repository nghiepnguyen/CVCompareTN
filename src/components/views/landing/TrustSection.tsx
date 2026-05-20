import React from 'react';
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
    <section className="w-full border-y border-border bg-surface-secondary/50 py-12 backdrop-blur-sm">
      <div className="container mx-auto px-4">
        <p className="mb-8 text-center text-xs font-black uppercase tracking-[0.2em] text-text-light">
          {t.trustedBy}
        </p>
        <div className="flex flex-wrap justify-center items-center gap-8 md:gap-16">
          {experts.map((expert) => (
            <a
              key={expert.name}
              href={expert.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative cursor-pointer hover:scale-105 active:scale-95"
            >
              <span className="font-sans text-xl md:text-2xl font-black italic tracking-tighter text-text-light transition-all duration-300 group-hover:text-text-main group-hover:scale-110 block">
                {expert.name}
              </span>
              <div className="absolute -bottom-1 left-0 h-0.5 w-0 bg-accent transition-all duration-300 group-hover:w-full" />
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
