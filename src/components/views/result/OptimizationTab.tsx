import React from 'react';
import { motion } from 'motion/react';
import { Sparkles, RefreshCcw, Copy, Check, FileText, Printer, AlignLeft, Award, Zap, Shield, Eye, Crown, Lock } from 'lucide-react';
import { useUI } from '../../../context/UIContext';
import { useAuth } from '../../../context/AuthContext';
import { isProPlan, isRecruiterPlan } from '../../../lib/planLimits';
import { AnalysisResult, RewriteSuggestion } from '../../../services/ai';
import { CvMarkdownBody, markdownToPlainText } from './CvMarkdownBody';

type ViewMode = 'premium' | 'free';

interface OptimizationTabProps {
  selectedResult: AnalysisResult;
}

export const OptimizationTab = React.memo(function OptimizationTab({ selectedResult }: OptimizationTabProps) {
  const { t, reportLanguage, navigateToUpgrade } = useUI();
  const { effectivePlan, userProfile } = useAuth();
  const canExportOptimized =
    userProfile?.role === 'admin' || isProPlan(effectivePlan) || isRecruiterPlan(effectivePlan);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const [viewMode, setViewModeState] = React.useState<ViewMode>(
    canExportOptimized ? 'premium' : 'free'
  );

  // Sync viewMode to sessionStorage & dispatch event so PrintView re-renders
  const syncViewMode = (mode: ViewMode) => {
    try {
      sessionStorage.setItem('cvFit_viewMode', mode);
      sessionStorage.setItem('cvFit_printVersion', String(Date.now()));
    } catch { /* ignore */ }
    window.dispatchEvent(new Event('cvfit:viewModeChanged'));
  };
  const setViewMode = (mode: ViewMode) => {
    setViewModeState(mode);
    syncViewMode(mode);
  };
  // Sync initial viewMode on mount
  React.useEffect(() => {
    syncViewMode(canExportOptimized ? 'premium' : 'free');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div id="optimization-content" className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 scroll-mt-24">
      {/* ATS Keywords */}
      <div className="bg-surface rounded-[2.5rem] p-8 border border-border shadow-sm">
        <div className="flex flex-col gap-10">
          <div>
            <h4 className="font-bold mb-4 flex items-center gap-2 text-accent">
              <Sparkles className="w-5 h-5" />
              {t.atsKeywords}
            </h4>
            <div className="flex flex-wrap gap-2.5">
              {selectedResult.atsKeywords.map((kw, i) => (
                <motion.span 
                  key={i} 
                  whileHover={{ scale: 1.05, y: -2 }}
                  className="px-4 py-1.5 bg-accent-light text-accent border border-accent/20 rounded-full text-xs font-bold shadow-sm hover:shadow-md hover:border-accent/40 transition-all cursor-default"
                >
                  {kw}
                </motion.span>
              ))}
            </div>
          </div>
          
          <div className="h-px bg-border w-full" />

          {/* Rewrite Suggestions */}
          <div>
            <h4 className="font-bold mb-6 flex items-center gap-2 text-success text-lg">
              <RefreshCcw className="w-6 h-6" />
              {t.rewriteSuggestions}
            </h4>
            <div className="space-y-10">
              {Object.entries(
                selectedResult.rewriteSuggestions.reduce((acc, s) => {
                  const key = s.section || t.sectionOther;
                  if (!acc[key]) acc[key] = [];
                  acc[key].push(s);
                  return acc;
                }, {} as Record<string, RewriteSuggestion[]>)
              ).map(([section, suggestions]) => (
                <div key={section} className="space-y-4">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-px bg-gradient-to-r from-transparent via-success/30 to-transparent flex-1" />
                    <span className="text-[11px] font-black uppercase tracking-[0.4em] text-success bg-success-light/50 backdrop-blur-sm px-6 py-1.5 rounded-full border border-success/20 shadow-sm">
                      {section}
                    </span>
                    <div className="h-px bg-gradient-to-r from-transparent via-success/30 to-transparent flex-1" />
                  </div>
                  
                  <div className="grid grid-cols-1 gap-6">
                    {suggestions.map((s, i) => (
                      <div key={i} className="bg-surface p-6 rounded-[2rem] border border-border hover:border-accent/40 transition-all group relative overflow-hidden shadow-sm hover:shadow-md">
                        <div className="relative space-y-6">
                          {s.original && (
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <div className="text-[10px] text-text-light uppercase font-black tracking-widest flex items-center gap-2">
                                  <div className="w-1.5 h-1.5 bg-border rounded-full" />
                                  {t.original}
                                </div>
                              </div>
                              <div className="text-xs text-text-light font-medium italic opacity-80 bg-surface-secondary p-4 rounded-2xl border border-border leading-relaxed">
                                {s.original}
                              </div>
                            </div>
                          )}
                          
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="text-[10px] text-success uppercase font-black tracking-widest flex items-center gap-2">
                                <div className="w-1.5 h-1.5 bg-success rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                                {t.optimized}
                              </div>
                              <button 
                                onClick={() => {
                                  navigator.clipboard.writeText(s.optimized);
                                  setCopiedId(`suggestion-${i}`);
                                  setTimeout(() => setCopiedId(null), 2000);
                                }}
                                className="flex items-center gap-1.5 px-4 py-2.5 bg-surface hover:bg-success-light text-text-muted hover:text-success rounded-xl text-[10px] font-black uppercase tracking-tight transition-all border border-border hover:border-success shadow-sm cursor-pointer hover:scale-105 active:scale-95"
                              >
                                {copiedId === `suggestion-${i}` ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                {copiedId === `suggestion-${i}` ? t.copied : t.copy}
                              </button>
                            </div>
                            <div className="text-sm text-text-main font-bold leading-relaxed bg-success-light/30 p-6 rounded-2xl border border-success/20 group-hover:border-success/40 transition-all shadow-sm ring-4 ring-success-light/10">
                              {s.optimized}
                            </div>
                          </div>
                          
                          <div className="pt-5 border-t border-border flex items-start gap-4">
                            <div className="w-8 h-8 bg-accent-light rounded-xl flex items-center justify-center shrink-0 border border-accent/10">
                              <Sparkles className="w-4 h-4 text-accent" />
                            </div>
                            <div className="space-y-1">
                              <div className="text-[10px] font-black text-accent uppercase tracking-widest">{t.reason}</div>
                              <p className="text-xs text-text-muted leading-relaxed font-medium">
                                {s.explanation}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ========== VIP PRO: Full Optimized CV (Dual-Mode Tabs) ========== */}
          {selectedResult.fullRewrittenCV && (
            <>
              <div className="h-px bg-border w-full" />

              {/* ----- Outer wrapper: premium dark card with glass surface ----- */}
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
                className="relative overflow-hidden rounded-[2.5rem] border border-white/[0.06] bg-gradient-to-br from-white/[0.04] via-white/[0.02] to-transparent backdrop-blur-sm shadow-[0_25px_60px_-15px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.03)]"
              >
                {/* Subtle grid overlay */}
                <div className="pointer-events-none absolute inset-0 bg-grid opacity-30" />

                {/* Top accent line */}
                <div className="absolute left-8 right-8 top-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent" />

                {/* ----- Document Header Ribbon ----- */}
                <div className="relative z-10 flex flex-col gap-5 border-b border-white/[0.06] px-6 pb-5 pt-6 sm:px-10 sm:pt-10">
                  {/* Top row: icon + title + tab toggle */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <motion.div
                      initial={{ opacity: 0, x: -12 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.1, duration: 0.35 }}
                      className="flex items-center gap-2.5"
                    >
                      <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-accent/20 bg-accent-light/80 backdrop-blur-sm shadow-[0_0_20px_rgba(5,150,105,0.12)]">
                        <FileText className="size-5 text-accent" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-cv-header text-[9px] font-black uppercase tracking-[0.42em] text-text-muted mb-0.5">
                          {t.fullCvSpecimenEyebrow}
                        </p>
                        <h4 className="text-lg sm:text-xl font-black tracking-tight text-text-main leading-tight">
                          {t.fullRewrittenCV}
                        </h4>
                      </div>
                    </motion.div>

                    {/* ---- Tab Toggle: Premium / Free Preview ---- */}
                    <div className="relative flex rounded-xl bg-white/[0.04] border border-white/[0.08] p-1 backdrop-blur-sm">
                      {/* Premium tab */}
                      <button
                        type="button"
                        onClick={() => setViewMode('premium')}
                        className={`
                          relative z-10 flex items-center gap-1.5 rounded-lg px-4 py-2 text-[10px] font-black uppercase tracking-[0.12em] transition-colors duration-200 cursor-pointer
                          ${viewMode === 'premium'
                            ? 'text-accent'
                            : 'text-text-muted hover:text-text-main'
                          }
                        `}
                      >
                        <Crown className="size-3.5" />
                        <span className="hidden xs:inline">{t.premiumViewTab}</span>
                      </button>

                      {/* Free preview tab */}
                      <button
                        type="button"
                        onClick={() => setViewMode('free')}
                        className={`
                          relative z-10 flex items-center gap-1.5 rounded-lg px-4 py-2 text-[10px] font-black uppercase tracking-[0.12em] transition-colors duration-200 cursor-pointer
                          ${viewMode === 'free'
                            ? 'text-amber-400'
                            : 'text-text-muted hover:text-text-main'
                          }
                        `}
                      >
                        <Eye className="size-3.5" />
                        <span className="hidden xs:inline">{t.freePreviewTab}</span>
                      </button>

                      {/* Sliding background indicator */}
                      <motion.div
                        layout
                        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                        className={`
                          absolute top-1 bottom-1 rounded-lg border shadow-sm
                          ${viewMode === 'premium'
                            ? 'left-1 bg-accent-light/40 border-accent/20'
                            : 'right-1 bg-amber-500/10 border-amber-500/20'
                          }
                        `}
                        style={{
                          width: 'calc(50% - 4px)',
                        }}
                      />
                    </div>
                  </div>

                  {/* Header info row: conditional badges + actions */}
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    {viewMode === 'premium' ? (
                      <>
                        {/* Premium header: description + badges */}
                        <div className="flex flex-col gap-3">
                          <p className="max-w-2xl text-sm font-medium leading-relaxed text-text-muted">
                            {t.fullRewrittenCVDesc}
                          </p>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="flex items-center gap-1.5 rounded-full border border-accent/25 bg-accent-light/60 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-accent backdrop-blur-sm">
                              <Zap className="size-3 text-accent" />
                              ATS Optimized
                            </span>
                            <span className="flex items-center gap-1.5 rounded-full border border-success/25 bg-success-light/50 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-success backdrop-blur-sm">
                              <Shield className="size-3 text-success" />
                              Recruiter Ready
                            </span>
                          </div>
                        </div>

                        {/* Action buttons (paid users only) */}
                        {canExportOptimized ? (
                          <div className="no-print flex flex-wrap items-center gap-2">
                            <span className="hidden h-8 w-px bg-white/[0.08] sm:block lg:h-10" aria-hidden />
                            <button
                              type="button"
                              onClick={() => {
                                if (selectedResult.fullRewrittenCV) {
                                  navigator.clipboard.writeText(selectedResult.fullRewrittenCV);
                                  setCopiedId('full-cv-md');
                                  setTimeout(() => setCopiedId(null), 2000);
                                }
                              }}
                              className="group flex items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-[10px] font-black uppercase tracking-[0.15em] text-text-muted shadow-sm transition-all duration-200 hover:scale-105 hover:border-white/[0.15] hover:bg-white/[0.06] hover:text-text-main hover:shadow-lg active:scale-95 cursor-pointer backdrop-blur-sm"
                            >
                              {copiedId === 'full-cv-md' ? <Check className="size-4 text-success" /> : <Copy className="size-4 transition-colors group-hover:text-accent" />}
                              {copiedId === 'full-cv-md' ? t.copied : t.copyMarkdown}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (selectedResult.fullRewrittenCV) {
                                  navigator.clipboard.writeText(markdownToPlainText(selectedResult.fullRewrittenCV));
                                  setCopiedId('full-cv-plain');
                                  setTimeout(() => setCopiedId(null), 2000);
                                }
                              }}
                              className="group flex items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-[10px] font-black uppercase tracking-[0.15em] text-text-muted shadow-sm transition-all duration-200 hover:scale-105 hover:border-white/[0.15] hover:bg-white/[0.06] hover:text-text-main hover:shadow-lg active:scale-95 cursor-pointer backdrop-blur-sm"
                            >
                              {copiedId === 'full-cv-plain' ? <Check className="size-4 text-success" /> : <AlignLeft className="size-4 transition-colors group-hover:text-accent" />}
                              {copiedId === 'full-cv-plain' ? t.copied : t.copyPlainText}
                            </button>
                            <button
                              type="button"
                              onClick={() => window.print()}
                              className="group flex items-center justify-center gap-2 rounded-xl border border-accent/20 bg-accent-light/40 px-4 py-3 text-[10px] font-black uppercase tracking-[0.15em] text-accent shadow-sm transition-all duration-200 hover:scale-105 hover:border-accent/40 hover:bg-accent-light/70 hover:shadow-[0_0_20px_rgba(5,150,105,0.15)] active:scale-95 cursor-pointer backdrop-blur-sm"
                            >
                              <Printer className="size-4 transition-transform group-hover:scale-110" />
                              {t.printOptimized}
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={(e) => { e.preventDefault(); navigateToUpgrade(); }}
                              className="group flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-400/10 px-4 py-3 text-[10px] font-black uppercase tracking-[0.15em] text-amber-400 shadow-sm transition-all duration-200 hover:scale-105 hover:border-amber-500/50 hover:bg-amber-400/20 hover:shadow-[0_0_16px_rgba(245,158,11,0.15)] active:scale-95 cursor-pointer backdrop-blur-sm"
                            >
                              <Crown className="size-4" />
                              {t.upgradeToUnlock}
                            </button>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        {/* Free Preview header: conditional badges based on plan */}
                        <div className="flex flex-col gap-3">
                          <p className="max-w-2xl text-sm font-medium leading-relaxed text-text-muted">
                            {t.fullRewrittenCVDesc}
                          </p>
                          <div className="flex items-center gap-2 flex-wrap">
                            {canExportOptimized ? (
                              <>
                                <span className="flex items-center gap-1.5 rounded-full border border-accent/25 bg-accent-light/60 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-accent backdrop-blur-sm">
                                  <Zap className="size-3 text-accent" />
                                  ATS Optimized
                                </span>
                                <span className="flex items-center gap-1.5 rounded-full border border-success/25 bg-success-light/50 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-success backdrop-blur-sm">
                                  <Shield className="size-3 text-success" />
                                  Recruiter Ready
                                </span>
                              </>
                            ) : (
                              <span className="flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-400/10 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-amber-400 backdrop-blur-sm">
                                <Lock className="size-3 text-amber-400" />
                                {t.freePreviewBadge}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Action buttons for paid users in Free Preview tab */}
                        {canExportOptimized ? (
                          <div className="no-print flex flex-wrap items-center gap-2">
                            <span className="hidden h-8 w-px bg-white/[0.08] sm:block lg:h-10" aria-hidden />
                            <button
                              type="button"
                              onClick={() => {
                                if (selectedResult.fullRewrittenCV) {
                                  navigator.clipboard.writeText(selectedResult.fullRewrittenCV);
                                  setCopiedId('full-cv-md');
                                  setTimeout(() => setCopiedId(null), 2000);
                                }
                              }}
                              className="group flex items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-[10px] font-black uppercase tracking-[0.15em] text-text-muted shadow-sm transition-all duration-200 hover:scale-105 hover:border-white/[0.15] hover:bg-white/[0.06] hover:text-text-main hover:shadow-lg active:scale-95 cursor-pointer backdrop-blur-sm"
                            >
                              {copiedId === 'full-cv-md' ? <Check className="size-4 text-success" /> : <Copy className="size-4 transition-colors group-hover:text-accent" />}
                              {copiedId === 'full-cv-md' ? t.copied : t.copyMarkdown}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (selectedResult.fullRewrittenCV) {
                                  navigator.clipboard.writeText(markdownToPlainText(selectedResult.fullRewrittenCV));
                                  setCopiedId('full-cv-plain');
                                  setTimeout(() => setCopiedId(null), 2000);
                                }
                              }}
                              className="group flex items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-[10px] font-black uppercase tracking-[0.15em] text-text-muted shadow-sm transition-all duration-200 hover:scale-105 hover:border-white/[0.15] hover:bg-white/[0.06] hover:text-text-main hover:shadow-lg active:scale-95 cursor-pointer backdrop-blur-sm"
                            >
                              {copiedId === 'full-cv-plain' ? <Check className="size-4 text-success" /> : <AlignLeft className="size-4 transition-colors group-hover:text-accent" />}
                              {copiedId === 'full-cv-plain' ? t.copied : t.copyPlainText}
                            </button>
                            <button
                              type="button"
                              onClick={() => window.print()}
                              className="group flex items-center justify-center gap-2 rounded-xl border border-accent/20 bg-accent-light/40 px-4 py-3 text-[10px] font-black uppercase tracking-[0.15em] text-accent shadow-sm transition-all duration-200 hover:scale-105 hover:border-accent/40 hover:bg-accent-light/70 hover:shadow-[0_0_20px_rgba(5,150,105,0.15)] active:scale-95 cursor-pointer backdrop-blur-sm"
                            >
                              <Printer className="size-4 transition-transform group-hover:scale-110" />
                              {t.printOptimized}
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={(e) => { e.preventDefault(); navigateToUpgrade(); }}
                              className="group flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-400/10 px-4 py-3 text-[10px] font-black uppercase tracking-[0.15em] text-amber-400 shadow-sm transition-all duration-200 hover:scale-105 hover:border-amber-500/50 hover:bg-amber-400/20 hover:shadow-[0_0_16px_rgba(245,158,11,0.15)] active:scale-95 cursor-pointer backdrop-blur-sm"
                            >
                              <Crown className="size-4" />
                              {t.upgradeToUnlock}
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* ----- CV Document Preview ----- */}
                <div className="relative z-10 p-4 pb-8 sm:p-10 sm:pb-14">
                  {/* ============================================ */}
                  {/* === PREMIUM VIEW: Professional CV Layout === */}
                  {/* ============================================ */}
                  {viewMode === 'premium' ? (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.2, duration: 0.5 }}
                      className="group/cv relative mx-auto min-h-[min(297mm,80vh)] max-w-[210mm] overflow-hidden rounded-[4px]"
                    >
                      {/* Outer glow ring */}
                      <div className="absolute -inset-[2px] rounded-[4px] bg-gradient-to-br from-accent/20 via-accent/5 to-accent/20 opacity-50 transition-opacity duration-500 group-hover/cv:opacity-100 -z-10 blur-sm" />

                      {/* Main paper surface */}
                      <div className="relative h-full bg-[#FCFCFC] shadow-[0_8px_40px_-12px_rgba(0,0,0,0.35),0_0_0_1px_rgba(0,0,0,0.06),0_20px_60px_-20px_rgba(5,150,105,0.08)] ring-1 ring-slate-200">

                        {/* === Professional Header Bar === */}
                        <div className="relative border-b-2 border-slate-200 bg-gradient-to-r from-slate-50 via-white to-slate-50 px-8 pt-10 pb-6 sm:px-14 sm:pt-14 sm:pb-8">
                          {/* Decorative top accent strip */}
                          <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-accent via-accent to-accent/60" />
                          <div className="absolute top-[3px] left-0 right-0 h-px bg-gradient-to-r from-accent/30 via-accent/10 to-transparent" />

                          {/* Name placeholder area */}
                          <div className="mb-6">
                            <h1 className="font-cv-header text-[clamp(1.75rem,4vw,3rem)] font-black uppercase leading-[0.92] tracking-[-0.05em] text-slate-800">
                              {/* Name will be rendered from markdown h1 */}
                            </h1>
                            <p className="mt-2 font-cv-header text-[0.625rem] font-bold uppercase tracking-[0.35em] text-slate-500">
                              {reportLanguage === 'vi'
                                ? 'Bản nháp tối ưu ATS · cấu trúc quét nhanh'
                                : 'ATS-optimized draft · recruiter-scan layout'}
                            </p>
                          </div>

                          {/* Contact info strip */}
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.75rem] text-slate-500 font-medium">
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200">
                              <Shield className="size-3 text-accent" />
                              {t.premiumOptimizedBadge}
                            </span>
                            <span className="text-slate-300">|</span>
                            <span className="text-slate-500">{t.fullRewrittenCV}</span>
                          </div>
                        </div>

                        {/* CV Content Body — Premium variant */}
                        <div className="relative z-10 p-8 sm:p-14">
                          <CvMarkdownBody
                            markdown={selectedResult.fullRewrittenCV}
                            locale={reportLanguage}
                            density="screen"
                            variant="premium"
                          />
                        </div>

                        {/* Side watermarks — premium subtle (paid users only) */}
                        {canExportOptimized && (
                          <div className="pointer-events-none absolute right-6 top-[35%] opacity-[0.03] transition-opacity duration-500 group-hover/cv:opacity-[0.06]">
                            <Award className="size-40" />
                          </div>
                        )}

                        {/* ====== WATERMARK LAYERS FOR FREE USERS ON PREMIUM VIEW ====== */}
                        {!canExportOptimized && (
                          <>
                            <div className="pointer-events-none absolute inset-0 z-20 bg-gradient-to-b from-slate-900/10 via-transparent to-slate-900/10" aria-hidden />
                            <div
                              className="pointer-events-none absolute inset-0 z-20 select-none"
                              aria-hidden
                              style={{
                                backgroundImage: `repeating-linear-gradient(-35deg, transparent, transparent 70px, rgba(100,116,139,0.07) 70px, rgba(100,116,139,0.07) 71px)`,
                              }}
                            />
                            <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center select-none" aria-hidden>
                              <span className="rotate-[-22deg] text-[2.8rem] sm:text-[5rem] font-black text-slate-500/[0.14] tracking-[0.25em] uppercase whitespace-nowrap">
                                {t.freePreviewWatermarkPrimary}
                              </span>
                            </div>
                            <div
                              className="pointer-events-none absolute inset-0 z-20 select-none"
                              aria-hidden
                              style={{
                                backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 130px, rgba(245,158,11,0.05) 130px, rgba(245,158,11,0.05) 131px), repeating-linear-gradient(90deg, transparent, transparent 170px, rgba(245,158,11,0.04) 170px, rgba(245,158,11,0.04) 171px)`,
                              }}
                            />
                            <div className="pointer-events-none absolute inset-0 z-20 select-none overflow-hidden" aria-hidden>
                              <div className="absolute inset-0 flex flex-wrap content-center justify-center gap-16 opacity-[0.05] rotate-[-20deg] scale-150">
                                {Array.from({ length: 20 }).map((_, idx) => (
                                  <span key={idx} className="text-[0.65rem] font-black uppercase tracking-[0.3em] text-slate-700 whitespace-nowrap">
                                    {t.freePreviewWatermarkSecondary}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <div className="pointer-events-none absolute top-6 right-6 z-20 select-none">
                              <span className="rounded-lg border border-amber-500/35 bg-amber-400/20 backdrop-blur-sm px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.15em] text-amber-500 shadow-[0_0_14px_rgba(245,158,11,0.15)]">
                                <Lock className="inline size-3 mr-1 -mt-0.5" />
                                {t.freePreviewTab}
                              </span>
                            </div>
                          </>
                        )}
                        {/* ====== END WATERMARK LAYERS ====== */}

                        {/* Footer stamp */}
                        <div className="relative z-10 mt-8 border-t-2 border-slate-200/80 pt-6 pb-8 text-center font-cv-header text-[9px] font-bold uppercase tracking-[0.25em] text-slate-400">
                          {t.fullCvDraftFooter}
                        </div>
                      </div>
                    </motion.div>
                  ) : (
                    /* ========================================== */
                    /* === FREE PREVIEW: Watermarked Preview === */
                    /* ========================================== */
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.2, duration: 0.5 }}
                      className="group/cv relative mx-auto min-h-[min(297mm,80vh)] max-w-[210mm] overflow-hidden rounded-sm bg-slate-100 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.4),0_0_0_1px_rgba(0,0,0,0.08)] ring-1 ring-slate-300/60 transition-shadow duration-500"
                    >
                      {/* Muted paper surface */}
                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-slate-200/50 via-slate-100/80 to-slate-200/60" />

                      {/* Broken/obscured corner brackets */}
                      <span className="pointer-events-none absolute left-4 top-4 size-5 border-l-2 border-t-2 border-slate-400/40 sm:left-6 sm:top-6 sm:size-6" aria-hidden />
                      <span className="pointer-events-none absolute right-4 top-4 size-5 border-r-2 border-t-2 border-slate-400/40 sm:right-6 sm:top-6 sm:size-6" aria-hidden />
                      <span className="pointer-events-none absolute bottom-4 left-4 size-5 border-b-2 border-l-2 border-slate-400/40 sm:bottom-6 sm:left-6 sm:size-6" aria-hidden />
                      <span className="pointer-events-none absolute bottom-4 right-4 size-5 border-b-2 border-r-2 border-slate-400/40 sm:bottom-6 sm:right-6 sm:size-6" aria-hidden />

                      {/* CV Content — free users: disabled interaction */}
                      <div className={`relative z-10 p-8 sm:p-14 ${!canExportOptimized ? 'pointer-events-none select-none' : ''}`}>
                        <CvMarkdownBody
                          markdown={selectedResult.fullRewrittenCV}
                          locale={reportLanguage}
                          density="screen"
                        />
                      </div>

                      {/* ====== FREE PREVIEW WATERMARK LAYERS ====== */}
                      {!canExportOptimized && (
                        <>
                          {/* Layer 1: Dark gradient overlay */}
                          <div
                            className="pointer-events-none absolute inset-0 z-20 bg-gradient-to-b from-slate-900/10 via-transparent to-slate-900/10"
                            aria-hidden
                          />

                          {/* Layer 2: Diagonal stripe pattern */}
                          <div
                            className="pointer-events-none absolute inset-0 z-20 select-none"
                            aria-hidden
                            style={{
                              backgroundImage: `repeating-linear-gradient(
                                -35deg,
                                transparent,
                                transparent 70px,
                                rgba(100, 116, 139, 0.07) 70px,
                                rgba(100, 116, 139, 0.07) 71px
                              )`,
                            }}
                          />

                          {/* Layer 3: Large centered "cvFit.pro" */}
                          <div
                            className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center select-none"
                            aria-hidden
                          >
                            <span className="rotate-[-22deg] text-[2.8rem] sm:text-[5rem] font-black text-slate-500/[0.16] tracking-[0.25em] uppercase whitespace-nowrap">
                              {t.freePreviewWatermarkPrimary}
                            </span>
                          </div>

                          {/* Layer 4: Grid watermark */}
                          <div
                            className="pointer-events-none absolute inset-0 z-20 select-none"
                            aria-hidden
                            style={{
                              backgroundImage: `
                                repeating-linear-gradient(0deg, transparent, transparent 130px, rgba(245, 158, 11, 0.05) 130px, rgba(245, 158, 11, 0.05) 131px),
                                repeating-linear-gradient(90deg, transparent, transparent 170px, rgba(245, 158, 11, 0.04) 170px, rgba(245, 158, 11, 0.04) 171px)
                              `,
                            }}
                          />

                          {/* Layer 5: Small repeating "PREVIEW ONLY" text watermark */}
                          <div
                            className="pointer-events-none absolute inset-0 z-20 select-none overflow-hidden"
                            aria-hidden
                          >
                            <div className="absolute inset-0 flex flex-wrap content-center justify-center gap-16 opacity-[0.06] rotate-[-20deg] scale-150">
                              {Array.from({ length: 20 }).map((_, idx) => (
                                <span key={idx} className="text-[0.65rem] font-black uppercase tracking-[0.3em] text-slate-700 whitespace-nowrap">
                                  {t.freePreviewWatermarkSecondary}
                                </span>
                              ))}
                            </div>
                          </div>

                          {/* Layer 6: Free Preview badge */}
                          <div className="pointer-events-none absolute top-6 right-6 z-20 select-none">
                            <span className="rounded-lg border border-amber-500/35 bg-amber-400/20 backdrop-blur-sm px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.15em] text-amber-500 shadow-[0_0_14px_rgba(245,158,11,0.15)]">
                              <Lock className="inline size-3 mr-1 -mt-0.5" />
                              {t.freePreviewTab}
                            </span>
                          </div>
                        </>
                      )}
                      {/* ====== END WATERMARK LAYERS ====== */}

                      {/* Footer */}
                      <div className="relative z-10 mt-12 border-t border-slate-300/60 pt-5 text-center font-cv-header text-[9px] font-bold uppercase tracking-[0.25em] text-slate-400">
                        {t.fullCvDraftFooter}
                      </div>
                    </motion.div>
                  )}
                </div>

                {/* Bottom accent line */}
                <div className="absolute bottom-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-accent/25 to-transparent" />
              </motion.div>
            </>
          )}

        </div>
      </div>
    </div>
  );
});

