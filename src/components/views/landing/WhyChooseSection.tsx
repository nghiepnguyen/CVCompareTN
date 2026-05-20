import React from 'react';
import { motion } from 'motion/react';
import { Target, ShieldCheck, Brain, BarChart3, Key, TrendingUp, FileCheck, Download } from 'lucide-react';
import type { LandingLabels } from './types';

export function WhyChooseSection({ t }: { t: LandingLabels }) {
  return (
  <section className="w-full bg-text-main py-32 text-white">
    <div className="container mx-auto max-w-6xl px-4">
      <div className="mb-24 flex flex-col items-end justify-between gap-8 md:flex-row md:items-center">
        <div className="max-w-2xl">
          <h2 className="font-sans text-4xl font-extrabold tracking-tight sm:text-6xl text-white">
            {t.whyTitle}
          </h2>
        </div>
        <div className="h-1 w-24 bg-accent" />
      </div>

      <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: Target, title: t.feature1Title, desc: t.feature1Desc },
          { icon: ShieldCheck, title: t.feature2Title, desc: t.feature2Desc },
          { icon: Brain, title: t.feature3Title, desc: t.feature3Desc },
          { icon: BarChart3, title: t.feature4Title, desc: t.feature4Desc },
          { icon: Key, title: t.feature5Title, desc: t.feature5Desc },
          { icon: TrendingUp, title: t.feature6Title, desc: t.feature6Desc },
          { icon: FileCheck, title: t.feature7Title, desc: t.feature7Desc },
          { icon: Download, title: t.feature8Title, desc: t.feature8Desc }
        ].map((item, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.05 }}
            className="group"
          >
            <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-white/5 text-accent transition-colors group-hover:bg-accent group-hover:text-white">
              <item.icon className="h-6 w-6" />
            </div>
            <h4 className="mb-4 font-sans text-xl font-bold leading-snug">{item.title}</h4>
            <p className="text-sm leading-relaxed text-slate-400 group-hover:text-slate-300">{item.desc}</p>
          </motion.div>
        ))}
      </div>
    </div>
  </section>
);

}
