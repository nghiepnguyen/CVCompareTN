import React from 'react';
import { motion } from 'motion/react';
import { cn } from '../../../lib/utils';
import type { LucideIcon } from 'lucide-react';

export function BentoCard({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay }}
      className={cn(
        'relative overflow-hidden rounded-[1.5rem] md:rounded-[2rem] border border-border bg-surface/80 p-6 md:p-8 backdrop-blur-xl transition-all hover:border-accent/30 hover:shadow-2xl hover:shadow-accent/5',
        className
      )}
    >
      {children}
    </motion.div>
  );
}

export function FeatureIcon({
  icon: Icon,
  color = 'primary',
}: {
  icon: LucideIcon;
  color?: string;
}) {
  return (
    <div
      className={cn(
        'mb-6 flex h-14 w-14 items-center justify-center rounded-2xl shadow-sm',
        color === 'primary' ? 'bg-accent-light text-accent' : 'bg-accent-light text-accent'
      )}
    >
      <Icon className="h-7 w-7" />
    </div>
  );
}
