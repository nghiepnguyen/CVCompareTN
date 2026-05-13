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
import { AnalysisResult } from '../../../services/aiService';

interface ParsedCVTabProps {
  selectedResult: AnalysisResult;
}

export function ParsedCVTab({ selectedResult }: ParsedCVTabProps) {
  const { reportLanguage } = useUI();
  const parsedCV = selectedResult.parsedCV;

  if (!parsedCV) {
    return (
      <div className="bg-white p-12 rounded-3xl border border-slate-200 text-center">
        <p className="text-slate-500 italic">
          {reportLanguage === 'vi' 
            ? 'Không có dữ liệu CV chuẩn hóa cho kết quả này.' 
            : 'No parsed CV data available for this result.'}
        </p>
      </div>
    );
  }

  const { personal_information, education, work_experience, skills, projects, certifications, ats_evaluation } = parsedCV;

  const t = {
    personalInfo: reportLanguage === 'vi' ? 'Thông tin cá nhân' : 'Personal Information',
    education: reportLanguage === 'vi' ? 'Học vấn' : 'Education',
    experience: reportLanguage === 'vi' ? 'Kinh nghiệm làm việc' : 'Work Experience',
    skills: reportLanguage === 'vi' ? 'Kỹ năng & Ngôn ngữ' : 'Skills & Languages',
    projects: reportLanguage === 'vi' ? 'Dự án tiêu biểu' : 'Featured Projects',
    certifications: reportLanguage === 'vi' ? 'Chứng chỉ' : 'Certifications',
    atsAnalysis: reportLanguage === 'vi' ? 'Phân tích ATS chi tiết' : 'Detailed ATS Analysis',
    yearsExp: reportLanguage === 'vi' ? 'Tổng năm kinh nghiệm' : 'Total Experience',
    relevance: reportLanguage === 'vi' ? 'Độ liên quan chuyên môn' : 'Professional Relevance',
    highlights: reportLanguage === 'vi' ? 'Điểm mạnh nổi bật' : 'Key Highlights',
    missingKeywords: reportLanguage === 'vi' ? 'Từ khóa còn thiếu' : 'Missing Keywords',
    present: reportLanguage === 'vi' ? 'Hiện tại' : 'Present',
    techSkills: reportLanguage === 'vi' ? 'Kỹ năng chuyên môn' : 'Technical Skills',
    softSkills: reportLanguage === 'vi' ? 'Kỹ năng mềm' : 'Soft Skills',
    tools: reportLanguage === 'vi' ? 'Công cụ & Phần mềm' : 'Tools & Software',
    languages: reportLanguage === 'vi' ? 'Ngoại ngữ' : 'Languages'
  };

  return (
    <div id="parsed-cv-content" className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 scroll-mt-24">
      
      {/* ATS Summary Header */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="md:col-span-1 bg-gradient-to-br from-indigo-600 to-violet-700 p-6 rounded-3xl text-white shadow-lg shadow-indigo-200/50">
          <div className="flex flex-col items-center text-center h-full justify-center">
            <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center mb-4">
              <Clock className="w-6 h-6 text-white" />
            </div>
            <div className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80 mb-1">{t.yearsExp}</div>
            <div className="text-4xl font-black">{ats_evaluation.years_of_experience}</div>
            <div className="text-xs font-bold opacity-80 mt-1">{reportLanguage === 'vi' ? 'Năm' : 'Years'}</div>
          </div>
        </div>

        <div className="md:col-span-3 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-6">
          <div className="flex-1 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t.relevance}</div>
                <div className="text-lg font-black text-slate-800">{ats_evaluation.relevant_score}%</div>
              </div>
            </div>
            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${ats_evaluation.relevant_score}%` }}
                className="h-full bg-emerald-500 rounded-full"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {ats_evaluation.key_match_highlights.slice(0, 3).map((h, i) => (
                <span key={i} className="px-3 py-1 rounded-full bg-indigo-50 text-indigo-600 text-[10px] font-bold border border-indigo-100">
                  {h}
                </span>
              ))}
            </div>
          </div>

          <div className="w-px bg-slate-100 hidden sm:block" />

          <div className="flex-1 space-y-3">
            <div className="flex items-center gap-2 text-amber-600">
              <Search className="w-4 h-4" />
              <span className="text-[10px] font-black uppercase tracking-widest">{t.missingKeywords}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ats_evaluation.missing_keywords.map((k, i) => (
                <span key={i} className="px-2 py-0.5 rounded-lg bg-amber-50 text-amber-700 text-[10px] font-medium border border-amber-100">
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
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <User className="w-24 h-24 text-indigo-600" />
            </div>
            <h4 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
              <User className="w-4 h-4" />
              {t.personalInfo}
            </h4>
            <div className="space-y-6">
              <div>
                <h3 className="text-2xl font-black text-slate-800 mb-1">{personal_information.full_name}</h3>
                <p className="text-sm text-slate-500 leading-relaxed italic line-clamp-4">
                  "{personal_information.summary}"
                </p>
              </div>
              
              <div className="space-y-3 pt-4 border-t border-slate-100">
                <div className="flex items-center gap-3 text-sm text-slate-600">
                  <Mail className="w-4 h-4 text-indigo-500 shrink-0" />
                  <span className="truncate">{personal_information.contact.email}</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-600">
                  <Phone className="w-4 h-4 text-indigo-500 shrink-0" />
                  <span>{personal_information.contact.phone}</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-600">
                  <MapPin className="w-4 h-4 text-indigo-500 shrink-0" />
                  <span>{personal_information.contact.location}</span>
                </div>
                {personal_information.contact.linkedin && (
                  <a 
                    href={personal_information.contact.linkedin.startsWith('http') ? personal_information.contact.linkedin : `https://${personal_information.contact.linkedin}`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-3 text-sm text-indigo-600 hover:underline"
                  >
                    <Linkedin className="w-4 h-4 shrink-0" />
                    <span>LinkedIn Profile</span>
                  </a>
                )}
                {personal_information.contact.website_portfolio && (
                  <a 
                    href={personal_information.contact.website_portfolio.startsWith('http') ? personal_information.contact.website_portfolio : `https://${personal_information.contact.website_portfolio}`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-3 text-sm text-indigo-600 hover:underline"
                  >
                    <Globe className="w-4 h-4 shrink-0" />
                    <span>Portfolio / Website</span>
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Skills & Languages */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
            <h4 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
              <Terminal className="w-4 h-4" />
              {t.skills}
            </h4>
            
            <div className="space-y-6">
              {/* Technical */}
              <div>
                <div className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <Code className="w-3 h-3" />
                  {t.techSkills}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(skills.technical_skills || []).map((s, i) => (
                    <span key={i} className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-bold border border-indigo-100">
                      {s}
                    </span>
                  ))}
                </div>
              </div>

              {/* Tools */}
              <div>
                <div className="text-[10px] font-black text-violet-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <Layers className="w-3 h-3" />
                  {t.tools}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(skills.tools_software || []).map((s, i) => (
                    <span key={i} className="px-2.5 py-1 rounded-lg bg-violet-50 text-violet-700 text-xs font-bold border border-violet-100">
                      {s}
                    </span>
                  ))}
                </div>
              </div>

              {/* Soft Skills */}
              <div>
                <div className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <TrendingUp className="w-3 h-3" />
                  {t.softSkills}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(skills.soft_skills || []).map((s, i) => (
                    <span key={i} className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-100">
                      {s}
                    </span>
                  ))}
                </div>
              </div>

              {/* Languages */}
              {skills.languages && skills.languages.length > 0 && (
                <div>
                  <div className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <Languages className="w-3 h-3" />
                    {t.languages}
                  </div>
                  <div className="space-y-2">
                    {skills.languages.map((l, i) => (
                      <div key={i} className="flex items-center justify-between p-2 rounded-xl bg-amber-50 border border-amber-100">
                        <span className="text-xs font-bold text-amber-900">{l.language}</span>
                        <span className="text-[10px] font-black text-amber-600 uppercase">{l.proficiency}</span>
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
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
            <h4 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-8 flex items-center gap-2">
              <Briefcase className="w-4 h-4" />
              {t.experience}
            </h4>
            
            <div className="space-y-10 relative">
              {/* Timeline line */}
              <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-slate-100 sm:left-[19px]" />
              
              {work_experience.map((exp, i) => (
                <div key={i} className="relative pl-10 sm:pl-14 group">
                  {/* Circle marker */}
                  <div className="absolute left-0 top-1.5 w-6 h-6 rounded-full bg-white border-4 border-indigo-100 group-hover:border-indigo-400 transition-colors z-10 sm:left-2 sm:w-8 sm:h-8" />
                  
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <h5 className="text-lg font-black text-slate-800 group-hover:text-indigo-600 transition-colors">{exp.job_title}</h5>
                        <p className="text-sm font-bold text-slate-600">{exp.company}</p>
                      </div>
                      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 text-slate-500 text-[10px] font-black uppercase tracking-widest whitespace-nowrap">
                        <Calendar className="w-3 h-3" />
                        {exp.duration.start} - {exp.duration.is_current ? t.present : exp.duration.end}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="grid grid-cols-1 gap-4">
                        {(exp.responsibilities || []).length > 0 && (
                          <div className="space-y-1.5">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nhiệm vụ chính</p>
                            <ul className="space-y-1.5">
                              {(exp.responsibilities || []).map((r, ri) => (
                                <li key={ri} className="text-xs text-slate-600 flex items-start gap-2 leading-relaxed">
                                  <div className="w-1 h-1 rounded-full bg-slate-300 mt-1.5 shrink-0" />
                                  {r}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {(exp.achievements || []).length > 0 && (
                          <div className="space-y-1.5">
                            <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Thành tựu nổi bật</p>
                            <ul className="space-y-1.5">
                              {(exp.achievements || []).map((a, ai) => (
                                <li key={ai} className="text-xs text-slate-700 font-medium flex items-start gap-2 leading-relaxed p-2 rounded-lg bg-emerald-50/50 border border-emerald-100/50">
                                  <Award className="w-3 h-3 text-emerald-500 mt-0.5 shrink-0" />
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
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
            <h4 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
              <GraduationCap className="w-4 h-4" />
              {t.education}
            </h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(education || []).map((edu, i) => (
                <div key={i} className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-2 group hover:border-indigo-200 transition-colors">
                  <div className="flex justify-between items-start">
                    <h5 className="font-black text-slate-800 text-sm leading-snug">{edu.degree}</h5>
                    <span className="text-[10px] font-black text-slate-400 px-2 py-0.5 rounded-full bg-white border border-slate-100">
                      {edu.graduation_year}
                    </span>
                  </div>
                  <p className="text-xs font-bold text-indigo-600">{edu.major}</p>
                  <p className="text-xs text-slate-500">{edu.institution}</p>
                  {edu.gpa && (
                    <div className="pt-2 flex items-center gap-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">GPA:</span>
                      <span className="text-xs font-black text-emerald-600">{edu.gpa}</span>
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
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                  <Terminal className="w-4 h-4" />
                  {t.projects}
                </h4>
                <div className="space-y-4">
                  {(projects || []).map((p, i) => (
                    <div key={i} className="space-y-2 pb-4 border-b border-slate-100 last:border-0 last:pb-0">
                      <div className="flex justify-between items-center">
                        <h5 className="text-sm font-black text-slate-800">{p.name}</h5>
                        {p.link && (
                          <a href={p.link} target="_blank" rel="noopener noreferrer" className="text-indigo-600">
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed">{p.description}</p>
                      <div className="flex flex-wrap gap-1">
                        {(p.tech_stack || []).map((tech, ti) => (
                          <span key={ti} className="px-1.5 py-0.5 rounded bg-slate-100 text-[10px] font-bold text-slate-500">
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
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4 h-full">
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                  <Award className="w-4 h-4" />
                  {t.certifications}
                </h4>
                <div className="space-y-3">
                  {(certifications || []).map((cert, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-2xl bg-emerald-50/50 border border-emerald-100/50">
                      <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                        <Award className="w-4 h-4 text-emerald-600" />
                      </div>
                      <span className="text-xs font-bold text-slate-700 leading-tight">{cert}</span>
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
