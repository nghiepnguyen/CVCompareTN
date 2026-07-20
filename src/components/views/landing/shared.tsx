import React, { useEffect, useRef, useState } from 'react';
import { motion, useInView, animate } from 'motion/react';
import { cn } from '../../../lib/utils';
import type { LucideIcon } from 'lucide-react';

export type SectionTheme = 'dark' | 'light';

/* ------------------------------------------------------------------ */
/* GlassCard — card with glass morphism effect                       */
/* ------------------------------------------------------------------ */
export function GlassCard({
  children,
  className,
  delay = 0,
  hover = true,
  theme = 'dark',
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  hover?: boolean;
  theme?: SectionTheme;
}) {
  const isLight = theme === 'light';
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        'relative overflow-hidden rounded-[1.75rem] md:rounded-[2rem] p-6 md:p-8 lg:p-10',
        'transition-[transform,box-shadow,border-color] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]',
        isLight
          ? 'glass-card-light group glass-card-light-hover shadow-[inset_0_1px_0_0_rgba(255,255,255,0.9)]'
          : 'bg-white/[0.03] backdrop-blur-2xl border border-white/[0.08] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]',
        !isLight && hover && 'glass-hover cursor-pointer',
        isLight && hover && 'cursor-pointer',
        className,
      )}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* FeatureIcon — icon inside a subtle accent-tinted container         */
/* ------------------------------------------------------------------ */
export function FeatureIcon({
  icon: Icon,
  size = 'md',
  theme = 'dark',
}: {
  icon: LucideIcon;
  size?: 'sm' | 'md' | 'lg';
  theme?: SectionTheme;
}) {
  const shellClasses = {
    sm: 'h-12 w-12 rounded-[1.1rem] p-1',
    md: 'h-14 w-14 md:h-16 md:w-16 rounded-[1.35rem] p-1',
    lg: 'h-[4.5rem] w-[4.5rem] rounded-[1.6rem] p-1',
  };
  const coreClasses = {
    sm: 'rounded-[0.85rem]',
    md: 'rounded-[1.1rem]',
    lg: 'rounded-[1.35rem]',
  };
  const iconSize = { sm: 'h-5 w-5', md: 'h-6 w-6 md:h-7 md:w-7', lg: 'h-8 w-8' };
  const isLight = theme === 'light';

  return (
    <div
      className={cn(
        'mb-5 shrink-0 transition-colors duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]',
        isLight ? 'bg-slate-900/[0.04]' : 'bg-white/[0.06]',
        shellClasses[size],
      )}
    >
      <div
        className={cn(
          'flex h-full w-full items-center justify-center transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]',
          isLight
            ? 'feature-icon-light group-hover:bg-accent/15 group-hover:border-accent/30'
            : 'bg-accent/10 border border-accent/20 text-accent shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] group-hover:bg-accent/15 group-hover:border-accent/30',
          coreClasses[size],
        )}
      >
        <Icon className={iconSize[size]} strokeWidth={1.5} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* SectionBadge — small badge/label above section heading             */
/* ------------------------------------------------------------------ */
export function SectionBadge({
  icon: Icon,
  children,
  theme = 'dark',
}: {
  icon?: LucideIcon;
  children: React.ReactNode;
  theme?: SectionTheme;
}) {
  const isLight = theme === 'light';
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        'inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] backdrop-blur-md mb-6',
        isLight
          ? 'badge-light'
          : 'border border-accent/20 bg-accent/5 text-accent',
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5" strokeWidth={1.5} />}
      <span>{children}</span>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* SectionHeading — large heading with optional accent line           */
/* ------------------------------------------------------------------ */
export function SectionHeading({
  children,
  className,
  as: Tag = 'h2',
  goldLine = false,
  theme = 'dark',
  align = 'center',
}: {
  children: React.ReactNode;
  className?: string;
  as?: 'h1' | 'h2' | 'h3';
  goldLine?: boolean;
  theme?: SectionTheme;
  align?: 'center' | 'left';
}) {
  const isLight = theme === 'light';
  const isLeft = align === 'left';
  return (
    <div className={cn('mb-14 md:mb-20', isLeft ? 'text-left' : 'text-center')}>
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      >
        <Tag
          className={cn(
            'font-serif text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight',
            isLight ? 'text-slate-900' : 'text-text-main',
            className,
          )}
        >
          {children}
        </Tag>
        {goldLine && (
          <div
            className={cn(
              'mt-6 h-px w-24',
              isLeft ? 'ml-0' : 'mx-auto',
              isLight
                ? 'gold-line-light'
                : 'bg-gradient-to-r from-transparent via-accent to-transparent',
            )}
          />
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
  const iconBubble = Icon && (
    <span
      className={cn(
        'flex h-9 w-9 md:h-10 md:w-10 shrink-0 items-center justify-center rounded-full bg-white/15 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]',
        'group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:scale-105 group-hover:bg-white/25',
      )}
    >
      <Icon className="h-4 w-4 md:h-[18px] md:w-[18px]" strokeWidth={1.75} />
    </span>
  );

  const content = (
    <>
      {iconPosition === 'left' && iconBubble}
      <span>{children}</span>
      {iconPosition === 'right' && iconBubble}
    </>
  );

  const baseClasses = cn(
    'group relative inline-flex h-14 md:h-16 items-center justify-center gap-3 rounded-full font-sans text-base font-bold',
    Icon
      ? iconPosition === 'right'
        ? 'pl-8 pr-2 md:pl-10 md:pr-2.5'
        : 'pr-8 pl-2 md:pr-10 md:pl-2.5'
      : 'px-8 md:px-10',
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
  theme = 'dark',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  href?: string;
  target?: string;
  rel?: string;
  icon?: LucideIcon;
  theme?: SectionTheme;
}) {
  const isLight = theme === 'light';
  const content = (
    <>
      <span>{children}</span>
      {Icon && (
        <span
          className={cn(
            'flex h-9 w-9 md:h-10 md:w-10 shrink-0 items-center justify-center rounded-full transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]',
            'group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:scale-105',
            isLight ? 'bg-slate-900/5 group-hover:bg-accent/10' : 'bg-white/10 group-hover:bg-accent/15',
          )}
        >
          <Icon className="h-4 w-4 md:h-[18px] md:w-[18px]" strokeWidth={1.75} />
        </span>
      )}
    </>
  );

  const baseClasses = cn(
    'group relative inline-flex h-14 md:h-16 items-center justify-center gap-3 rounded-full font-sans text-base font-semibold',
    Icon ? 'pl-8 pr-2 md:pl-10 md:pr-2.5' : 'px-8 md:px-10',
    isLight ? 'btn-outline-light' : 'btn-outline',
    'cursor-pointer',
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
  theme = 'dark',
}: {
  value: string;
  suffix?: string;
  duration?: number;
  theme?: SectionTheme;
}) {
  const numericPart = value.replace(/[^0-9.]/g, '');
  const prefix = value.replace(numericPart, '');
  const target = parseFloat(numericPart);
  const [displayValue, setDisplayValue] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });
  const isLight = theme === 'light';

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
      className={cn(
        'font-serif text-5xl sm:text-6xl md:text-7xl font-black tracking-tighter',
        isLight ? 'text-accent' : 'text-white',
      )}
    >
      {prefix}{displayValue}{suffix}
    </motion.span>
  );
}