import React from 'react';
import { motion } from 'motion/react';
import { Sparkles, RefreshCcw, Copy, Check, FileText, Printer, AlignLeft, Award, Zap, Shield, Eye, Crown, Lock, Mail, Phone, MapPin, Globe } from 'lucide-react';
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

  // Strip education + contact info from markdown (rendered in sidebar/header instead)
  const markdownCleaned = React.useMemo(() => {
    if (!selectedResult.fullRewrittenCV) return '';
    let md = selectedResult.fullRewrittenCV;
    // Remove ## Học vấn / ## Education + content until next ## or end
    md = md.replace(/^##\s+(?:Học vấn|Education)\b[\s\S]*?(?=\n##\s|\n*$)/m, '');
    // Remove contact paragraph between name/title block and first --- or ##
    // Matches lines with · separators, email patterns, phone patterns after the H1 block
    md = md.replace(
      /(^# .+\n(?:^[^\n#-].*\n)*?)((?:(?:[^\n#-].*·.*\n)|(?:[^\n#-]*@[^\n]*\n)|(?:[^\n#-]*0\d[^\n]*\n)|(?:[^\n#-]*linkedin[^\n]*\n)|(?:[^\n#-]*\.com[^\n]*\n))+)/m,
      '$1',
    );
    return md.trim();
  }, [selectedResult.fullRewrittenCV]);

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
                className="relative overflow-hidden rounded-[2.5rem] border border-border bg-gradient-to-br dark:from-white/[0.04] dark:via-white/[0.02] dark:to-transparent from-white/80 via-white/40 to-white/20 backdrop-blur-sm shadow-sm"
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
                      className="group/cv relative mx-auto max-w-[210mm] overflow-hidden rounded-lg ring-1 ring-slate-200 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.35),0_0_0_1px_rgba(0,0,0,0.06)]"
                      style={{ background: '#FCFCFC' }}
                    >
                      {/* ════ CV Header ════ */}
                      <div className="relative border-b-2 border-slate-200 px-8 pt-10 pb-6 sm:px-14 sm:pt-14 sm:pb-8 overflow-hidden bg-gradient-to-r from-slate-50 via-white to-slate-50">
                        {/* Decorative top accent strip */}
                        <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-accent via-accent to-accent/60" />
                        <div className="absolute top-[3px] left-0 right-0 h-px bg-gradient-to-r from-accent/30 via-accent/10 to-transparent" />

  
                        {/* Contact strip */}
                        {selectedResult.parsedCV?.personal_information?.contact && (
                          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[0.68rem] font-medium text-slate-500">
                            {selectedResult.parsedCV.personal_information.contact.email && (
                              <span className="inline-flex items-center gap-1.5">
                                <Mail className="size-3 text-accent" />
                                {selectedResult.parsedCV.personal_information.contact.email}
                              </span>
                            )}
                            {selectedResult.parsedCV.personal_information.contact.phone && (
                              <span className="inline-flex items-center gap-1.5">
                                <Phone className="size-3 text-accent" />
                                {selectedResult.parsedCV.personal_information.contact.phone}
                              </span>
                            )}
                            {selectedResult.parsedCV.personal_information.contact.location && (
                              <span className="inline-flex items-center gap-1.5">
                                <MapPin className="size-3 text-accent" />
                                {selectedResult.parsedCV.personal_information.contact.location}
                              </span>
                            )}
                            {selectedResult.parsedCV.personal_information.contact.linkedin && (
                              <span className="inline-flex items-center gap-1.5">
                                <Globe className="size-3 text-accent" />
                                {selectedResult.parsedCV.personal_information.contact.linkedin}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* ════ CV Body: 2-Column Layout ════ */}
                      <div className="flex flex-col md:flex-row">
                        {/* ── Main Column (left) ── */}
                        <div className="flex-1 min-w-0 p-7 sm:p-10 border-r border-slate-200">
                          <CvMarkdownBody
                            markdown={markdownCleaned}
                            locale={reportLanguage}
                            density="screen"
                            variant="premium"
                          />
                        </div>

                        {/* ── Sidebar (right) ── */}
                        <div className="w-[230px] shrink-0 p-6 sm:p-7 border-l border-slate-200 bg-gradient-to-b from-amber-50/40 to-slate-50/40">
                          {/* Skills */}
                          {selectedResult.parsedCV?.skills && (selectedResult.parsedCV.skills.technical_skills?.length > 0 || selectedResult.parsedCV.skills.soft_skills?.length > 0 || selectedResult.parsedCV.skills.tools_software?.length > 0) && (
                            <div className="mb-5">
                              <div className="flex items-center gap-2 mb-3">
                                <div className="w-[3px] h-3 rounded-sm shrink-0 bg-gradient-to-b from-amber-500 to-amber-400" />
                                <span className="font-cv-header text-[7.5px] font-extrabold uppercase tracking-[0.22em] text-amber-700">
                                  {reportLanguage === 'vi' ? 'Kỹ năng' : 'Skills'}
                                </span>
                              </div>
                              {selectedResult.parsedCV.skills.technical_skills?.length > 0 && (
                                <div className="mb-3">
                                  <p className="text-[8px] font-bold uppercase tracking-[0.12em] mb-2 text-slate-500">
                                    {reportLanguage === 'vi' ? 'Chuyên môn' : 'Technical'}
                                  </p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {selectedResult.parsedCV.skills.technical_skills.map((s, i) => (
                                      <span key={i} className="px-2 py-1 rounded text-[9px] font-medium transition-colors duration-200 cursor-default bg-amber-50 border border-amber-200/60 text-slate-600 hover:bg-amber-100 hover:border-amber-300 hover:text-slate-800">
                                        {s}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {selectedResult.parsedCV.skills.soft_skills?.length > 0 && (
                                <div className="mb-3">
                                  <p className="text-[8px] font-bold uppercase tracking-[0.12em] mb-2 text-slate-500">
                                    {reportLanguage === 'vi' ? 'Mềm' : 'Soft'}
                                  </p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {selectedResult.parsedCV.skills.soft_skills.map((s, i) => (
                                      <span key={i} className="px-2 py-1 rounded text-[9px] font-medium bg-amber-50 border border-amber-200/60 text-slate-600">{s}</span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {selectedResult.parsedCV.skills.tools_software?.length > 0 && (
                                <div>
                                  <p className="text-[8px] font-bold uppercase tracking-[0.12em] mb-2 text-slate-500">
                                    {reportLanguage === 'vi' ? 'Công cụ' : 'Tools'}
                                  </p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {selectedResult.parsedCV.skills.tools_software.map((s, i) => (
                                      <span key={i} className="px-2 py-1 rounded text-[9px] font-medium bg-amber-50 border border-amber-200/60 text-slate-600">{s}</span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Education */}
                          {selectedResult.parsedCV?.education && selectedResult.parsedCV.education.length > 0 && (
                            <div className="mb-5">
                              <div className="flex items-center gap-2 mb-3">
                                <div className="w-[3px] h-3 rounded-sm shrink-0 bg-gradient-to-b from-amber-500 to-amber-400" />
                                <span className="font-cv-header text-[7.5px] font-extrabold uppercase tracking-[0.22em] text-amber-700">
                                  {reportLanguage === 'vi' ? 'Học vấn' : 'Education'}
                                </span>
                              </div>
                              {(selectedResult.parsedCV?.education ?? []).map((edu, i) => (
                                <div key={i} className="mb-2 last:mb-0 p-2.5 rounded-lg border border-slate-200 bg-white transition-colors duration-200 hover:border-slate-300 hover:bg-slate-50">
                                  <p className="text-[10px] font-bold leading-tight mb-0.5 text-slate-800">{edu.degree || edu.major}</p>
                                  <p className="text-[9px] font-semibold leading-tight mb-0.5 text-amber-700">{edu.institution}</p>
                                  {edu.graduation_year && (
                                    <p className="text-[8.5px] text-slate-400">{edu.graduation_year}</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Languages */}
                          {selectedResult.parsedCV?.skills?.languages && selectedResult.parsedCV.skills.languages.length > 0 && (
                            <div className="mb-5">
                              <div className="flex items-center gap-2 mb-3">
                                <div className="w-[3px] h-3 rounded-sm shrink-0 bg-gradient-to-b from-amber-500 to-amber-400" />
                                <span className="font-cv-header text-[7.5px] font-extrabold uppercase tracking-[0.22em] text-amber-700">
                                  {reportLanguage === 'vi' ? 'Ngôn ngữ' : 'Languages'}
                                </span>
                              </div>
                              {(selectedResult.parsedCV?.skills?.languages ?? []).map((lang, i) => {
                                const profLevel = lang.proficiency?.toLowerCase() || '';
                                const level = profLevel.includes('native') || profLevel.includes('bản') || profLevel.includes('fluent') || profLevel.includes('advanced') || profLevel.includes('cao')
                                  ? 5 : profLevel.includes('intermediate') || profLevel.includes('trung')
                                  ? 3 : profLevel.includes('basic') || profLevel.includes('cơ')
                                  ? 2 : 3;
                                return (
                                  <div key={i} className="flex items-center justify-between py-1.5">
                                    <span className="text-[10px] font-semibold text-slate-700">{lang.language}</span>
                                    <div className="flex gap-1">
                                      {Array.from({ length: 5 }).map((_, j) => (
                                        <div key={j} className="w-2.5 h-[5px] rounded-sm transition-all duration-300"
                                          style={{
                                            background: j < level
                                              ? 'linear-gradient(135deg, #c9a84c, #dbb85e)'
                                              : '#e2e8f0',
                                            boxShadow: j < level ? '0 0 4px rgba(201,168,76,0.2)' : 'none',
                                          }}
                                        />
                                      ))}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                        </div>
                      </div>

                      {/* Watermark overlay for free users on premium view */}
                      {!canExportOptimized && (
                        <>
                          <div className="pointer-events-none absolute inset-0 z-20 bg-gradient-to-b from-slate-900/5 via-transparent to-slate-900/5" aria-hidden />
                          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center select-none" aria-hidden>
                            <span className="rotate-[-22deg] text-[2.5rem] sm:text-[4.5rem] font-black tracking-[0.25em] uppercase whitespace-nowrap text-slate-400/[0.10]">
                              {t.freePreviewWatermarkPrimary}
                            </span>
                          </div>
                          <div className="pointer-events-none absolute top-4 right-4 z-20 select-none">
                            <span className="rounded-lg border border-amber-500/35 bg-amber-400/20 backdrop-blur-sm px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.15em] text-amber-500 shadow-[0_0_14px_rgba(245,158,11,0.15)]">
                              <Lock className="inline size-3 mr-1 -mt-0.5" />
                              {t.freePreviewTab}
                            </span>
                          </div>
                        </>
                      )}

                      {/* Footer */}
                      <div className="border-t-2 border-slate-200/80 px-8 py-3 flex justify-between items-center flex-wrap gap-2 text-center bg-gradient-to-r from-slate-50 to-white">
                        <span className="font-cv-header text-[8px] font-bold uppercase tracking-[0.14em] text-accent">
                          cvFit.pro · {isRecruiterPlan(effectivePlan) ? 'Recruiter' : 'Pro'}
                        </span>
                        <span className="text-[8px] text-slate-400">
                          {t.fullCvDraftFooter}
                        </span>
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

