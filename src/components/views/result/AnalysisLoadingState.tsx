import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Check, FileSearch, FileText, Scale, BarChart4, X, Loader2 } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { useUI } from '../../../context/UIContext';
import { formatLabel } from '../../../translations';
import type { BatchFileProgress } from '../../../context/analysis/types';

interface AnalysisLoadingStateProps {
  analysisStatus: string | null;
  analysisProgress: number;
  batchFiles?: BatchFileProgress[];
}

const STEPS = [
  { step: 1, labelKey: 'loadingStepReadCv', min: 15, icon: FileText },
  { step: 2, labelKey: 'loadingStepAnalyze', min: 38, icon: FileSearch },
  { step: 3, labelKey: 'loadingStepMatch', min: 68, icon: Scale },
  { step: 4, labelKey: 'loadingStepReport', min: 95, icon: BarChart4 },
] as const;

export function AnalysisLoadingState({ analysisStatus, analysisProgress, batchFiles = [] }: AnalysisLoadingStateProps) {
  const { t } = useUI();
  const progressRounded = Math.round(analysisProgress);
  const isBatch = batchFiles.length > 1;
  const batchDoneCount = batchFiles.filter((f) => f.status === 'done' || f.status === 'error').length;

  const estLabel =
    analysisProgress < 15
      ? formatLabel(t.progressEstLeft, { seconds: Math.max(1, Math.round((15 - analysisProgress) * 0.3)) })
      : analysisProgress >= 95
        ? formatLabel(t.progressEstLeft, { seconds: Math.max(0, Math.round((100 - analysisProgress) * 0.15)) })
        : t.progressEstLeftApprox;

  // Pulse the spinner ring relative to progress
  const pulseScale = 1 + 0.03 * Math.sin((analysisProgress / 100) * Math.PI);

  return (
    <motion.div
      key="loading"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="relative flex min-h-[520px] w-full max-w-2xl mx-auto flex-col items-center justify-center overflow-hidden rounded-3xl border border-white/[0.06] bg-surface px-6 py-12 text-center sm:px-10 sm:py-16"
    >
      {/* Background grid texture */}
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-40" />
      {/* Top accent glow */}
      <div className="pointer-events-none absolute left-1/2 top-0 h-72 w-96 -translate-x-1/2 rounded-full bg-accent/4 blur-[120px]" />

      {/* ── Spinner ────────────────────────────────── */}
      <div className="relative z-10 mb-10">
        {/* Outer ring */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }}
          className="relative h-28 w-28 sm:h-32 sm:w-32"
        >
          {/* Track ring */}
          <svg className="absolute inset-0 -rotate-90" viewBox="0 0 128 128">
            <circle
              cx="64"
              cy="64"
              r="56"
              fill="none"
              stroke="rgba(255,255,255,0.04)"
              strokeWidth="6"
            />
            {/* Progress arc */}
            <motion.circle
              cx="64"
              cy="64"
              r="56"
              fill="none"
              stroke="currentColor"
              strokeWidth="6"
              strokeLinecap="round"
              className="text-accent"
              strokeDasharray={`${2 * Math.PI * 56}`}
              animate={{
                strokeDashoffset: (2 * Math.PI * 56) * (1 - analysisProgress / 100),
              }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          </svg>

          {/* Center icon with pulse */}
          <motion.div
            animate={{ scale: [1, pulseScale, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-accent/20 bg-accent/10 sm:h-16 sm:w-16">
              <Sparkles className="h-6 w-6 text-accent sm:h-7 sm:w-7" />
            </div>
          </motion.div>
        </motion.div>

        {/* Scan-line effect */}
        <motion.div
          animate={{ top: ['0%', '100%'] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-accent/40 to-transparent blur-[1px]"
        />
      </div>

      {/* ── Status & Progress ──────────────────────── */}
      <div className="relative z-10 w-full max-w-md">
        <div className="mb-6 flex items-end justify-between">
          <div className="text-left">
            <h3 className="font-sans text-lg font-extrabold text-text-main sm:text-xl">
              {analysisStatus || t.aiThinking}
            </h3>
            <p className="mt-1 text-[10px] font-black uppercase tracking-[0.2em] text-text-light">
              {t.analysisProgress}
            </p>
          </div>
          {/* Percentage badge */}
          <div className="flex items-center gap-1 rounded-xl border border-accent/20 bg-accent/5 px-3 py-1.5">
            <span className="font-sans text-2xl font-black tabular-nums leading-none text-accent sm:text-3xl">
              {progressRounded}
            </span>
            <span className="text-xs font-bold text-accent/60">%</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="relative mb-4 h-2.5 w-full overflow-hidden rounded-full bg-white/[0.04] ring-1 ring-white/[0.06]">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-accent via-emerald-400 to-accent bg-[length:200%_100%]"
            animate={{
              width: `${analysisProgress}%`,
              backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
            }}
            transition={{
              width: { duration: 0.5, ease: 'easeOut' },
              backgroundPosition: { duration: 2, repeat: Infinity, ease: 'linear' },
            }}
          />
          {/* Shimmer overlay */}
          <div className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        </div>

        {/* Labels below bar */}
        <div className="flex justify-between px-0.5 text-[10px] font-black uppercase tracking-[0.15em] text-text-light">
          <span>{t.progressStart}</span>
          <span>{estLabel}</span>
          <span>{t.progressDone}</span>
        </div>
      </div>

      {/* ── Batch File Checklist ───────────────────── */}
      {isBatch ? (
        <div className="relative z-10 mt-10 w-full max-w-md">
          <div className="mb-3 flex items-center justify-end text-[10px] font-black tracking-[0.15em] text-text-light">
            <span className="tabular-nums">{batchDoneCount}/{batchFiles.length}</span>
          </div>
          <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1 scrollbar-hide no-scrollbar">
            <AnimatePresence initial={false}>
              {batchFiles.map((f, i) => (
                <motion.div
                  key={f.name + i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(i * 0.03, 0.3) }}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border px-3 py-2 transition-colors duration-300',
                    f.status === 'done'
                      ? 'border-accent/20 bg-accent/5'
                      : f.status === 'error'
                        ? 'border-red-500/20 bg-red-500/5'
                        : f.status === 'processing'
                          ? 'border-accent/15 bg-accent/[0.03]'
                          : 'border-white/[0.06] bg-white/[0.02]'
                  )}
                >
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center">
                    {f.status === 'done' && <Check className="h-4 w-4 text-accent" />}
                    {f.status === 'error' && <X className="h-4 w-4 text-red-400" />}
                    {f.status === 'processing' && (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      >
                        <Loader2 className="h-4 w-4 text-accent" />
                      </motion.div>
                    )}
                    {f.status === 'pending' && (
                      <span className="h-1.5 w-1.5 rounded-full bg-text-light/40" />
                    )}
                  </div>
                  <span
                    className={cn(
                      'truncate text-xs font-bold',
                      f.status === 'pending' ? 'text-text-light' : 'text-text-main'
                    )}
                  >
                    {f.name}
                  </span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      ) : (
      <div className="relative z-10 mt-10 grid w-full max-w-lg grid-cols-4 gap-3 sm:gap-4">
        {STEPS.map((s) => {
          const isComplete = analysisProgress >= s.min;
          const isActive = !isComplete && analysisProgress >= s.min - 25;
          const Icon = s.icon;

          return (
            <div key={s.step} className="flex flex-col items-center gap-2.5">
              {/* Step circle */}
              <div
                className={cn(
                  'relative flex h-10 w-10 items-center justify-center rounded-xl border transition-all duration-500 sm:h-11 sm:w-11',
                  isComplete
                    ? 'border-accent/30 bg-accent/10 shadow-[0_0_16px_rgba(5,150,105,0.15)]'
                    : isActive
                      ? 'border-accent/15 bg-accent/5 shadow-[0_0_8px_rgba(5,150,105,0.08)]'
                      : 'border-white/[0.06] bg-white/[0.02]'
                )}
              >
                <motion.div
                  key={isComplete ? 'check' : s.step}
                  initial={{ scale: 0, rotate: -90 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                >
                  {isComplete ? (
                    <Check className="h-4 w-4 text-accent sm:h-5 sm:w-5" />
                  ) : (
                    <Icon
                      className={cn(
                        'h-4 w-4 sm:h-5 sm:w-5',
                        isActive ? 'text-accent/70' : 'text-text-light'
                      )}
                    />
                  )}
                </motion.div>

                {/* Glow dot for active step */}
                {isActive && !isComplete && (
                  <motion.div
                    animate={{ scale: [1, 1.4, 1], opacity: [0.6, 1, 0.6] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                    className="pointer-events-none absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-accent blur-[2px]"
                  />
                )}
              </div>

              {/* Label */}
              <span
                className={cn(
                  'text-[9px] font-bold uppercase leading-tight tracking-tight text-center',
                  isComplete
                    ? 'text-accent'
                    : isActive
                      ? 'text-text-muted'
                      : 'text-text-light'
                )}
              >
                {t[s.labelKey] || s.labelKey}
              </span>
            </div>
          );
        })}
      </div>
      )}
    </motion.div>
  );
}