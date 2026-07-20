import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { AlertCircle, CheckCircle2, Zap } from 'lucide-react';
import { cn } from '../../../lib/utils';

/* ------------------------------------------------------------------ */
/* Product-authentic data-viz for the feature bento (light theme).    */
/* Sample values mirror the Demo section (Match 72% / ATS 81%, same   */
/* skill sets) so the page shows ONE consistent illustrative result,  */
/* not a scatter of invented numbers.                                  */
/* ------------------------------------------------------------------ */

const EASE = [0.16, 1, 0.3, 1] as const;

/* MatchRing — circular match-score gauge */
export function MatchRing({ value = 72, label }: { value?: number; label: string }) {
  const reduce = useReducedMotion();
  const r = 52;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - value / 100);

  return (
    <div className="relative h-36 w-36 shrink-0">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(15,23,42,0.06)" strokeWidth="9" />
        <motion.circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="url(#matchRingGrad)"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: reduce ? offset : c }}
          whileInView={{ strokeDashoffset: offset }}
          viewport={{ once: true }}
          transition={{ duration: 1.2, ease: EASE, delay: 0.2 }}
        />
        <defs>
          <linearGradient id="matchRingGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#059669" />
            <stop offset="100%" stopColor="#34D399" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-sans text-4xl font-black tabular-nums text-slate-900">{value}%</span>
        <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400">{label}</span>
      </div>
    </div>
  );
}

/* MeterStack — labeled horizontal score bars (scaleX-animated) */
export function MeterStack({ items }: { items: { label: string; value: number }[] }) {
  const reduce = useReducedMotion();
  return (
    <div className="w-full max-w-xs space-y-4">
      {items.map((m, i) => (
        <div key={m.label}>
          <div className="mb-1.5 flex items-center justify-between text-xs font-semibold">
            <span className="text-slate-500">{m.label}</span>
            <span className="tabular-nums text-slate-800">{m.value}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-900/[0.06]">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 origin-left"
              style={{ width: `${m.value}%` }}
              initial={{ scaleX: reduce ? 1 : 0 }}
              whileInView={{ scaleX: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.9, delay: 0.15 + i * 0.12, ease: EASE }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/* SkillChips — missing vs strong skill clusters */
export function SkillChips({ missing, strong }: { missing: string[]; strong: string[] }) {
  return (
    <div className="w-full max-w-xs space-y-4">
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-error">
          <AlertCircle className="h-3 w-3" strokeWidth={1.75} />
          Thiếu kỹ năng
        </p>
        <div className="flex flex-wrap gap-1.5">
          {missing.map((s) => (
            <span key={s} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">
              {s}
            </span>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-success">
          <CheckCircle2 className="h-3 w-3" strokeWidth={1.75} />
          Điểm mạnh
        </p>
        <div className="flex flex-wrap gap-1.5">
          {strong.map((s) => (
            <span key={s} className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
              {s}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ScoreCompare — "before vs after" match score (warning vs success tone) */
export function ScoreCompare() {
  const reduce = useReducedMotion();
  // illustrative before/after — the "after" mirrors the Demo section score
  const rows = [
    { label: 'CV chưa tối ưu', value: 34, good: false },
    { label: 'CV tối ưu với cvFit', value: 72, good: true },
  ];
  return (
    <div className="w-full max-w-xs space-y-4">
      {rows.map((m, i) => (
        <div key={m.label}>
          <div className="mb-1.5 flex items-center justify-between text-xs font-semibold">
            <span className="text-slate-500">{m.label}</span>
            <span className={cn('tabular-nums', m.good ? 'text-emerald-600' : 'text-amber-600')}>{m.value}%</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-900/[0.06]">
            <motion.div
              className={cn(
                'h-full origin-left rounded-full',
                m.good ? 'bg-gradient-to-r from-emerald-500 to-emerald-400' : 'bg-gradient-to-r from-amber-400 to-amber-500',
              )}
              style={{ width: `${m.value}%` }}
              initial={{ scaleX: reduce ? 1 : 0 }}
              whileInView={{ scaleX: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.9, delay: 0.15 + i * 0.18, ease: EASE }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/* SuggestionList — AI optimization suggestions with accent bullets */
export function SuggestionList({ items }: { items: string[] }) {
  const reduce = useReducedMotion();
  return (
    <ul className="w-full max-w-sm space-y-3">
      {items.map((it, i) => (
        <motion.li
          key={it}
          initial={{ opacity: reduce ? 1 : 0, x: reduce ? 0 : -10 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.15 + i * 0.1, ease: EASE }}
          className="flex items-start gap-3"
        >
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
            <Zap className="h-3 w-3" strokeWidth={1.75} />
          </span>
          <span className="text-sm font-medium leading-snug text-slate-600">{it}</span>
        </motion.li>
      ))}
    </ul>
  );
}
