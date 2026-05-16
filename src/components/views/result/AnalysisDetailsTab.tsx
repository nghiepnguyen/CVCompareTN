import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Check, CheckCircle2, AlertCircle, Target, ChevronDown, ChevronUp, X } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { useUI } from '../../../context/UIContext';
import { AnalysisResult } from '../../../services/ai';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

interface AnalysisDetailsTabProps {
  selectedResult: AnalysisResult;
}

export const AnalysisDetailsTab = React.memo(function AnalysisDetailsTab({ selectedResult }: AnalysisDetailsTabProps) {
  const { t, reportLanguage } = useUI();
  const [openSections, setOpenSections] = React.useState<string[]>(['matching']);

  const pieData = React.useMemo(() => {
    const counts: Record<string, number> = {};
    (selectedResult.matchingPoints || []).forEach((p) => {
      if (!p?.category) return;
      counts[p.category] = (counts[p.category] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [selectedResult.matchingPoints]);

  return (
    <div id="analysis-content" className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 scroll-mt-24">
      {/* ATS Score Card */}
      <div className="bg-surface p-5 sm:p-8 rounded-3xl shadow-sm border border-border flex flex-col md:flex-row items-center gap-8">
        <div className="relative shrink-0">
          <svg className="w-32 h-32 transform -rotate-90">
            <circle
              cx="64"
              cy="64"
              r="58"
              stroke="currentColor"
              strokeWidth="8"
              fill="transparent"
              className="text-surface-muted"
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
                selectedResult.matchScore > 80 ? "text-success" : 
                selectedResult.matchScore > 60 ? "text-accent" : "text-warning"
              )}
            />
          </svg>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
            <span className="text-4xl font-black text-text-main leading-none">{selectedResult.matchScore}</span>
            <span className="text-xs font-bold text-text-light block">/ 100</span>
          </div>
        </div>
        <div className="text-center md:text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-accent-light text-accent rounded-full text-[10px] font-black uppercase tracking-widest mb-2">
            <Sparkles className="w-3 h-3" />
            {t.atsCompatibilityScore}
          </div>
          <h3 className="text-2xl font-black text-text-main mb-2">{t.atsScore}</h3>
          <p className="text-sm text-text-muted max-w-md leading-relaxed mb-4">
            {t.atsDesc}
          </p>
          <div className="bg-surface-secondary p-4 rounded-2xl border border-border">
            <p className="text-sm font-medium text-text-main leading-relaxed">
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
        <div className="min-w-0 bg-surface p-6 rounded-3xl shadow-sm border border-border">
          <h4 className="text-sm font-bold text-text-main mb-6">{t.scoreDistribution}</h4>
          <div className="h-64 min-h-[256px] w-full min-w-0 shrink-0">
            <ResponsiveContainer width="100%" height={256} debounce={32} minWidth={0}>
              <BarChart data={[
                { label: t.skills, score: selectedResult.categoryScores?.skills || 0 },
                { label: t.experience, score: selectedResult.categoryScores?.experience || 0 },
                { label: t.tools, score: selectedResult.categoryScores?.tools || 0 },
                { label: t.education, score: selectedResult.categoryScores?.education || 0 },
              ]}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" fontSize={10} />
                <YAxis fontSize={10} />
                <Tooltip cursor={{fill: 'transparent'}} />
                <Bar dataKey="score" fill="var(--color-accent)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        
        <div className="min-w-0 bg-surface p-6 rounded-3xl shadow-sm border border-border">
          <h4 className="text-sm font-bold text-text-main mb-6">{t.skillDistribution}</h4>
          <div className="h-64 min-h-[256px] w-full min-w-0 shrink-0">
            {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={256} debounce={32} minWidth={0}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {pieData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={['var(--color-accent)', 'var(--color-success)', 'var(--color-warning)', '#8b5cf6', '#ec4899'][index % 5]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center px-4 text-text-muted text-sm">
                <p>{reportLanguage === 'vi' ? 'Chưa có nhóm điểm khớp để hiển thị biểu đồ.' : 'No matching-point categories yet for this chart.'}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Pass Probability Section */}
      <div className="min-w-0 bg-surface p-6 rounded-3xl shadow-sm border border-border">
        <div className="flex flex-col md:flex-row md:items-center gap-6">
          <div className="flex flex-col items-center justify-center p-6 bg-surface-secondary rounded-2xl min-w-[200px]">
            <div className="text-[10px] font-black text-text-light uppercase tracking-widest mb-2 text-center">{t.passProb}</div>
            <div className={cn(
              "text-3xl font-black px-6 py-2 rounded-xl",
              (selectedResult.passProbability === t.high || selectedResult.passProbability === 'High' || selectedResult.passProbability === 'Cao') ? "bg-success-light text-success" :
              (selectedResult.passProbability === t.medium || selectedResult.passProbability === 'Medium' || selectedResult.passProbability === 'Trung bình') ? "bg-accent-light text-accent" : "bg-warning-light text-warning"
            )}>
              {selectedResult.passProbability}
            </div>
          </div>
          <div className="flex-1 space-y-4">
            <div>
              <h4 className="text-sm font-bold text-text-main flex items-center gap-2 mb-1">
                <AlertCircle className="w-4 h-4 text-accent" />
                {t.explanation}
              </h4>
              <p className="text-sm text-text-muted leading-relaxed">{selectedResult.passExplanation}</p>
            </div>
            <div>
              <h4 className="text-sm font-bold text-text-main flex items-center gap-2 mb-1">
                <Target className="w-4 h-4 text-accent" />
                {t.mainFactor}
              </h4>
              <p className="text-sm text-text-muted font-medium">{selectedResult.mainFactor}</p>
            </div>
          </div>
        </div>
      </div>

      {(selectedResult.matchingPoints || []).length === 0 &&
        (selectedResult.missingGaps || []).length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-surface-secondary/80 px-4 py-3 text-center text-sm text-text-muted">
          {reportLanguage === 'vi'
            ? 'Chưa có danh sách điểm khớp / khoảng trống từ phân tích. Thử chạy phân tích lại; nếu tải từ lịch sử, bản ghi có thể được lưu trước khi có đủ trường JSON.'
            : 'No matching points or gaps in this result. Try analyzing again; history rows saved before schema updates may lack this data.'}
        </div>
      )}

      <div className="space-y-4">
        {/* Matching Points Accordion */}
        <div className="bg-surface rounded-3xl shadow-sm border border-border overflow-hidden transition-all duration-300">
          <button 
            onClick={() => setOpenSections(prev => prev.includes('matching') ? prev.filter(s => s !== 'matching') : [...prev, 'matching'])}
            className="w-full px-6 py-5 flex items-center justify-between hover:bg-surface-secondary transition-colors text-left"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-2xl bg-success-light flex items-center justify-center text-success">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-text-main">{t.matchingPoints}</h4>
                <p className="text-xs text-text-light font-medium">{t.matchingPointsDesc}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="px-2.5 py-1 rounded-full bg-success-light text-success text-[10px] font-black uppercase tracking-wider border border-success-light shadow-sm">
                {(selectedResult.matchingPoints || []).length} {t.matchingPointsCount}
              </span>
              {openSections.includes('matching') ? <ChevronUp className="w-5 h-5 text-text-light" /> : <ChevronDown className="w-5 h-5 text-text-light" />}
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
                <div className="px-6 pb-8 pt-2 border-t border-border">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-4">
                    {Array.from(new Set((selectedResult.matchingPoints || []).map(p => p.category))).map(cat => {
                      const points = (selectedResult.matchingPoints || []).filter(p => p.category === cat);
                      if (points.length === 0) return null;
                      
                      const catLabelMap: Record<string, string> = {
                        'Skills': reportLanguage === 'vi' ? 'Kỹ năng chung' : 'General Skills',
                        'Soft Skills': reportLanguage === 'vi' ? 'Kỹ năng mềm' : 'Soft Skills',
                        'Hard Skills': reportLanguage === 'vi' ? 'Kỹ năng cứng' : 'Hard Skills',
                        'Technical Skills': reportLanguage === 'vi' ? 'Kỹ năng kỹ thuật' : 'Technical Skills',
                        'Experience': reportLanguage === 'vi' ? 'Kinh nghiệm' : 'Experience',
                        'Tools': reportLanguage === 'vi' ? 'Công cụ' : 'Tools',
                        'Education': reportLanguage === 'vi' ? 'Học vấn' : 'Education',
                        'Keywords': reportLanguage === 'vi' ? 'Từ khóa' : 'Keywords'
                      };
                      const catLabel = catLabelMap[cat] || cat;

                      return (
                        <div key={cat} className="space-y-4">
                          <div className="text-[11px] font-black text-text-main uppercase tracking-widest flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-success shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                            {catLabel}
                          </div>
                          <ul className="space-y-3">
                            {points.map((p, i) => (
                              <li key={i} className="text-sm text-text-main font-medium flex items-start gap-3 p-4 bg-success-light/10 rounded-2xl border border-success-light/30 hover:border-success-light transition-all group">
                                <Check className="w-4 h-4 text-success shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                                <span className="leading-relaxed">{p.content}</span>
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
        <div className="bg-surface rounded-3xl shadow-sm border border-border overflow-hidden transition-all duration-300">
          <button 
            onClick={() => setOpenSections(prev => prev.includes('missing') ? prev.filter(s => s !== 'missing') : [...prev, 'missing'])}
            className="w-full px-6 py-5 flex items-center justify-between hover:bg-surface-secondary transition-colors text-left"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-2xl bg-warning-light flex items-center justify-center text-warning">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-text-main">{t.missingGaps}</h4>
                <p className="text-xs text-text-light font-medium">{t.missingGapsDesc}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="px-2.5 py-1 rounded-full bg-warning-light text-warning text-[10px] font-black uppercase tracking-wider border border-warning-light shadow-sm">
                {(selectedResult.missingGaps || []).length} {t.missingGapsCount}
              </span>
              {openSections.includes('missing') ? <ChevronUp className="w-5 h-5 text-text-light" /> : <ChevronDown className="w-5 h-5 text-text-light" />}
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
                <div className="px-6 pb-8 pt-2 border-t border-border">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-4">
                    {Array.from(new Set((selectedResult.missingGaps || []).map(g => g.category))).map(cat => {
                      const gaps = (selectedResult.missingGaps || []).filter(g => g.category === cat);
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
                        <div key={cat} className="space-y-4">
                          <div className="text-[11px] font-black text-text-main uppercase tracking-widest flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-warning shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
                            {catLabel}
                          </div>
                          <ul className="space-y-3">
                            {gaps.map((g, i) => (
                              <li key={i} className="text-sm text-text-main font-medium flex items-start gap-3 p-4 bg-warning-light/10 rounded-2xl border border-warning-light/30 hover:border-warning-light transition-all group">
                                <X className="w-4 h-4 text-warning shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                                <span className="leading-relaxed">{g.content}</span>
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
});

