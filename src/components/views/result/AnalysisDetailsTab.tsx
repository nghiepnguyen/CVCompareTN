import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Check, CheckCircle2, AlertCircle, Target, ChevronDown, ChevronUp, X } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { useUI } from '../../../context/UIContext';
import { AnalysisResult } from '../../../services/aiService';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

interface AnalysisDetailsTabProps {
  selectedResult: AnalysisResult;
}

export function AnalysisDetailsTab({ selectedResult }: AnalysisDetailsTabProps) {
  const { t, reportLanguage } = useUI();
  const [openSections, setOpenSections] = React.useState<string[]>(['matching']);

  return (
    <div id="analysis-content" className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 scroll-mt-24">
      {/* ATS Score Card */}
      <div className="bg-white p-5 sm:p-8 rounded-3xl shadow-sm border border-slate-200 flex flex-col md:flex-row items-center gap-8">
        <div className="relative shrink-0">
          <svg className="w-32 h-32 transform -rotate-90">
            <circle
              cx="64"
              cy="64"
              r="58"
              stroke="currentColor"
              strokeWidth="8"
              fill="transparent"
              className="text-slate-100"
            />
            <motion.circle
              cx="64"
              cy="64"
              r="58"
              stroke="currentColor"
              strokeWidth="8"
              fill="transparent"
              strokeDasharray={364.4}
              initial={{ strokeDashoffset: 364.4 }}
              animate={{ strokeDashoffset: 364.4 - (364.4 * selectedResult.matchScore) / 100 }}
              strokeLinecap="round"
              className={cn(
                selectedResult.matchScore > 80 ? "text-emerald-500" : 
                selectedResult.matchScore > 60 ? "text-indigo-500" : "text-amber-500"
              )}
            />
          </svg>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
            <span className="text-4xl font-black text-slate-800 leading-none">{selectedResult.matchScore}</span>
            <span className="text-xs font-bold text-slate-400 block">/ 100</span>
          </div>
        </div>
        <div className="text-center md:text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-black uppercase tracking-widest mb-2">
            <Sparkles className="w-3 h-3" />
            {t.atsCompatibilityScore}
          </div>
          <h3 className="text-2xl font-black text-slate-800 mb-2">{t.atsScore}</h3>
          <p className="text-sm text-slate-500 max-w-md leading-relaxed mb-4">
            {t.atsDesc}
          </p>
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
            <p className="text-sm font-medium text-slate-700 leading-relaxed">
              {selectedResult.matchScore >= 80 
                ? (reportLanguage === 'vi' ? 'CV của bạn rất phù hợp với vị trí này. Hãy tự tin ứng tuyển!' : 'Your CV is a great match for this position. Apply with confidence!')
                : selectedResult.matchScore >= 60
                ? (reportLanguage === 'vi' ? 'CV của bạn khá phù hợp. Hãy tối ưu thêm các từ khóa để tăng cơ hội.' : 'Your CV is a good match. Optimize with more keywords to increase your chances.')
                : (reportLanguage === 'vi' ? 'CV cần cải thiện đáng kể để phù hợp với yêu cầu. Hãy xem kỹ các gợi ý bên dưới.' : 'Your CV needs significant improvement to match the requirements. Review the suggestions below carefully.')
              }
            </p>
          </div>
        </div>
      </div>

      {/* Score Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
          <h4 className="text-sm font-bold text-slate-800 mb-6">{t.scoreDistribution}</h4>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <BarChart data={[
                { label: t.skills, score: selectedResult.categoryScores.skills },
                { label: t.experience, score: selectedResult.categoryScores.experience },
                { label: t.tools, score: selectedResult.categoryScores.tools },
                { label: t.education, score: selectedResult.categoryScores.education },
              ]}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" fontSize={10} />
                <YAxis fontSize={10} />
                <Tooltip cursor={{fill: 'transparent'}} />
                <Bar dataKey="score" fill="#4f46e5" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
          <h4 className="text-sm font-bold text-slate-800 mb-6">{t.skillDistribution}</h4>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <PieChart>
                <Pie
                  data={(() => {
                    const counts: Record<string, number> = {};
                    selectedResult.matchingPoints.forEach(p => counts[p.category] = (counts[p.category] || 0) + 1);
                    return Object.entries(counts).map(([name, value]) => ({ name, value }));
                  })()}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {(() => {
                    const counts: Record<string, number> = {};
                    selectedResult.matchingPoints.forEach(p => counts[p.category] = (counts[p.category] || 0) + 1);
                    return Object.entries(counts).map((_, index) => (
                      <Cell key={`cell-${index}`} fill={['#4f46e5', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'][index % 5]} />
                    ));
                  })()}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Pass Probability Section */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
        <div className="flex flex-col md:flex-row md:items-center gap-6">
          <div className="flex flex-col items-center justify-center p-6 bg-slate-50 rounded-2xl min-w-[200px]">
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 text-center">{t.passProb}</div>
            <div className={cn(
              "text-3xl font-black px-6 py-2 rounded-xl",
              (selectedResult.passProbability === t.high || selectedResult.passProbability === 'High' || selectedResult.passProbability === 'Cao') ? "bg-emerald-100 text-emerald-600" :
              (selectedResult.passProbability === t.medium || selectedResult.passProbability === 'Medium' || selectedResult.passProbability === 'Trung bình') ? "bg-indigo-100 text-indigo-600" : "bg-amber-100 text-amber-600"
            )}>
              {selectedResult.passProbability}
            </div>
          </div>
          <div className="flex-1 space-y-4">
            <div>
              <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-1">
                <AlertCircle className="w-4 h-4 text-indigo-500" />
                {t.explanation}
              </h4>
              <p className="text-sm text-slate-600 leading-relaxed">{selectedResult.passExplanation}</p>
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-1">
                <Target className="w-4 h-4 text-indigo-500" />
                {t.mainFactor}
              </h4>
              <p className="text-sm text-slate-600 font-medium">{selectedResult.mainFactor}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {/* Matching Points Accordion */}
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden transition-all duration-300">
          <button 
            onClick={() => setOpenSections(prev => prev.includes('matching') ? prev.filter(s => s !== 'matching') : [...prev, 'matching'])}
            className="w-full px-6 py-5 flex items-center justify-between hover:bg-slate-50 transition-colors text-left"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-2xl bg-emerald-100 flex items-center justify-center text-emerald-600">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-slate-800">{t.matchingPoints}</h4>
                <p className="text-xs text-slate-400 font-medium">{t.matchingPointsDesc}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-bold uppercase tracking-wider border border-emerald-100">
                {selectedResult.matchingPoints.length} {t.matchingPointsCount}
              </span>
              {openSections.includes('matching') ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
            </div>
          </button>
          
          <AnimatePresence>
            {openSections.includes('matching') && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
              >
                <div className="px-6 pb-8 pt-2 border-t border-slate-100">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-4">
                    {['Skills', 'Soft Skills', 'Hard Skills', 'Technical Skills', 'Experience', 'Tools', 'Education'].map(cat => {
                      const points = selectedResult.matchingPoints.filter(p => p.category === cat);
                      if (points.length === 0) return null;
                      
                      const catLabelMap: Record<string, string> = {
                        'Skills': reportLanguage === 'vi' ? 'Kỹ năng chung' : 'General Skills',
                        'Soft Skills': reportLanguage === 'vi' ? 'Kỹ năng mềm' : 'Soft Skills',
                        'Hard Skills': reportLanguage === 'vi' ? 'Kỹ năng cứng' : 'Hard Skills',
                        'Technical Skills': reportLanguage === 'vi' ? 'Kỹ năng kỹ thuật' : 'Technical Skills',
                        'Experience': reportLanguage === 'vi' ? 'Kinh nghiệm' : 'Experience',
                        'Tools': reportLanguage === 'vi' ? 'Công cụ' : 'Tools',
                        'Education': reportLanguage === 'vi' ? 'Học vấn' : 'Education'
                      };
                      const catLabel = catLabelMap[cat] || cat;

                      return (
                        <div key={cat} className="space-y-3">
                          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <div className="w-1 h-1 rounded-full bg-emerald-500" />
                            {catLabel}
                          </div>
                          <ul className="space-y-2.5">
                            {points.map((p, i) => (
                              <li key={i} className="text-sm text-slate-600 flex items-start gap-2.5 p-3 bg-emerald-50/30 rounded-xl border border-emerald-100/50 hover:border-emerald-200 transition-colors">
                                <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                                {p.content}
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Missing Gaps Accordion */}
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden transition-all duration-300">
          <button 
            onClick={() => setOpenSections(prev => prev.includes('missing') ? prev.filter(s => s !== 'missing') : [...prev, 'missing'])}
            className="w-full px-6 py-5 flex items-center justify-between hover:bg-slate-50 transition-colors text-left"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-2xl bg-amber-100 flex items-center justify-center text-amber-600">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-slate-800">{t.missingGaps}</h4>
                <p className="text-xs text-slate-400 font-medium">{t.missingGapsDesc}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-600 text-[10px] font-bold uppercase tracking-wider border border-amber-100">
                {selectedResult.missingGaps.length} {t.missingGapsCount}
              </span>
              {openSections.includes('missing') ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
            </div>
          </button>
          
          <AnimatePresence>
            {openSections.includes('missing') && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
              >
                <div className="px-6 pb-8 pt-2 border-t border-slate-100">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-4">
                    {['Skills', 'Soft Skills', 'Hard Skills', 'Technical Skills', 'Experience', 'Keywords'].map(cat => {
                      const gaps = selectedResult.missingGaps.filter(g => g.category === cat);
                      if (gaps.length === 0) return null;
                      
                      const catLabelMap: Record<string, string> = {
                        'Skills': reportLanguage === 'vi' ? 'Kỹ năng chung' : 'General Skills',
                        'Soft Skills': reportLanguage === 'vi' ? 'Kỹ năng mềm' : 'Soft Skills',
                        'Hard Skills': reportLanguage === 'vi' ? 'Kỹ năng cứng' : 'Hard Skills',
                        'Technical Skills': reportLanguage === 'vi' ? 'Kỹ năng kỹ thuật' : 'Technical Skills',
                        'Experience': reportLanguage === 'vi' ? 'Kinh nghiệm' : 'Experience',
                        'Keywords': reportLanguage === 'vi' ? 'Từ khóa' : 'Keywords'
                      };
                      const catLabel = catLabelMap[cat] || cat;

                      return (
                        <div key={cat} className="space-y-3">
                          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <div className="w-1 h-1 rounded-full bg-amber-500" />
                            {catLabel}
                          </div>
                          <ul className="space-y-2.5">
                            {gaps.map((g, i) => (
                              <li key={i} className="text-sm text-slate-600 flex items-start gap-2.5 p-3 bg-amber-50/30 rounded-xl border border-amber-100/50 hover:border-amber-200 transition-colors">
                                <X className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                                {g.content}
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
