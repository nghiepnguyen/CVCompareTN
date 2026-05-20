import React from 'react';
import { motion } from 'motion/react';
import type { LandingLabels } from './types';

export function StatsSection({ t }: { t: LandingLabels }) {
  return (
  <section className="relative w-full overflow-hidden bg-text-main py-24 text-white">
    <div className="absolute top-0 left-0 h-full w-full opacity-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,#4f46e5,transparent_50%)]" />
    </div>
    <div className="container relative z-10 mx-auto max-w-6xl px-4">
      <div className="grid grid-cols-1 gap-12 sm:grid-cols-3">
        {[
          { val: "35+", label: t.stats1 },
          { val: "98%", label: t.stats2 },
          { val: "2M+", label: t.stats3 }
        ].map((stat, i) => (
          <div key={i} className="text-center">
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              whileInView={{ scale: 1, opacity: 1 }}
              viewport={{ once: true }}
              className="font-sans text-6xl font-black tracking-tighter text-white"
            >
              {stat.val}
            </motion.div>
            <div className="mt-2 font-bold uppercase tracking-[0.2em] text-slate-500">{stat.label}</div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

}
