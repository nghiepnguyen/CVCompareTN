import React, { useEffect, useRef, useState } from 'react';
import { motion, useInView, animate } from 'motion/react';
import { cn } from '../../../lib/utils';
import type { LucideIcon } from 'lucide-react';

/* ------------------------------------------------------------------ */
/* GlassCard — card with glass morphism effect                       */
/* ------------------------------------------------------------------ */
export function GlassCard({
  children,
  className,
  delay = 0,
  hover = true,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  hover?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.6, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={cn(
        'relative overflow-hidden rounded-2xl md:rounded-3xl',
        'bg-white/[0.03] backdrop-blur-2xl border border-white/[0.08]',
        'p-6 md:p-8 lg:p-10',
        hover && 'glass-hover cursor-pointer',
        className,
      )}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* FeatureIcon — icon inside a subtle gold-tinted container           */
/* ------------------------------------------------------------------ */
export function FeatureIcon({
  icon: Icon,
  size = 'md',
}: {
  icon: LucideIcon;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizeClasses = {
    sm: 'h-10 w-10 rounded-xl',
    md: 'h-12 w-12 md:h-14 md:w-14 rounded-2xl',
    lg: 'h-16 w-16 rounded-2xl',
  };
  const iconSize = { sm: 'h-5 w-5', md: 'h-6 w-6 md:h-7 md:w-7', lg: 'h-8 w-8' };

  return (
    <div
      className={cn(
        'mb-5 flex items-center justify-center shrink-0',
        'bg-accent/10 border border-accent/20 text-accent',
        'group-hover:bg-accent/15 group-hover:border-accent/30 transition-colors duration-500',
        sizeClasses[size],
      )}
    >
      <Icon className={iconSize[size]} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* SectionBadge — small badge/label above section heading             */
/* ------------------------------------------------------------------ */
export function SectionBadge({
  icon: Icon,
  children,
}: {
  icon?: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.15em] text-accent backdrop-blur-md mb-6"
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      <span>{children}</span>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* SectionHeading — large heading with optional gold accent line       */
/* ------------------------------------------------------------------ */
export function SectionHeading({
  children,
  className,
  as: Tag = 'h2',
  goldLine = false,
}: {
  children: React.ReactNode;
  className?: string;
  as?: 'h1' | 'h2' | 'h3';
  goldLine?: boolean;
}) {
  return (
    <div className="mb-14 md:mb-20 text-center">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] }}
      >
        <Tag
          className={cn(
            'font-serif text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-text-main',
            className,
          )}
        >
          {children}
        </Tag>
        {goldLine && (
          <div className="mt-6 mx-auto h-px w-24 bg-gradient-to-r from-transparent via-accent to-transparent" />
        )}
      </motion.div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* AccentButton — primary CTA button with green gradient              */
/* ------------------------------------------------------------------ */
export function AccentButton({
  children,
  onClick,
  className,
  href,
  target,
  rel,
  icon: Icon,
  iconPosition = 'right',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  href?: string;
  target?: string;
  rel?: string;
  icon?: LucideIcon;
  iconPosition?: 'left' | 'right';
}) {
  const content = (
    <>
      {Icon && iconPosition === 'left' && <Icon className="h-5 w-5" />}
      <span>{children}</span>
      {Icon && iconPosition === 'right' && <Icon className="h-5 w-5 transition-transform group-hover:translate-x-1" />}
    </>
  );

  const baseClasses = cn(
    'group relative inline-flex h-14 md:h-16 items-center justify-center gap-3 rounded-2xl px-8 md:px-10 font-sans text-base font-bold',
    'btn-accent cursor-pointer',
    className,
  );

  if (href) {
    return (
      <a href={href} target={target} rel={rel} className={baseClasses}>
        {content}
      </a>
    );
  }

  return (
    <button onClick={onClick} className={baseClasses}>
      {content}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* OutlineButton — secondary button with glass outline               */
/* ------------------------------------------------------------------ */
export function OutlineButton({
  children,
  onClick,
  className,
  href,
  target,
  rel,
  icon: Icon,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  href?: string;
  target?: string;
  rel?: string;
  icon?: LucideIcon;
}) {
  const content = (
    <>
      <span>{children}</span>
      {Icon && <Icon className="h-5 w-5 shrink-0 transition-transform group-hover:translate-x-1" />}
    </>
  );

  const baseClasses = cn(
    'group relative inline-flex h-14 md:h-16 items-center justify-center gap-3 rounded-2xl px-8 md:px-10 font-sans text-base font-semibold',
    'btn-outline cursor-pointer',
    className,
  );

  if (href) {
    return (
      <a href={href} target={target} rel={rel} className={baseClasses}>
        {content}
      </a>
    );
  }

  return (
    <button onClick={onClick} className={baseClasses}>
      {content}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* AnimatedCounter — counting up number animation                     */
/* ------------------------------------------------------------------ */
export function AnimatedCounter({
  value,
  suffix = '',
  duration = 2000,
}: {
  value: string;
  suffix?: string;
  duration?: number;
}) {
  const numericPart = value.replace(/[^0-9.]/g, '');
  const prefix = value.replace(numericPart, '');
  const target = parseFloat(numericPart);
  const [displayValue, setDisplayValue] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });

  useEffect(() => {
    if (!isInView) return;
    const controls = animate(0, target, {
      duration: duration / 1000,
      ease: [0.25, 0.46, 0.45, 0.94],
      delay: 0.3,
      onUpdate: (latest) => setDisplayValue(Math.round(latest)),
    });
    return () => controls.stop();
  }, [isInView, target, duration]);

  return (
    <motion.span
      ref={ref}
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      className="font-serif text-5xl sm:text-6xl md:text-7xl font-black tracking-tighter text-white"
    >
      {prefix}{displayValue}{suffix}
    </motion.span>
  );
}
