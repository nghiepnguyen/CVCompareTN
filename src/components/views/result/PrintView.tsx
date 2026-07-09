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

    const contactValues = [contact?.email, contact?.phone, contact?.location, contact?.linkedin, contact?.website_portfolio].filter(Boolean) as string[];

    return (
      <div id="cv-print-root" style={{ background: '#FFFFFF' }} key={printKey}>
        {/* cv-print-accent applies print-color-adjust: exact from index.css */}
        <div className="max-w-[210mm] mx-auto" style={{ background: '#FFFFFF', fontFamily: "'Plus Jakarta Sans', -apple-system, Arial, Helvetica, sans-serif" }}>

          {/* ── Header — light editorial band, matches cv-ats-premium.html ── */}
          <div style={{ overflow: 'hidden', position: 'relative', background: '#F3F5F9', borderBottom: '1px solid #E0E0E0' }}>
            {/* Top accent bar */}
            <div className="cv-print-accent" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3pt', background: '#152D4F' }} />

            <div style={{ padding: '30pt 20mm 20pt' }}>
              {candidateName && (
                <h1 style={{
                  fontFamily: "'Cormorant Garamond', Georgia, 'Times New Roman', serif",
                  fontSize: '34pt',
                  fontWeight: 300,
                  letterSpacing: '-0.01em',
                  color: '#141414',
                  lineHeight: 1,
                  margin: '0 0 7pt',
                }}>
                  {candidateName}
                </h1>
              )}
              {selectedResult.jobTitle && (
                <p
                  className="cv-print-accent"
                  style={{ fontSize: '7.5pt', fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#152D4F', margin: '0 0 13pt' }}
                >
                  {selectedResult.jobTitle}
                </p>
              )}

              {/* Contact row — plain text, bullet separators (no icons: matches reference) */}
              {contactValues.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', fontSize: '7.5pt', color: '#5E5E5E' }}>
                  {contactValues.map((val, i) => (
                    <span key={val} style={{ display: 'flex', alignItems: 'center' }}>
                      {val}
                      {i < contactValues.length - 1 && (
                        <span className="cv-print-accent" style={{ margin: '0 8pt', color: '#152D4F', opacity: 0.5 }}>•</span>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── 1-column body — ATS-safe linear reading order ── */}
          <div>

            {/* Main content: Summary + Experience */}
            <div style={{ padding: '14pt 20mm 4pt' }}>
              <CvMarkdownBody
                markdown={markdownCleaned}
                locale={reportLanguage}
                density="print"
                variant="premium"
              />
            </div>

            {/* Skills / Education / Languages — stacked full width, not a parallel sidebar */}
            <div style={{ padding: '10pt 20mm 20pt', borderTop: '1px solid #E0E0E0' }}>

              {/* Skills */}
              {parsedCV?.skills && (
                (parsedCV.skills.technical_skills?.length > 0) ||
                (parsedCV.skills.soft_skills?.length > 0) ||
                (parsedCV.skills.hard_skills?.length > 0) ||
                (parsedCV.skills.tools_software?.length > 0)
              ) && (
                <div style={{ marginBottom: '16pt' }}>
                  <PrintSidebarLabel>{reportLanguage === 'vi' ? 'Kỹ năng' : 'Skills'}</PrintSidebarLabel>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '7pt' }}>
                    {parsedCV.skills.technical_skills?.length > 0 && (
                      <PrintSkillRow label={reportLanguage === 'vi' ? 'Chuyên môn' : 'Technical'} skills={parsedCV.skills.technical_skills} />
                    )}
                    {parsedCV.skills.hard_skills?.length > 0 && (
                      <PrintSkillRow label={reportLanguage === 'vi' ? 'Kỹ năng cứng' : 'Hard Skills'} skills={parsedCV.skills.hard_skills} />
                    )}
                    {parsedCV.skills.soft_skills?.length > 0 && (
                      <PrintSkillRow label={reportLanguage === 'vi' ? 'Kỹ năng mềm' : 'Soft Skills'} skills={parsedCV.skills.soft_skills} />
                    )}
                    {parsedCV.skills.tools_software?.length > 0 && (
                      <PrintSkillRow label={reportLanguage === 'vi' ? 'Công cụ' : 'Tools'} skills={parsedCV.skills.tools_software} />
                    )}
                  </div>
                </div>
              )}

              {/* Education */}
              {parsedCV?.education && parsedCV.education.length > 0 && (
                <div style={{ marginBottom: '16pt' }}>
                  <PrintSidebarLabel>{reportLanguage === 'vi' ? 'Học vấn' : 'Education'}</PrintSidebarLabel>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8pt' }}>
                    {parsedCV.education.map((edu, i) => (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: '52mm 1fr', gap: '0 8pt' }}>
                        <span style={{ fontSize: '7.5pt', color: '#909090', paddingTop: '1pt' }}>{edu.graduation_year}</span>
                        <div>
                          <p style={{ fontSize: '9pt', fontWeight: 600, color: '#141414', margin: '0 0 2pt' }}>{edu.degree || edu.major}</p>
                          <p style={{ fontSize: '8pt', fontWeight: 300, color: '#5E5E5E', margin: 0 }}>{edu.institution}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Languages */}
              {parsedCV?.skills?.languages && parsedCV.skills.languages.length > 0 && (
                <div>
                  <PrintSidebarLabel>{reportLanguage === 'vi' ? 'Ngôn ngữ' : 'Languages'}</PrintSidebarLabel>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5pt' }}>
                    {parsedCV.skills.languages.map((lang, i) => {
                      const p = lang.proficiency?.toLowerCase() || '';
                      const level = p.includes('native') || p.includes('bản') || p.includes('fluent') || p.includes('advanced') || p.includes('cao')
                        ? 5 : p.includes('intermediate') || p.includes('trung') ? 3
                        : p.includes('basic') || p.includes('cơ') ? 2 : 3;
                      return (
                        <div key={i} style={{ display: 'grid', gridTemplateColumns: '52mm 1fr', alignItems: 'center', gap: '0 8pt' }}>
                          <span style={{ fontSize: '8.5pt', fontWeight: 600, color: '#141414' }}>{lang.language}</span>
                          <div style={{ display: 'flex', gap: '2.5pt' }}>
                            {Array.from({ length: 5 }).map((_, j) => (
                              <div
                                key={j}
                                className="cv-print-accent"
                                style={{
                                  width: '8pt', height: '3.5pt', borderRadius: '1pt',
                                  background: j < level ? '#152D4F' : '#E0E0E0',
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
          <div style={{ borderTop: '1px solid #E0E0E0', padding: '6pt 20mm', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="cv-print-accent" style={{ fontSize: '6pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#152D4F' }}>
              cvFit.pro · {isRecruiterPlan(effectivePlan) ? 'Recruiter' : 'Pro'}
            </span>
            <span style={{ fontSize: '6pt', color: '#909090' }}>{t.fullCvDraftFooter}</span>
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
    <div style={{ display: 'flex', alignItems: 'center', gap: '7pt', marginBottom: '9pt' }}>
      <span
        className="cv-print-accent"
        style={{ fontSize: '7pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.22em', color: '#152D4F', whiteSpace: 'nowrap' }}
      >
        {children}
      </span>
      <div style={{ height: '0.5pt', flex: 1, background: '#E0E0E0' }} />
    </div>
  );
}

function PrintSkillRow({ label, skills }: { label: string; skills: string[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '52mm 1fr', gap: '0 8pt', alignItems: 'start' }}>
      <p style={{ fontSize: '6.5pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#909090', margin: 0, paddingTop: '2pt' }}>
        {label}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3pt' }}>
        {skills.map((s, i) => (
          <span
            key={i}
            style={{ padding: '2pt 6pt', borderRadius: '3pt', fontSize: '7.5pt', fontWeight: 400, background: '#ECF0F7', color: '#5E5E5E' }}
          >
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}
