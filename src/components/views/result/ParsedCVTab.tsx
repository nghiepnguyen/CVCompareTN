import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  User, Mail, Phone, MapPin, Linkedin, Globe, 
  Briefcase, GraduationCap, Code, Languages, 
  Terminal, Award, Layers, Clock, TrendingUp, 
  Search, ShieldCheck, ExternalLink, Calendar
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import { useUI } from '../../../context/UIContext';
import { AnalysisResult } from '../../../services/ai';

interface ParsedCVTabProps {
  selectedResult: AnalysisResult;
}

export function ParsedCVTab({ selectedResult }: ParsedCVTabProps) {
  const { t } = useUI();
  const parsedCV = selectedResult.parsedCV;

  if (!parsedCV) {
    return (
      <div className="bg-white p-12 rounded-3xl border border-slate-200 text-center">
        <p className="text-slate-500 italic">
          {t.parsedCvEmpty}
        </p>
      </div>
    );
  }

  const { personal_information, education, work_experience, skills, projects, certifications, ats_evaluation } = parsedCV;

  return (
    <div id="parsed-cv-content" className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 scroll-mt-24">
      
      {/* ATS Summary Header */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="md:col-span-1 bg-accent p-6 rounded-3xl text-white shadow-lg shadow-accent-light/50">
          <div className="flex flex-col items-center text-center h-full justify-center">
            <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center mb-4">
              <Clock className="w-6 h-6 text-white" />
            </div>
            <div className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80 mb-1">{t.parsedYearsExp}</div>
            <div className="text-4xl font-black">{ats_evaluation.years_of_experience}</div>
            <div className="text-xs font-bold opacity-80 mt-1">{t.parsedYearsUnit}</div>
          </div>
        </div>

        <div className="md:col-span-3 bg-surface p-6 rounded-3xl border border-border shadow-sm flex flex-col sm:flex-row gap-6">
          <div className="flex-1 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent-light flex items-center justify-center text-accent">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[10px] font-black text-text-light uppercase tracking-widest">{t.parsedRelevance}</div>
                <div className="text-lg font-black text-text-main">{ats_evaluation.relevant_score}%</div>
              </div>
            </div>
            <div className="w-full bg-surface-secondary h-2 rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${ats_evaluation.relevant_score}%` }}
                className="h-full bg-accent rounded-full"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {ats_evaluation.key_match_highlights.slice(0, 3).map((h, i) => (
                <span key={i} className="px-3 py-1 rounded-full bg-accent-light text-accent text-[10px] font-bold border border-accent/20">
                  {h}
                </span>
              ))}
            </div>
          </div>

          <div className="w-px bg-border hidden sm:block" />

          <div className="flex-1 space-y-3">
            <div className="flex items-center gap-2 text-warning">
              <Search className="w-4 h-4" />
              <span className="text-[10px] font-black uppercase tracking-widest">{t.parsedMissingKeywords}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ats_evaluation.missing_keywords.map((k, i) => (
                <span key={i} className="px-2 py-0.5 rounded-lg bg-warning-light text-warning text-[10px] font-medium border border-warning/20">
                  {k}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Profile & Skills */}
        <div className="lg:col-span-1 space-y-8">
          {/* Personal Information */}
          <div className="bg-surface p-6 rounded-3xl border border-border shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <User className="w-24 h-24 text-accent" />
            </div>
            <h4 className="text-xs font-black text-text-muted uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
              <User className="w-4 h-4" />
              {t.parsedPersonalInfo}
            </h4>
            <div className="space-y-6">
              <div>
                <h3 className="text-2xl font-black text-text-main mb-1">{personal_information.full_name}</h3>
                <p className="text-sm text-text-muted leading-relaxed italic line-clamp-4">
                  "{personal_information.summary}"
                </p>
              </div>
              
              <div className="space-y-3 pt-4 border-t border-border">
                <div className="flex items-center gap-3 text-sm text-text-muted">
                  <Mail className="w-4 h-4 text-accent shrink-0" />
                  <span className="truncate">{personal_information.contact.email}</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-text-muted">
                  <Phone className="w-4 h-4 text-accent shrink-0" />
                  <span>{personal_information.contact.phone}</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-text-muted">
                  <MapPin className="w-4 h-4 text-accent shrink-0" />
                  <span>{personal_information.contact.location}</span>
                </div>
                {personal_information.contact.linkedin && (
                  <a 
                    href={personal_information.contact.linkedin.startsWith('http') ? personal_information.contact.linkedin : `https://${personal_information.contact.linkedin}`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-3 text-sm text-accent hover:underline"
                  >
                    <Linkedin className="w-4 h-4 shrink-0" />
                    <span>LinkedIn Profile</span>
                  </a>
                )}
                {personal_information.contact.website_portfolio && (
                  <a 
                    href={personal_information.contact.website_portfolio.startsWith('http') ? personal_information.contact.website_portfolio : `https://${personal_information.contact.website_portfolio}`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-3 text-sm text-accent hover:underline"
                  >
                    <Globe className="w-4 h-4 shrink-0" />
                    <span>Portfolio / Website</span>
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Skills & Languages */}
          <div className="bg-surface p-6 rounded-3xl border border-border shadow-sm">
            <h4 className="text-xs font-black text-text-muted uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
              <Terminal className="w-4 h-4" />
              {t.parsedSkillsLang}
            </h4>
            
            <div className="space-y-6">
              {/* Technical */}
              <div>
                <div className="text-[10px] font-black text-accent uppercase tracking-widest mb-3 flex items-center gap-2">
                  <Code className="w-3 h-3" />
                  {t.parsedTechSkills}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(skills.technical_skills || []).map((s, i) => (
                    <span key={i} className="px-2.5 py-1 rounded-lg bg-accent-light text-accent text-xs font-bold border border-accent/20">
                      {s}
                    </span>
                  ))}
                </div>
              </div>

              {/* Tools */}
              <div>
                <div className="text-[10px] font-black text-text-main uppercase tracking-widest mb-3 flex items-center gap-2">
                  <Layers className="w-3 h-3" />
                  {t.parsedToolsSoftware}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(skills.tools_software || []).map((s, i) => (
                    <span key={i} className="px-2.5 py-1 rounded-lg bg-surface-secondary text-text-main text-xs font-bold border border-border">
                      {s}
                    </span>
                  ))}
                </div>
              </div>

              {/* Soft Skills */}
              <div>
                <div className="text-[10px] font-black text-success uppercase tracking-widest mb-3 flex items-center gap-2">
                  <TrendingUp className="w-3 h-3" />
                  {t.parsedSoftSkills}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(skills.soft_skills || []).map((s, i) => (
                    <span key={i} className="px-2.5 py-1 rounded-lg bg-success-light text-success text-xs font-bold border border-success/20">
                      {s}
                    </span>
                  ))}
                </div>
              </div>

              {/* Languages */}
              {skills.languages && skills.languages.length > 0 && (
                <div>
                  <div className="text-[10px] font-black text-warning uppercase tracking-widest mb-3 flex items-center gap-2">
                    <Languages className="w-3 h-3" />
                    {t.parsedLanguages}
                  </div>
                  <div className="space-y-2">
                    {skills.languages.map((l, i) => (
                      <div key={i} className="flex items-center justify-between p-2 rounded-xl bg-warning-light border border-warning/20">
                        <span className="text-xs font-bold text-text-main">{l.language}</span>
                        <span className="text-[10px] font-black text-warning uppercase">{l.proficiency}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Experience & Education */}
        <div className="lg:col-span-2 space-y-8">
          {/* Work Experience */}
          <div className="bg-surface p-6 rounded-3xl border border-border shadow-sm">
            <h4 className="text-xs font-black text-text-muted uppercase tracking-[0.2em] mb-8 flex items-center gap-2">
              <Briefcase className="w-4 h-4" />
              {t.parsedExperience}
            </h4>
            
            <div className="space-y-10 relative">
              {/* Timeline line */}
              <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-border sm:left-[19px]" />
              
              {work_experience.map((exp, i) => (
                <div key={i} className="relative pl-10 sm:pl-14 group">
                  {/* Circle marker */}
                  <div className="absolute left-0 top-1.5 w-6 h-6 rounded-full bg-surface border-4 border-accent-light group-hover:border-accent transition-colors z-10 sm:left-2 sm:w-8 sm:h-8" />
                  
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <h5 className="text-lg font-black text-text-main group-hover:text-accent transition-colors">{exp.job_title}</h5>
                        <p className="text-sm font-bold text-text-muted">{exp.company}</p>
                      </div>
                      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-secondary text-text-light text-[10px] font-black uppercase tracking-widest whitespace-nowrap">
                        <Calendar className="w-3 h-3" />
                        {exp.duration.start} - {exp.duration.is_current ? t.parsedPresent : exp.duration.end}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="grid grid-cols-1 gap-4">
                        {(exp.responsibilities || []).length > 0 && (
                          <div className="space-y-1.5">
                            <p className="text-[10px] font-black text-text-light uppercase tracking-widest">Nhiệm vụ chính</p>
                            <ul className="space-y-1.5">
                              {(exp.responsibilities || []).map((r, ri) => (
                                <li key={ri} className="text-xs text-text-muted flex items-start gap-2 leading-relaxed">
                                  <div className="w-1 h-1 rounded-full bg-border mt-1.5 shrink-0" />
                                  {r}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {(exp.achievements || []).length > 0 && (
                          <div className="space-y-1.5">
                            <p className="text-[10px] font-black text-success uppercase tracking-widest">Thành tựu nổi bật</p>
                            <ul className="space-y-1.5">
                              {(exp.achievements || []).map((a, ai) => (
                                <li key={ai} className="text-xs text-text-main font-medium flex items-start gap-2 leading-relaxed p-2 rounded-lg bg-success-light/30 border border-success/20">
                                  <Award className="w-3 h-3 text-success mt-0.5 shrink-0" />
                                  {a}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Education */}
          <div className="bg-surface p-6 rounded-3xl border border-border shadow-sm">
            <h4 className="text-xs font-black text-text-muted uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
              <GraduationCap className="w-4 h-4" />
              {t.parsedEducation}
            </h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(education || []).map((edu, i) => (
                <div key={i} className="p-4 rounded-2xl bg-surface-secondary border border-border space-y-2 group hover:border-accent transition-colors">
                  <div className="flex justify-between items-start">
                    <h5 className="font-black text-text-main text-sm leading-snug">{edu.degree}</h5>
                    <span className="text-[10px] font-black text-text-light px-2 py-0.5 rounded-full bg-surface border border-border">
                      {edu.graduation_year}
                    </span>
                  </div>
                  <p className="text-xs font-bold text-accent">{edu.major}</p>
                  <p className="text-xs text-text-muted">{edu.institution}</p>
                  {edu.gpa && (
                    <div className="pt-2 flex items-center gap-2">
                      <span className="text-[10px] font-black text-text-light uppercase tracking-widest">GPA:</span>
                      <span className="text-xs font-black text-success">{edu.gpa}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Projects & Certs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Projects */}
            {projects && projects.length > 0 && (
              <div className="bg-surface p-6 rounded-3xl border border-border shadow-sm space-y-4">
                <h4 className="text-xs font-black text-text-muted uppercase tracking-[0.2em] flex items-center gap-2">
                  <Terminal className="w-4 h-4" />
                  {t.parsedProjects}
                </h4>
                <div className="space-y-4">
                  {(projects || []).map((p, i) => (
                    <div key={i} className="space-y-2 pb-4 border-b border-border last:border-0 last:pb-0">
                      <div className="flex justify-between items-center">
                        <h5 className="text-sm font-black text-text-main">{p.name}</h5>
                        {p.link && (
                          <a href={p.link} target="_blank" rel="noopener noreferrer" className="text-accent">
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                      <p className="text-xs text-text-muted leading-relaxed">{p.description}</p>
                      <div className="flex flex-wrap gap-1">
                        {(p.tech_stack || []).map((tech, ti) => (
                          <span key={ti} className="px-1.5 py-0.5 rounded bg-surface-secondary text-[10px] font-bold text-text-muted">
                            {tech}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Certifications */}
            {certifications && certifications.length > 0 && (
              <div className="bg-surface p-6 rounded-3xl border border-border shadow-sm space-y-4 h-full">
                <h4 className="text-xs font-black text-text-muted uppercase tracking-[0.2em] flex items-center gap-2">
                  <Award className="w-4 h-4" />
                  {t.parsedCertifications}
                </h4>
                <div className="space-y-3">
                  {(certifications || []).map((cert, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-2xl bg-success-light/30 border border-success/20">
                      <div className="w-8 h-8 rounded-xl bg-success-light flex items-center justify-center shrink-0">
                        <Award className="w-4 h-4 text-success" />
                      </div>
                      <span className="text-xs font-bold text-text-main leading-tight">{cert}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
