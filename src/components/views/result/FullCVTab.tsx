import React from 'react';
import { motion } from 'motion/react';
import { FileText, Copy, Check, AlignLeft, Printer, Zap, Shield, Crown, Lock, Eye, Mail, Phone, MapPin, Globe } from 'lucide-react';
import { useUI } from '../../../context/UIContext';
import type { UiLabels } from '../../../translations';
import { useAuth } from '../../../context/AuthContext';
import { useAnalysis } from '../../../context/AnalysisContext';
import { isProPlan, isRecruiterPlan } from '../../../lib/planLimits';
import { AnalysisResult } from '../../../services/ai';
import { CvMarkdownBody, markdownToPlainText } from './CvMarkdownBody';
import { extractCandidateName, cleanMarkdownForPremium } from './cvPremiumUtils';

type ViewMode = 'premium' | 'free';

interface FullCVTabProps {
  selectedResult: AnalysisResult;
}

export const FullCVTab = React.memo(function FullCVTab({ selectedResult }: FullCVTabProps) {
  const { t, reportLanguage, navigateToUpgrade } = useUI();
  const { effectivePlan, userProfile } = useAuth();
  const { fullCVGeneratingIds } = useAnalysis();
  const isGenerating = fullCVGeneratingIds.has(selectedResult.id);
  const canExportOptimized =
    userProfile?.role === 'admin' || isProPlan(effectivePlan) || isRecruiterPlan(effectivePlan);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const [viewMode, setViewModeState] = React.useState<ViewMode>(
    canExportOptimized ? 'premium' : 'free'
  );

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
  React.useEffect(() => {
    syncViewMode(canExportOptimized ? 'premium' : 'free');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const candidateName = React.useMemo(() => extractCandidateName(selectedResult), [selectedResult]);
  const markdownCleaned = React.useMemo(() => cleanMarkdownForPremium(selectedResult.fullRewrittenCV), [selectedResult.fullRewrittenCV]);

  if (!selectedResult.fullRewrittenCV) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24">
        {isGenerating ? (
          <>
            <div className="size-8 animate-spin rounded-full border-2 border-accent/20 border-t-accent" />
            <p className="text-sm font-medium text-text-muted">
              {reportLanguage === 'vi' ? 'Đang tạo CV tối ưu hoá...' : 'Generating optimized CV…'}
            </p>
          </>
        ) : (
          <p className="text-sm font-medium text-text-muted">
            {reportLanguage === 'vi' ? 'Chưa có dữ liệu CV tối ưu.' : 'No optimized CV data available.'}
          </p>
        )}
      </div>
    );
  }

  return (
    <div id="fullcv-content" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="relative overflow-hidden rounded-[2.5rem] border border-border bg-gradient-to-br dark:from-white/[0.04] dark:via-white/[0.02] dark:to-transparent from-white/80 via-white/40 to-white/20 backdrop-blur-sm shadow-sm"
      >
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-30" />
        <div className="absolute left-8 right-8 top-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent" />

        {/* ── Document Header Ribbon ── */}
        <div className="relative z-10 flex flex-col gap-5 border-b border-white/[0.06] px-6 pb-5 pt-6 sm:px-10 sm:pt-10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <motion.div
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
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

            {/* View mode toggle */}
            <div className="relative flex rounded-xl bg-white/[0.04] border border-white/[0.08] p-1 backdrop-blur-sm">
              <button
                type="button"
                onClick={() => setViewMode('premium')}
                className={`relative z-10 flex items-center gap-1.5 rounded-lg px-4 py-2 text-[10px] font-black uppercase tracking-[0.12em] transition-colors duration-200 cursor-pointer ${viewMode === 'premium' ? 'text-accent' : 'text-text-muted hover:text-text-main'}`}
              >
                <Crown className="size-3.5" />
                <span className="hidden xs:inline">{t.premiumViewTab}</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('free')}
                className={`relative z-10 flex items-center gap-1.5 rounded-lg px-4 py-2 text-[10px] font-black uppercase tracking-[0.12em] transition-colors duration-200 cursor-pointer ${viewMode === 'free' ? 'text-amber-400' : 'text-text-muted hover:text-text-main'}`}
              >
                <Eye className="size-3.5" />
                <span className="hidden xs:inline">{t.freePreviewTab}</span>
              </button>
              <motion.div
                layout
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                className={`absolute top-1 bottom-1 rounded-lg border shadow-sm ${viewMode === 'premium' ? 'left-1 bg-accent-light/40 border-accent/20' : 'right-1 bg-amber-500/10 border-amber-500/20'}`}
                style={{ width: 'calc(50% - 4px)' }}
              />
            </div>
          </div>

          {/* Badges + action buttons */}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            {viewMode === 'premium' ? (
              <>
                <div className="flex flex-col gap-3">
                  <p className="max-w-2xl text-sm font-medium leading-relaxed text-text-muted">{t.fullRewrittenCVDesc}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="flex items-center gap-1.5 rounded-full border border-accent/25 bg-accent-light/60 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-accent backdrop-blur-sm">
                      <Zap className="size-3 text-accent" />ATS Optimized
                    </span>
                    <span className="flex items-center gap-1.5 rounded-full border border-success/25 bg-success-light/50 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-success backdrop-blur-sm">
                      <Shield className="size-3 text-success" />Recruiter Ready
                    </span>
                  </div>
                </div>
                <ActionButtons canExport={canExportOptimized} copiedId={copiedId} setCopiedId={setCopiedId} fullRewrittenCV={selectedResult.fullRewrittenCV} navigateToUpgrade={navigateToUpgrade} t={t} />
              </>
            ) : (
              <>
                <div className="flex flex-col gap-3">
                  <p className="max-w-2xl text-sm font-medium leading-relaxed text-text-muted">{t.fullRewrittenCVDesc}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    {canExportOptimized ? (
                      <>
                        <span className="flex items-center gap-1.5 rounded-full border border-accent/25 bg-accent-light/60 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-accent backdrop-blur-sm">
                          <Zap className="size-3 text-accent" />ATS Optimized
                        </span>
                        <span className="flex items-center gap-1.5 rounded-full border border-success/25 bg-success-light/50 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-success backdrop-blur-sm">
                          <Shield className="size-3 text-success" />Recruiter Ready
                        </span>
                      </>
                    ) : (
                      <span className="flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-400/10 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-amber-400 backdrop-blur-sm">
                        <Lock className="size-3 text-amber-400" />{t.freePreviewBadge}
                      </span>
                    )}
                  </div>
                </div>
                <ActionButtons canExport={canExportOptimized} copiedId={copiedId} setCopiedId={setCopiedId} fullRewrittenCV={selectedResult.fullRewrittenCV} navigateToUpgrade={navigateToUpgrade} t={t} />
              </>
            )}
          </div>
        </div>

        {/* ── CV Document Preview ── */}
        <div className="relative z-10 p-4 pb-8 sm:p-10 sm:pb-14">

          {/* ════════════════ PREMIUM VIEW ════════════════ */}
          {viewMode === 'premium' ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="group/cv relative mx-auto max-w-[210mm] overflow-hidden rounded-lg shadow-[0_12px_48px_-8px_rgba(0,0,0,0.28),0_0_0_1px_rgba(0,0,0,0.07)]"
              style={{ background: '#FCFCFC' }}
            >
              {/* ── Premium header: dark band + amber accent ── */}
              <div className="overflow-hidden">
                {/* Top amber gradient strip */}
                <div className="h-[3.5px] bg-gradient-to-r from-amber-600 via-amber-400 to-amber-300" />

                {/* Dark name band */}
                <div className="relative bg-[#1C1917] px-8 pt-8 pb-7 sm:px-14 sm:pt-10 sm:pb-8 overflow-hidden">
                  {/* Subtle texture overlay */}
                  <div
                    className="pointer-events-none absolute inset-0 opacity-[0.04]"
                    style={{
                      backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(255,255,255,0.15) 4px, rgba(255,255,255,0.15) 5px)`,
                    }}
                  />
                  {/* Warm amber glow in corner */}
                  <div className="pointer-events-none absolute -top-12 -right-12 w-48 h-48 rounded-full bg-amber-500/10 blur-3xl" />

                  <div className="relative">
                    {candidateName && (
                      <h1 className="font-cv-header text-[1.85rem] sm:text-[2.6rem] font-black uppercase tracking-[-0.02em] text-white leading-[0.92] mb-3">
                        {candidateName}
                      </h1>
                    )}
                    {selectedResult.jobTitle && (
                      <div className="flex items-center gap-2">
                        <div className="h-px w-6 bg-amber-500/60" />
                        <p className="text-[0.72rem] font-bold tracking-[0.18em] uppercase text-amber-400">
                          {selectedResult.jobTitle}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Contact strip — light, below dark band */}
                {selectedResult.parsedCV?.personal_information?.contact && (
                  <div className="border-b-2 border-slate-200 bg-slate-50 px-8 py-3 sm:px-14 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[0.68rem] font-medium text-slate-500">
                    {selectedResult.parsedCV.personal_information.contact.email && (
                      <span className="inline-flex items-center gap-1.5">
                        <Mail className="size-3 text-amber-500" />
                        {selectedResult.parsedCV.personal_information.contact.email}
                      </span>
                    )}
                    {selectedResult.parsedCV.personal_information.contact.phone && (
                      <span className="inline-flex items-center gap-1.5">
                        <Phone className="size-3 text-amber-500" />
                        {selectedResult.parsedCV.personal_information.contact.phone}
                      </span>
                    )}
                    {selectedResult.parsedCV.personal_information.contact.location && (
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="size-3 text-amber-500" />
                        {selectedResult.parsedCV.personal_information.contact.location}
                      </span>
                    )}
                    {selectedResult.parsedCV.personal_information.contact.linkedin && (
                      <span className="inline-flex items-center gap-1.5">
                        <Globe className="size-3 text-amber-500" />
                        {selectedResult.parsedCV.personal_information.contact.linkedin}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* ── Body: 2-column layout ── */}
              <div className="flex flex-col md:flex-row">
                {/* Main column */}
                <div className="flex-1 min-w-0 p-7 sm:p-10 border-r border-slate-200/70">
                  <CvMarkdownBody
                    markdown={markdownCleaned}
                    locale={reportLanguage}
                    density="screen"
                    variant="premium"
                  />
                </div>

                {/* Sidebar */}
                <div className="w-[220px] shrink-0 bg-gradient-to-b from-[#1C1917]/[0.025] to-transparent border-l border-slate-200/60">
                  <div className="p-5 sm:p-6 space-y-6">

                    {/* Skills */}
                    {selectedResult.parsedCV?.skills && (
                      selectedResult.parsedCV.skills.technical_skills?.length > 0 ||
                      selectedResult.parsedCV.skills.soft_skills?.length > 0 ||
                      selectedResult.parsedCV.skills.tools_software?.length > 0
                    ) && (
                      <SidebarSection label={reportLanguage === 'vi' ? 'Kỹ năng' : 'Skills'}>
                        {selectedResult.parsedCV.skills.technical_skills?.length > 0 && (
                          <SkillGroup label={reportLanguage === 'vi' ? 'Chuyên môn' : 'Technical'} skills={selectedResult.parsedCV.skills.technical_skills} />
                        )}
                        {selectedResult.parsedCV.skills.soft_skills?.length > 0 && (
                          <SkillGroup label={reportLanguage === 'vi' ? 'Mềm' : 'Soft'} skills={selectedResult.parsedCV.skills.soft_skills} />
                        )}
                        {selectedResult.parsedCV.skills.tools_software?.length > 0 && (
                          <SkillGroup label={reportLanguage === 'vi' ? 'Công cụ' : 'Tools'} skills={selectedResult.parsedCV.skills.tools_software} />
                        )}
                      </SidebarSection>
                    )}

                    {/* Education */}
                    {selectedResult.parsedCV?.education && selectedResult.parsedCV.education.length > 0 && (
                      <SidebarSection label={reportLanguage === 'vi' ? 'Học vấn' : 'Education'}>
                        <div className="space-y-2">
                          {selectedResult.parsedCV.education.map((edu, i) => (
                            <div key={i} className="p-2.5 rounded-lg border border-amber-200/40 bg-white/70 shadow-sm">
                              <p className="text-[10px] font-bold leading-tight mb-0.5 text-slate-800">{edu.degree || edu.major}</p>
                              <p className="text-[9px] font-semibold leading-tight mb-0.5 text-amber-700">{edu.institution}</p>
                              {edu.graduation_year && (
                                <p className="text-[8.5px] text-slate-400">{edu.graduation_year}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </SidebarSection>
                    )}

                    {/* Languages */}
                    {selectedResult.parsedCV?.skills?.languages && selectedResult.parsedCV.skills.languages.length > 0 && (
                      <SidebarSection label={reportLanguage === 'vi' ? 'Ngôn ngữ' : 'Languages'}>
                        <div className="space-y-1.5">
                          {selectedResult.parsedCV.skills.languages.map((lang, i) => {
                            const profLevel = lang.proficiency?.toLowerCase() || '';
                            const level = profLevel.includes('native') || profLevel.includes('bản') || profLevel.includes('fluent') || profLevel.includes('advanced') || profLevel.includes('cao')
                              ? 5 : profLevel.includes('intermediate') || profLevel.includes('trung')
                              ? 3 : profLevel.includes('basic') || profLevel.includes('cơ')
                              ? 2 : 3;
                            return (
                              <div key={i} className="flex items-center justify-between py-1">
                                <span className="text-[10px] font-semibold text-slate-700">{lang.language}</span>
                                <div className="flex gap-[3px]">
                                  {Array.from({ length: 5 }).map((_, j) => (
                                    <div
                                      key={j}
                                      className="w-2.5 h-[4px] rounded-sm"
                                      style={{
                                        background: j < level ? 'linear-gradient(135deg, #d97706, #f59e0b)' : '#e2e8f0',
                                        boxShadow: j < level ? '0 0 4px rgba(217,119,6,0.25)' : 'none',
                                      }}
                                    />
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </SidebarSection>
                    )}

                  </div>
                </div>
              </div>

              {/* Watermark for free users */}
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
                      <Lock className="inline size-3 mr-1 -mt-0.5" />{t.freePreviewTab}
                    </span>
                  </div>
                </>
              )}

              {/* Footer */}
              <div className="border-t-2 border-slate-200/80 px-8 py-3 flex justify-between items-center flex-wrap gap-2 bg-gradient-to-r from-[#1C1917]/[0.03] to-white/60">
                <span className="font-cv-header text-[8px] font-bold uppercase tracking-[0.14em] text-amber-700/70">
                  cvFit.pro · {isRecruiterPlan(effectivePlan) ? 'Recruiter' : 'Pro'}
                </span>
                <span className="text-[8px] text-slate-400">{t.fullCvDraftFooter}</span>
              </div>
            </motion.div>

          ) : (
            /* ════════════════ FREE PREVIEW ════════════════ */
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="group/cv relative mx-auto min-h-[min(297mm,80vh)] max-w-[210mm] overflow-hidden rounded-sm bg-slate-100 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.4),0_0_0_1px_rgba(0,0,0,0.08)] ring-1 ring-slate-300/60"
            >
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-slate-200/50 via-slate-100/80 to-slate-200/60" />
              <span className="pointer-events-none absolute left-4 top-4 size-5 border-l-2 border-t-2 border-slate-400/40 sm:left-6 sm:top-6 sm:size-6" aria-hidden />
              <span className="pointer-events-none absolute right-4 top-4 size-5 border-r-2 border-t-2 border-slate-400/40 sm:right-6 sm:top-6 sm:size-6" aria-hidden />
              <span className="pointer-events-none absolute bottom-4 left-4 size-5 border-b-2 border-l-2 border-slate-400/40 sm:bottom-6 sm:left-6 sm:size-6" aria-hidden />
              <span className="pointer-events-none absolute bottom-4 right-4 size-5 border-b-2 border-r-2 border-slate-400/40 sm:bottom-6 sm:right-6 sm:size-6" aria-hidden />

              <div className={`relative z-10 p-8 sm:p-14 ${!canExportOptimized ? 'pointer-events-none select-none' : ''}`}>
                <CvMarkdownBody markdown={selectedResult.fullRewrittenCV} locale={reportLanguage} density="screen" />
              </div>

              {!canExportOptimized && (
                <>
                  <div className="pointer-events-none absolute inset-0 z-20 bg-gradient-to-b from-slate-900/10 via-transparent to-slate-900/10" aria-hidden />
                  <div className="pointer-events-none absolute inset-0 z-20 select-none" aria-hidden style={{ backgroundImage: `repeating-linear-gradient(-35deg,transparent,transparent 70px,rgba(100,116,139,0.07) 70px,rgba(100,116,139,0.07) 71px)` }} />
                  <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center select-none" aria-hidden>
                    <span className="rotate-[-22deg] text-[2.8rem] sm:text-[5rem] font-black text-slate-500/[0.16] tracking-[0.25em] uppercase whitespace-nowrap">
                      {t.freePreviewWatermarkPrimary}
                    </span>
                  </div>
                  <div className="pointer-events-none absolute inset-0 z-20 select-none" aria-hidden style={{ backgroundImage: `repeating-linear-gradient(0deg,transparent,transparent 130px,rgba(245,158,11,0.05) 130px,rgba(245,158,11,0.05) 131px),repeating-linear-gradient(90deg,transparent,transparent 170px,rgba(245,158,11,0.04) 170px,rgba(245,158,11,0.04) 171px)` }} />
                  <div className="pointer-events-none absolute inset-0 z-20 select-none overflow-hidden" aria-hidden>
                    <div className="absolute inset-0 flex flex-wrap content-center justify-center gap-16 opacity-[0.06] rotate-[-20deg] scale-150">
                      {Array.from({ length: 20 }).map((_, idx) => (
                        <span key={idx} className="text-[0.65rem] font-black uppercase tracking-[0.3em] text-slate-700 whitespace-nowrap">
                          {t.freePreviewWatermarkSecondary}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="pointer-events-none absolute top-6 right-6 z-20 select-none">
                    <span className="rounded-lg border border-amber-500/35 bg-amber-400/20 backdrop-blur-sm px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.15em] text-amber-500 shadow-[0_0_14px_rgba(245,158,11,0.15)]">
                      <Lock className="inline size-3 mr-1 -mt-0.5" />{t.freePreviewTab}
                    </span>
                  </div>
                </>
              )}

              <div className="relative z-10 mt-12 border-t border-slate-300/60 pt-5 text-center font-cv-header text-[9px] font-bold uppercase tracking-[0.25em] text-slate-400">
                {t.fullCvDraftFooter}
              </div>
            </motion.div>
          )}
        </div>

        <div className="absolute bottom-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-accent/25 to-transparent" />
      </motion.div>
    </div>
  );
});

/* ── Sidebar sub-components ── */

function SidebarSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-[3px] h-3.5 rounded-full shrink-0 bg-gradient-to-b from-amber-500 to-amber-300 shadow-[0_0_6px_rgba(217,119,6,0.3)]" />
        <span className="font-cv-header text-[8px] font-extrabold uppercase tracking-[0.28em] text-[#1C1917]/70">
          {label}
        </span>
      </div>
      {children}
    </div>
  );
}

function SkillGroup({ label, skills }: { label: string; skills: string[] }) {
  return (
    <div className="mb-3 last:mb-0">
      <p className="text-[7.5px] font-bold uppercase tracking-[0.14em] mb-1.5 text-slate-400">{label}</p>
      <div className="flex flex-wrap gap-1">
        {skills.map((s, i) => (
          <span
            key={i}
            className="px-2 py-[3px] rounded-full text-[8.5px] font-semibold bg-amber-50 border border-amber-200/70 text-amber-900 hover:bg-amber-100 hover:border-amber-300 transition-colors duration-150 cursor-default"
          >
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Shared action buttons ── */

interface ActionButtonsProps {
  canExport: boolean;
  copiedId: string | null;
  setCopiedId: (id: string | null) => void;
  fullRewrittenCV: string | undefined;
  navigateToUpgrade: () => void;
  t: UiLabels;
}

function ActionButtons({ canExport, copiedId, setCopiedId, fullRewrittenCV, navigateToUpgrade, t }: ActionButtonsProps) {
  if (!canExport) {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); navigateToUpgrade(); }}
          className="group flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-400/10 px-4 py-3 text-[10px] font-black uppercase tracking-[0.15em] text-amber-400 shadow-sm transition-all duration-200 hover:scale-105 hover:border-amber-500/50 hover:bg-amber-400/20 hover:shadow-[0_0_16px_rgba(245,158,11,0.15)] active:scale-95 cursor-pointer backdrop-blur-sm"
        >
          <Crown className="size-4" />{t.upgradeToUnlock}
        </button>
      </div>
    );
  }
  return (
    <div className="no-print flex flex-wrap items-center gap-2">
      <span className="hidden h-8 w-px bg-white/[0.08] sm:block lg:h-10" aria-hidden />
      <button
        type="button"
        onClick={() => {
          if (fullRewrittenCV) {
            navigator.clipboard.writeText(fullRewrittenCV);
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
          if (fullRewrittenCV) {
            navigator.clipboard.writeText(markdownToPlainText(fullRewrittenCV));
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
        <Printer className="size-4 transition-transform group-hover:scale-110" />{t.printOptimized}
      </button>
    </div>
  );
}
