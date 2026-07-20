import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Brain, CheckCircle2, UploadCloud } from 'lucide-react';
import { cn } from '../../../lib/utils';

/* ------------------------------------------------------------------ */
/* Diagrammatic mini-visuals for the "how it works" process cards.    */
/* These are stylized affordance diagrams (dropzone, pasted-text,     */
/* scan, mini-report), NOT fake product screenshots.                   */
/* ------------------------------------------------------------------ */

const TILE = 'relative flex h-28 w-full overflow-hidden rounded-2xl border border-slate-100 bg-slate-50';

/* Step 1 — upload dropzone */
export function UploadTile() {
  return (
    <div className={cn(TILE, 'flex-col items-center justify-center gap-2 border-dashed border-slate-300')}>
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
        <UploadCloud className="h-5 w-5" strokeWidth={1.5} />
      </div>
      <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400">PDF · DOCX · PNG</span>
    </div>
  );
}

/* Step 2 — pasted JD text lines */
export function PasteTile() {
  const lines = ['w-11/12', 'w-full', 'w-4/5', 'w-full', 'w-2/3'];
  return (
    <div className={cn(TILE, 'flex-col justify-center gap-2 px-5')}>
      {lines.map((w, i) => (
        <div key={i} className={cn('h-2 rounded-full', w, i === 0 ? 'bg-slate-300' : 'bg-slate-200')} />
      ))}
    </div>
  );
}

/* Step 3 — AI scanning the document */
export function AnalyzeTile() {
  const reduce = useReducedMotion();
  const lines = ['w-3/4', 'w-full', 'w-5/6', 'w-2/3'];
  return (
    <div className={cn(TILE, 'flex-col justify-center gap-2 px-5')}>
      {lines.map((w, i) => (
        <div key={i} className={cn('h-2 rounded-full bg-slate-200', w)} />
      ))}
      {!reduce && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 h-10 bg-gradient-to-b from-accent/0 via-accent/20 to-accent/0"
          initial={{ y: -40 }}
          animate={{ y: 150 }}
          transition={{ duration: 2.2, repeat: Infinity, ease: 'linear' }}
        />
      )}
      <div className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-accent">
        <Brain className="h-2.5 w-2.5" strokeWidth={2} />
        AI
      </div>
    </div>
  );
}

/* Step 4 — mini result report */
export function ReportTile() {
  return (
    <div className={cn(TILE, 'items-center justify-center gap-4')}>
      <div className="text-center">
        {/* illustrative sample — mirrors the Demo section score */}
        <div className="font-sans text-2xl font-black leading-none text-emerald-600 tabular-nums">72%</div>
        <div className="mt-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-400">Điểm khớp</div>
      </div>
      <div className="h-11 w-px bg-slate-200" />
      <div className="space-y-1.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3 w-3 text-emerald-500" strokeWidth={2} />
            <div className={cn('h-1.5 rounded-full bg-slate-200', i === 1 ? 'w-8' : 'w-11')} />
          </div>
        ))}
      </div>
    </div>
  );
}
