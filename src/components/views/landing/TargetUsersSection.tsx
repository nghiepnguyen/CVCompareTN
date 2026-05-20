import React from 'react';
import { motion } from 'motion/react';
import { GraduationCap, Search, Users, Globe, FileCheck } from 'lucide-react';
import { cn } from '../../../lib/utils';
import type { LandingLabels } from './types';

export function TargetUsersSection({ t }: { t: LandingLabels }) {
  return (
  <section className="w-full py-32">
    <div className="container mx-auto max-w-6xl px-4">
      <div className="mb-20 text-center">
        <h2 className="font-sans text-4xl font-extrabold tracking-tight text-text-main sm:text-5xl">
          {t.targetUsersTitle}
        </h2>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:flex sm:flex-wrap sm:justify-center md:gap-6">
        {[
          { label: t.targetUsersItem1, icon: GraduationCap },
          { label: t.targetUsersItem2, icon: Search },
          { label: t.targetUsersItem3, icon: Users },
          { label: t.targetUsersItem4, icon: Globe },
          { label: t.targetUsersItem5, icon: FileCheck },
        ].map((item, index) => (
          <motion.div
            key={index}
            whileHover={{ y: -5 }}
            className={cn(
              "flex flex-col items-center gap-4 rounded-2xl md:rounded-3xl border border-border bg-surface p-6 md:px-8 md:py-10 text-center transition-all hover:border-accent/30 hover:shadow-xl hover:shadow-accent/5 cursor-default",
              index === 4 && "col-span-2 sm:col-span-1"
            )}
          >
            <div className="flex h-12 w-12 md:h-16 md:w-16 items-center justify-center rounded-xl md:rounded-2xl bg-surface-secondary text-accent">
              <item.icon className="h-6 w-6 md:h-8 md:w-8" />
            </div>
            <p className="font-sans text-sm md:text-lg font-bold text-text-main leading-tight">{item.label}</p>
          </motion.div>
        ))}
      </div>
    </div>
  </section>
);

}
