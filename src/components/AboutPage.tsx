import React from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  Target,
  Code,
  Heart,
  Users,
  MessageCircle,
  Sparkles,
  FileSearch,
  Globe,
  Shield,
} from 'lucide-react';
import { useUI } from '../context/UIContext';
import { cn } from '../lib/utils';

/* ── Sub-components ──────────────────────────────────── */

function SectionBadge({ icon: Icon, colorClass, label }: { icon: React.ElementType; colorClass: string; label: string }) {
  return (
    <div className={cn('inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-black uppercase tracking-[0.12em]', colorClass)}>
      <Icon className="h-3.5 w-3.5" />
      {label}
    </div>
  );
}

type SectionCardProps = {
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  title: string;
  body: string;
  stat?: { value: string; label: string };
  reverse?: boolean;
};

function SectionCard({ icon: Icon, iconBg, iconColor, title, body, stat, reverse }: SectionCardProps) {
  return (
    <div className={cn('group relative flex flex-col gap-6 lg:flex-row lg:items-start', reverse && 'lg:flex-row-reverse')}>
      {/* Icon Column */}
      <div className="flex shrink-0 flex-col items-center">
        <div className={cn('relative flex h-14 w-14 items-center justify-center rounded-2xl border transition-all duration-500', iconBg, 'group-hover:scale-105 group-hover:shadow-lg')}>
          <Icon className={cn('h-6 w-6', iconColor)} />
          {/* Glow dot */}
          <div className={cn('pointer-events-none absolute -right-1.5 -top-1.5 h-3 w-3 rounded-full blur-sm', iconColor.replace('text-', 'bg-'))} />
        </div>
        {/* Vertical connector line */}
        <div className="mt-3 h-full min-h-[40px] w-px flex-1 bg-gradient-to-b from-white/10 via-accent/20 to-transparent" />
      </div>

      {/* Content Column */}
      <div className="min-w-0 flex-1 rounded-2xl p-6 transition-all duration-500 dark:glass dark:group-hover:border-white/[0.12] dark:group-hover:bg-white/[0.05] bg-surface border border-border hover:border-accent/20 lg:p-8">
        <h2 className="mb-3 font-sans text-lg font-extrabold tracking-tight text-text-main lg:text-xl">
          {title}
        </h2>
        <p className="text-sm leading-relaxed text-text-muted lg:text-base">{body}</p>

        {stat && (
          <div className="mt-5 flex items-center gap-3 border-t border-white/[0.06] pt-4">
            <span className="font-sans text-2xl font-black tracking-tight text-accent lg:text-3xl">
              {stat.value}
            </span>
            <span className="text-xs font-bold uppercase tracking-widest text-text-light">
              {stat.label}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Main Component ──────────────────────────────────── */

export function AboutPage({ onBack }: { onBack: () => void }) {
  const { t, setActiveTab, reportLanguage } = useUI();

  return (
    <div className="relative mx-auto max-w-5xl px-4 pt-28 pb-10 sm:px-6 sm:pt-32 sm:pb-16 lg:px-8 lg:pb-20">
      {/* ─── Breadcrumb ────────────────────────────────── */}
      <motion.nav
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="mb-10 flex items-center gap-2 text-xs font-bold text-text-light sm:mb-14"
      >
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 transition-colors dark:hover:bg-white/[0.05] hover:bg-surface-secondary hover:text-accent cursor-pointer"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t.aboutBackHome}
        </button>
        <span className="text-border-strong">/</span>
        <span className="text-text-muted">{t.aboutPageTitle}</span>
      </motion.nav>

      {/* ─── Hero ──────────────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.08, ease: 'easeOut' }}
        className="relative mb-16 overflow-hidden rounded-3xl border border-border bg-grid bg-white/60 dark:bg-transparent p-8 pb-0 sm:mb-24 sm:p-12 sm:pb-0 lg:p-16 lg:pb-0"
      >
        {/* Decorative accent glow behind heading */}
        <div className="pointer-events-none absolute right-0 top-0 h-80 w-80 translate-x-1/4 -translate-y-1/4 rounded-full bg-accent/5 blur-[100px]" />

        <div className="relative z-10 max-w-2xl pb-10 sm:pb-16 lg:pb-20">
          {/* Small badge */}
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/5 px-4 py-1.5">
            <FileSearch className="h-3.5 w-3.5 text-accent" />
            <span className="text-xs font-black uppercase tracking-[0.15em] text-accent">
              cvFit.pro
            </span>
          </div>

          <h1 className="mb-4 font-serif text-4xl font-extrabold leading-[1.05] tracking-tight text-text-main sm:text-5xl lg:text-6xl">
            {t.aboutHeroTitle}
            <span className="mt-2 block text-accent">—</span>
          </h1>

          <p className="max-w-lg text-base leading-relaxed text-text-muted sm:text-lg">
            {t.aboutHeroSub}
          </p>

          {/* Floating decorative stats */}
          <div className="mt-8 flex flex-wrap gap-4 sm:gap-6">
            <div className="flex items-center gap-2 rounded-xl border border-border dark:bg-white/[0.02] bg-surface-secondary px-4 py-2.5">
              <Globe className="h-4 w-4 text-accent/60" />
              <span className="text-xs font-bold text-text-light">Việt Nam</span>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-border dark:bg-white/[0.02] bg-surface-secondary px-4 py-2.5">
              <Shield className="h-4 w-4 text-accent/60" />
              <span className="text-xs font-bold text-text-light">Self-funded</span>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-accent/10 bg-accent/5 px-4 py-2.5">
              <Sparkles className="h-4 w-4 text-accent" />
              <span className="text-xs font-bold text-accent">50+ tiêu chí AI</span>
            </div>
          </div>
        </div>
      </motion.section>

      {/* ─── Sections ──────────────────────────────────── */}
      <div className="relative space-y-8 sm:space-y-12">
        <SectionCard
          icon={Target}
          iconBg="bg-accent/10 border-accent/20"
          iconColor="text-accent"
          title={t.aboutMissionTitle}
          body={t.aboutMissionBody}
          stat={{ value: '100%', label: 'Miễn phí' }}
        />

        <SectionCard
          icon={Heart}
          iconBg="bg-emerald-500/10 border-emerald-500/20"
          iconColor="text-emerald-400"
          title={t.aboutStoryTitle}
          body={t.aboutStoryBody}
          reverse
        />

        <SectionCard
          icon={Code}
          iconBg="bg-purple-500/10 border-purple-500/20"
          iconColor="text-purple-400"
          title={t.aboutTechTitle}
          body={t.aboutTechBody}
          stat={{ value: '50+', label: 'Tiêu chí phân tích' }}
        />

        <SectionCard
          icon={Users}
          iconBg="bg-blue-500/10 border-blue-500/20"
          iconColor="text-blue-400"
          title={t.aboutTeamTitle}
          body={t.aboutTeamBody}
          reverse
        />

        <SectionCard
          icon={MessageCircle}
          iconBg="bg-amber-500/10 border-amber-500/20"
          iconColor="text-amber-400"
          title={t.aboutContactTitle}
          body={t.aboutContactBody}
        />
      </div>

      {/* ─── CTA ───────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-40px' }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="relative mt-16 overflow-hidden rounded-3xl border border-accent/10 dark:bg-gradient-to-br dark:from-accent/5 dark:via-white/[0.02] dark:to-transparent bg-gradient-to-br from-accent/5 to-transparent p-8 text-center sm:mt-24 sm:p-12 lg:p-16"
      >
        {/* Decorative grid overlay */}
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-30 dark:opacity-30 opacity-10" />
        {/* Accent glow */}
        <div className="pointer-events-none absolute left-1/2 top-0 h-64 w-96 -translate-x-1/2 rounded-full bg-accent/8 blur-[120px]" />

        <div className="relative z-10">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            whileInView={{ scale: 1, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-accent/20 bg-accent/10"
          >
            <Sparkles className="h-7 w-7 text-accent" />
          </motion.div>

          <h2 className="mb-3 font-serif text-2xl font-extrabold tracking-tight text-text-main sm:text-3xl">
            {t.aboutHeroSub}
          </h2>
          <p className="mx-auto mb-8 max-w-md text-sm text-text-muted">
            Phân tích CV miễn phí, không cần đăng ký. Bắt đầu ngay hôm nay.
          </p>

          <a
            href={`/${reportLanguage}/`}
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('analyze');
              window.scrollTo(0, 0);
            }}
            className={cn(
              'btn-accent inline-flex items-center gap-2.5 rounded-xl px-8 py-3.5 text-sm font-extrabold',
              'cursor-pointer'
            )}
          >
            <Sparkles className="h-4 w-4" />
            {t.aboutCta}
          </a>
        </div>
      </motion.div>
    </div>
  );
}