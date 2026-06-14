import React from 'react';
import { Sparkles } from 'lucide-react';
import { AnalysisResult } from '../../../services/ai/types';
import { useUI } from '../../../context/UIContext';
import { useAuth } from '../../../context/AuthContext';
import { isProPlan, isRecruiterPlan } from '../../../lib/planLimits';
import { CvMarkdownBody } from './CvMarkdownBody';
import { extractCandidateName, cleanMarkdownForPremium } from './cvPremiumUtils';

interface PrintViewProps {
  selectedResult: AnalysisResult;
}

function readPrintState(): { variant: 'premium' | 'free'; version: string } {
  try {
    const variant = sessionStorage.getItem('cvFit_viewMode');
    const version = sessionStorage.getItem('cvFit_printVersion') || '0';
    if (variant === 'premium') return { variant: 'premium', version };
  } catch { /* ignore */ }
  return { variant: 'free', version: '0' };
}

export const PrintView: React.FC<PrintViewProps> = ({ selectedResult }) => {
  const { reportLanguage, t } = useUI();
  const { effectivePlan, userProfile } = useAuth();
  const canExportOptimized =
    userProfile?.role === 'admin' || isProPlan(effectivePlan) || isRecruiterPlan(effectivePlan);

  const [, forceUpdate] = React.useReducer((x) => x + 1, 0);
  React.useEffect(() => {
    const handler = () => forceUpdate();
    window.addEventListener('cvfit:viewModeChanged', handler);
    return () => window.removeEventListener('cvfit:viewModeChanged', handler);
  }, []);

  const { variant: printVariant, version: printVersion } = readPrintState();
  const printKey = `print-${selectedResult.id}-${printVersion}`;

  if (!canExportOptimized) {
    return (
      <div id="cv-print-root" className="min-h-screen bg-white flex items-center justify-center p-8">
        <div className="text-center space-y-4 max-w-sm">
          <Sparkles className="size-10 text-slate-300 mx-auto" />
          <p className="text-sm font-medium text-slate-500">{t.upgradeFeatureExportCv}</p>
          <p className="text-xs text-slate-400">{t.upgradePromptFeature.replace('{feature}', t.upgradeFeatureExportCv)}</p>
        </div>
      </div>
    );
  }

  /* ── Premium: 2-column layout matching the screen design ── */
  if (printVariant === 'premium') {
    const candidateName = extractCandidateName(selectedResult);
    const markdownCleaned = cleanMarkdownForPremium(selectedResult.fullRewrittenCV);
    const contact = selectedResult.parsedCV?.personal_information?.contact;
    const parsedCV = selectedResult.parsedCV;

    return (
      <div id="cv-print-root" style={{ background: '#FCFCFC' }} key={printKey}>
        {/* cv-print-accent applies print-color-adjust: exact from index.css */}
        <div className="max-w-[210mm] mx-auto" style={{ background: '#FCFCFC', fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>

          {/* ── Header ── */}
          <div style={{ overflow: 'hidden' }}>
            {/* Amber top strip — needs print-color-adjust */}
            <div
              className="cv-print-accent"
              style={{ height: '3.5px', background: 'linear-gradient(to right, #b45309, #d97706, #f59e0b)' }}
            />

            {/* Name band — white bg (print-safe), dark text */}
            <div style={{ background: '#fff', padding: '20pt 20mm 14pt', borderBottom: '0.5px solid #e2e8f0' }}>
              {candidateName && (
                <h1 style={{
                  fontFamily: "'Inter', system-ui, sans-serif",
                  fontSize: '26pt',
                  fontWeight: 900,
                  textTransform: 'uppercase',
                  letterSpacing: '-0.025em',
                  color: '#1C1917',
                  lineHeight: 0.92,
                  margin: '0 0 7pt',
                }}>
                  {candidateName}
                </h1>
              )}
              {selectedResult.jobTitle && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '7pt' }}>
                  <div
                    className="cv-print-accent"
                    style={{ width: '20pt', height: '1px', background: '#d97706', flexShrink: 0 }}
                  />
                  <p
                    className="cv-print-accent"
                    style={{ fontSize: '7.5pt', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#d97706', margin: 0 }}
                  >
                    {selectedResult.jobTitle}
                  </p>
                </div>
              )}
            </div>

            {/* Contact strip */}
            {contact && (
              <div style={{ background: '#f8fafc', borderBottom: '1.5px solid #e2e8f0', padding: '7pt 20mm', display: 'flex', flexWrap: 'wrap', gap: '0 18pt', alignItems: 'center' }}>
                {contact.email && (
                  <span style={{ fontSize: '7pt', color: '#475569', display: 'flex', alignItems: 'center', gap: '3.5pt' }}>
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                    {contact.email}
                  </span>
                )}
                {contact.phone && (
                  <span style={{ fontSize: '7pt', color: '#475569', display: 'flex', alignItems: 'center', gap: '3.5pt' }}>
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.15 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.06 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 8.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                    {contact.phone}
                  </span>
                )}
                {contact.location && (
                  <span style={{ fontSize: '7pt', color: '#475569', display: 'flex', alignItems: 'center', gap: '3.5pt' }}>
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                    {contact.location}
                  </span>
                )}
                {contact.linkedin && (
                  <span style={{ fontSize: '7pt', color: '#475569', display: 'flex', alignItems: 'center', gap: '3.5pt' }}>
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>
                    {contact.linkedin}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* ── 2-column body ── */}
          <div style={{ display: 'flex', alignItems: 'flex-start' }}>

            {/* Main column */}
            <div style={{ flex: 1, minWidth: 0, padding: '14pt 12pt 20pt 20mm', borderRight: '1px solid #e2e8f0' }}>
              <CvMarkdownBody
                markdown={markdownCleaned}
                locale={reportLanguage}
                density="print"
                variant="premium"
              />
            </div>

            {/* Sidebar */}
            <div style={{ width: '58mm', flexShrink: 0, padding: '14pt 18mm 20pt 10pt', background: 'linear-gradient(to bottom, #fffbeb, #fafaf9)' }}>

              {/* Skills */}
              {parsedCV?.skills && (
                (parsedCV.skills.technical_skills?.length > 0) ||
                (parsedCV.skills.soft_skills?.length > 0) ||
                (parsedCV.skills.tools_software?.length > 0)
              ) && (
                <div style={{ marginBottom: '14pt' }}>
                  <PrintSidebarLabel>{reportLanguage === 'vi' ? 'Kỹ năng' : 'Skills'}</PrintSidebarLabel>
                  {parsedCV.skills.technical_skills?.length > 0 && (
                    <PrintSkillGroup label={reportLanguage === 'vi' ? 'Chuyên môn' : 'Technical'} skills={parsedCV.skills.technical_skills} />
                  )}
                  {parsedCV.skills.soft_skills?.length > 0 && (
                    <PrintSkillGroup label={reportLanguage === 'vi' ? 'Kỹ năng mềm' : 'Soft Skills'} skills={parsedCV.skills.soft_skills} />
                  )}
                  {parsedCV.skills.tools_software?.length > 0 && (
                    <PrintSkillGroup label={reportLanguage === 'vi' ? 'Công cụ' : 'Tools'} skills={parsedCV.skills.tools_software} />
                  )}
                </div>
              )}

              {/* Education */}
              {parsedCV?.education && parsedCV.education.length > 0 && (
                <div style={{ marginBottom: '14pt' }}>
                  <PrintSidebarLabel>{reportLanguage === 'vi' ? 'Học vấn' : 'Education'}</PrintSidebarLabel>
                  <div>
                    {parsedCV.education.map((edu, i) => (
                      <div key={i} style={{ marginBottom: '7pt', paddingBottom: '7pt', borderBottom: i < parsedCV.education.length - 1 ? '0.5px solid #fde68a' : 'none' }}>
                        <p style={{ fontSize: '8pt', fontWeight: 700, color: '#1e293b', margin: '0 0 2pt' }}>{edu.degree || edu.major}</p>
                        <p className="cv-print-accent" style={{ fontSize: '7.5pt', fontWeight: 600, color: '#d97706', margin: '0 0 1.5pt' }}>{edu.institution}</p>
                        {edu.graduation_year && <p style={{ fontSize: '7pt', color: '#94a3b8', margin: 0 }}>{edu.graduation_year}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Languages */}
              {parsedCV?.skills?.languages && parsedCV.skills.languages.length > 0 && (
                <div>
                  <PrintSidebarLabel>{reportLanguage === 'vi' ? 'Ngôn ngữ' : 'Languages'}</PrintSidebarLabel>
                  <div>
                    {parsedCV.skills.languages.map((lang, i) => {
                      const p = lang.proficiency?.toLowerCase() || '';
                      const level = p.includes('native') || p.includes('bản') || p.includes('fluent') || p.includes('advanced') || p.includes('cao')
                        ? 5 : p.includes('intermediate') || p.includes('trung') ? 3
                        : p.includes('basic') || p.includes('cơ') ? 2 : 3;
                      return (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5pt' }}>
                          <span style={{ fontSize: '8pt', fontWeight: 600, color: '#334155' }}>{lang.language}</span>
                          <div style={{ display: 'flex', gap: '2.5pt' }}>
                            {Array.from({ length: 5 }).map((_, j) => (
                              <div
                                key={j}
                                className="cv-print-accent"
                                style={{
                                  width: '8pt', height: '3.5pt', borderRadius: '1pt',
                                  background: j < level ? '#d97706' : '#e2e8f0',
                                }}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            </div>
          </div>

          {/* Footer */}
          <div style={{ borderTop: '1px solid #e2e8f0', padding: '6pt 20mm', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fafaf9' }}>
            <span className="cv-print-accent" style={{ fontSize: '6pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#b45309' }}>
              cvFit.pro · {isRecruiterPlan(effectivePlan) ? 'Recruiter' : 'Pro'}
            </span>
            <span style={{ fontSize: '6pt', color: '#94a3b8' }}>{t.fullCvDraftFooter}</span>
          </div>

        </div>
      </div>
    );
  }

  /* ── Free preview: flat single-column (unchanged) ── */
  return (
    <div id="cv-print-root" className="min-h-screen bg-white">
      <div className="max-w-[210mm] mx-auto bg-white p-[20mm]" key={printKey}>
        <CvMarkdownBody
          key={`print-cv-${selectedResult.id}-${printVersion}`}
          markdown={selectedResult.fullRewrittenCV || ''}
          locale={reportLanguage}
          density="print"
          variant="free"
        />
        <div className="mt-20 border-t border-border pt-8 text-center text-[10px] italic text-text-light">
          {t.fullCvDraftFooter}
        </div>
      </div>
    </div>
  );
};

/* ── Print sidebar sub-components ── */

function PrintSidebarLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '5pt', marginBottom: '7pt' }}>
      <div
        className="cv-print-accent"
        style={{ width: '2pt', height: '10pt', borderRadius: '1pt', background: 'linear-gradient(to bottom, #d97706, #f59e0b)', flexShrink: 0 }}
      />
      <span style={{ fontSize: '7pt', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.28em', color: '#44403c' }}>
        {children}
      </span>
    </div>
  );
}

function PrintSkillGroup({ label, skills }: { label: string; skills: string[] }) {
  return (
    <div style={{ marginBottom: '7pt' }}>
      <p style={{ fontSize: '6.5pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#94a3b8', margin: '0 0 3pt' }}>
        {label}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3pt' }}>
        {skills.map((s, i) => (
          <span
            key={i}
            className="cv-print-accent"
            style={{ padding: '2pt 5pt', borderRadius: '20pt', fontSize: '7pt', fontWeight: 600, background: '#fef3c7', border: '0.5px solid #fcd34d', color: '#78350f' }}
          >
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}
