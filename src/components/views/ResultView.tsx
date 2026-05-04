import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Check, ChevronRight, Target, FileSearch, Activity, Zap, CheckCircle2, AlertCircle, ChevronDown, ChevronUp, Copy, Printer, Download, Star, MessageSquare, Loader2, TrendingUp, Layers, X, RefreshCcw, FileText } from 'lucide-react';
import { useAnalysis } from '../../context/AnalysisContext';
import { useUI } from '../../context/UIContext';
import { useAuth } from '../../context/AuthContext';
import { cn } from '../../lib/utils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import axios from 'axios';
import { useGoogleReCaptcha } from 'react-google-recaptcha-v3';
import { rateAnalysis } from '../../services/geminiService';

export function ResultView() {
  const { user } = useAuth();
  const { t, reportLanguage } = useUI();
  const [error, setError] = React.useState<string | null>(null);
  const { executeRecaptcha } = useGoogleReCaptcha();
  const [resultTab, setResultTab] = React.useState<'analysis' | 'comparison' | 'optimization'>('analysis');
  const {
    isAnalyzing, analysisStatus, analysisProgress,
    results, setResults, selectedResult, setSelectedResult,
    history, setHistory
  } = useAnalysis();

  const [openSections, setOpenSections] = React.useState<string[]>(['matching']);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const [userRating, setUserRating] = React.useState<number>(0);
  const [userFeedback, setUserFeedback] = React.useState('');
  const [isRatingSubmitted, setIsRatingSubmitted] = React.useState(false);
  const [isSubmittingRating, setIsSubmittingRating] = React.useState(false);
  // Optional: executeRecaptcha, rateAnalysis, etc., might need to be mocked or imported if used in rating submission.

  return (
    <AnimatePresence mode="wait">
      {isAnalyzing ? (
                  <motion.div 
                    key="loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="h-full min-h-[500px] flex flex-col items-center justify-center text-center p-8 bg-white rounded-3xl border border-slate-200 shadow-sm"
                  >
                    <div className="relative mb-8">
                      <div className="w-24 h-24 border-4 border-indigo-100 rounded-full"></div>
                      <motion.div 
                        className="absolute top-0 left-0 w-24 h-24 border-4 border-indigo-600 rounded-full border-t-transparent"
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      />
                      <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 text-indigo-600" />
                    </div>
                    
                    <div className="w-full max-w-md mb-8">
                      <div className="flex justify-between items-end mb-2">
                        <div className="text-left">
                          <h3 className="text-xl font-bold text-slate-800">{analysisStatus || t.aiThinking}</h3>
                          <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">
                            {t.analysisProgress}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="text-2xl font-black text-indigo-600">{Math.round(analysisProgress)}%</span>
                        </div>
                      </div>
                      
                      <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200 p-0.5">
                        <motion.div 
                          className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full shadow-sm"
                          initial={{ width: 0 }}
                          animate={{ width: `${analysisProgress}%` }}
                          transition={{ duration: 0.5 }}
                        />
                      </div>
                      
                      <div className="flex justify-between mt-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        <span>{reportLanguage === 'vi' ? 'Khởi tạo' : 'Start'}</span>
                        <span>{reportLanguage === 'vi' ? 'Ước tính: ' : 'Est: '} {Math.max(0, Math.round((100 - analysisProgress) * 0.15))}s {reportLanguage === 'vi' ? 'còn lại' : 'left'}</span>
                        <span>{reportLanguage === 'vi' ? 'Hoàn tất' : 'Done'}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-4 w-full max-w-md">
                      {[
                        { step: 1, label: reportLanguage === 'vi' ? 'Đọc CV' : 'Read CV', min: 15 },
                        { step: 2, label: reportLanguage === 'vi' ? 'Phân tích' : 'Analyze', min: 40 },
                        { step: 3, label: reportLanguage === 'vi' ? 'Đối chiếu' : 'Match', min: 70 },
                        { step: 4, label: reportLanguage === 'vi' ? 'Báo cáo' : 'Report', min: 95 }
                      ].map((s) => (
                        <div key={s.step} className="flex flex-col items-center gap-2">
                          <div className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black transition-all duration-500",
                            analysisProgress >= s.min 
                              ? "bg-indigo-600 text-white shadow-lg shadow-indigo-100 scale-110" 
                              : "bg-slate-100 text-slate-400"
                          )}>
                            {analysisProgress >= s.min ? <Check className="w-4 h-4" /> : s.step}
                          </div>
                          <span className={cn(
                            "text-[8px] font-bold uppercase tracking-tighter",
                            analysisProgress >= s.min ? "text-indigo-600" : "text-slate-400"
                          )}>{s.label}</span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                ) : results.length > 0 ? (
                  <motion.div 
                    key="results-list"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-8"
                  >
                    {/* Comparison Overview if multiple */}
                    {results.length > 1 && (
                      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                        <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                          <Layers className="w-5 h-5 text-indigo-600" />
                          {t.detailedComparison}
                        </h3>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left">
                            <thead>
                              <tr className="border-b border-slate-100">
                                <th className="pb-4 text-sm font-bold text-slate-400 uppercase tracking-wider">{reportLanguage === 'vi' ? 'Ứng viên / CV' : 'Candidate / CV'}</th>
                                <th className="pb-4 text-sm font-bold text-slate-400 uppercase tracking-wider text-center">{reportLanguage === 'vi' ? 'Điểm số' : 'Score'}</th>
                                <th className="pb-4 text-sm font-bold text-slate-400 uppercase tracking-wider text-center">{reportLanguage === 'vi' ? 'Xác suất' : 'Probability'}</th>
                                <th className="pb-4 text-sm font-bold text-slate-400 uppercase tracking-wider text-right">{reportLanguage === 'vi' ? 'Hành động' : 'Action'}</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                              {results.sort((a, b) => b.matchScore - a.matchScore).map((res) => (
                                <tr 
                                  key={res.id} 
                                  onClick={() => setSelectedResult(res)}
                                  className="group hover:bg-slate-50/50 transition-colors cursor-pointer"
                                >
                                  <td className="py-4">
                                    <div className="flex items-center gap-3">
                                      <div className="w-8 h-8 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center font-bold text-xs">
                                        {res.cvName?.substring(0, 2).toUpperCase()}
                                      </div>
                                      <span className="font-bold text-slate-700">{res.cvName}</span>
                                    </div>
                                  </td>
                                  <td className="py-4 text-center">
                                    <div className={cn(
                                      "inline-flex flex-col items-center justify-center w-14 h-14 rounded-2xl font-black text-sm border-2",
                                      res.matchScore > 80 ? "bg-emerald-50 border-emerald-100 text-emerald-600" : 
                                      res.matchScore > 60 ? "bg-indigo-50 border-indigo-100 text-indigo-600" : "bg-amber-50 border-amber-100 text-amber-600"
                                    )}>
                                      <span className="text-lg leading-none">{res.matchScore}</span>
                                      <span className="text-[8px] uppercase tracking-tighter opacity-60">ATS</span>
                                    </div>
                                  </td>
                                  <td className="py-4 text-center">
                                    <span className="text-xs font-bold px-2 py-1 bg-slate-100 rounded-full text-slate-600">
                                      {res.successProbability}
                                    </span>
                                  </td>
                                  <td className="py-4 text-right">
                                    <div className="p-2 text-slate-400 group-hover:text-indigo-600 group-hover:bg-indigo-50 rounded-lg transition-all inline-block">
                                      <ChevronRight className="w-5 h-5" />
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Detailed Result View */}
                    {selectedResult && (
                      <div className="space-y-6" id="analysis-result">
                        <div className="flex items-center justify-between mb-8">
                          <button 
                            onClick={() => {
                              setSelectedResult(null);
                            }}
                            className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 font-bold text-sm transition-all group cursor-pointer hover:scale-105 active:scale-95"
                          >
                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center group-hover:bg-indigo-50 transition-colors">
                              <ChevronRight className="w-4 h-4 rotate-180" />
                            </div>
                            {results.length > 1 ? t.backToList : t.back}
                          </button>
                          
                          <div className="flex items-center gap-3">
                            <div className="text-right hidden sm:block">
                              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{t.analysisTime}</div>
                              <div className="text-sm font-bold text-slate-700">{new Date(selectedResult.timestamp).toLocaleString(reportLanguage === 'vi' ? 'vi-VN' : 'en-US')}</div>
                            </div>
                          </div>
                        </div>

                        <div className="mb-6">
                          <div className="flex items-center gap-2 mb-1">
                            <Target className="w-5 h-5 text-indigo-600" />
                            <h3 className="text-xl font-bold text-slate-800">
                              {t.detailedAnalysis} <span className="text-indigo-600">{selectedResult.jobTitle || selectedResult.cvName}</span>
                            </h3>
                          </div>
                          {selectedResult.jdTitle && (
                            <div className="flex items-start gap-2 ml-7 mt-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
                              <FileSearch className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                              <div className="flex flex-col gap-1">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">{t.comparisonJD}</span>
                                <p className="text-xs text-slate-600 leading-relaxed italic whitespace-pre-line line-clamp-5 break-all">
                                  {selectedResult.jdTitle}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Tab Navigation - Sticky Header */}
                        <div id="tab-navigation" className="sticky top-16 z-40 bg-white/80 backdrop-blur-xl py-4 -mx-4 px-4 mb-8 border-b border-slate-200/50 flex items-center justify-between shadow-sm overflow-hidden transition-all duration-300">
                          <div className="flex items-center gap-1.5 p-1.5 bg-slate-200/50 backdrop-blur-md rounded-[2rem] w-full sm:w-fit shadow-inner overflow-x-auto scrollbar-hide no-scrollbar border border-white/50">
                            {[
                              { id: 'analysis', icon: Activity, label: t.analyze },
                              { id: 'comparison', icon: FileSearch, label: reportLanguage === 'vi' ? 'So sánh' : 'Comparison' },
                              { id: 'optimization', icon: Zap, label: t.optimized }
                            ].map((tab) => (
                              <button
                                key={tab.id}
                                onClick={() => {
                                  setResultTab(tab.id as any);
                                  setTimeout(() => document.getElementById(`${tab.id}-content`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
                                }}
                                className={cn(
                                  "px-5 sm:px-10 py-3 sm:py-3.5 rounded-[1.5rem] text-[10px] sm:text-xs font-black uppercase tracking-[0.1em] transition-all flex items-center gap-2.5 shrink-0 cursor-pointer hover:scale-105 active:scale-95",
                                  resultTab === tab.id 
                                    ? "bg-white text-indigo-600 shadow-xl shadow-indigo-100/50 ring-1 ring-slate-200" 
                                    : "text-slate-500 hover:text-indigo-600 hover:bg-white/60"
                                )}
                              >
                                <tab.icon className={cn("w-4 h-4", resultTab === tab.id ? "animate-pulse" : "")} />
                                {tab.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {resultTab === 'analysis' && (
                          <div id="analysis-content" className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 scroll-mt-24">
                            {/* ATS Score Card */}
                            <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 flex flex-col md:flex-row items-center gap-8">
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
                              <ResponsiveContainer width="100%" height="100%">
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
                              <ResponsiveContainer width="100%" height="100%">
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
                    )}

                      {resultTab === 'comparison' && (
                        <div id="comparison-content" className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 scroll-mt-24">
                          {/* Detailed Comparison Section - Always Full */}
                          {selectedResult.detailedComparison && (
                            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                              <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-2xl bg-indigo-100 flex items-center justify-center text-indigo-600 shadow-sm">
                                      <FileSearch className="w-5 h-5" />
                                    </div>
                                    <div>
                                      <h4 className="font-black text-slate-800 uppercase tracking-tight">{t.detailedComparison}</h4>
                                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{t.detailedComparisonDesc}</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <span className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest shadow-md shadow-indigo-100">
                                      {Object.values(selectedResult.detailedComparison).flat().length} {t.detailedComparisonCount}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              
                              <div className="px-6 pb-8 pt-6">
                                <div className="space-y-12">
                                  {Object.entries(selectedResult.detailedComparison).map(([category, items]) => {
                                    if (!Array.isArray(items) || items.length === 0) return null;
                                    const categoryLabelMap: Record<string, string> = {
                                      'skills': t.skills,
                                      'experience': t.experience,
                                      'tools': t.tools,
                                      'education': t.education,
                                      'keywords': reportLanguage === 'vi' ? 'Từ khóa' : 'Keywords'
                                    };
                                    const categoryLabel = categoryLabelMap[category] || category;

                                    return (
                                      <div key={category} className="space-y-6">
                                        <div className="flex items-center gap-3">
                                          <h5 className="text-[11px] font-black text-slate-800 uppercase tracking-[0.2em] flex items-center gap-2 bg-slate-100 px-3 py-1 rounded-lg">
                                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                                            {categoryLabel}
                                          </h5>
                                          <div className="h-px bg-slate-100 flex-1" />
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                          {items.map((item, i) => (
                                            <div key={i} className={cn(
                                              "p-6 rounded-3xl border transition-all flex flex-col group relative overflow-hidden",
                                              item.status === 'matched' ? "bg-emerald-50/20 border-emerald-100 hover:border-emerald-300" : 
                                              item.status === 'partial' ? "bg-amber-50/20 border-amber-100 hover:border-amber-300" : 
                                              "bg-rose-50/20 border-rose-100 hover:border-rose-300"
                                            )}>
                                              {/* Status Icon Indicator */}
                                              <div className={cn(
                                                "absolute -top-2 -right-2 w-12 h-12 rotate-12 opacity-10 group-hover:opacity-20 transition-opacity",
                                                item.status === 'matched' ? "text-emerald-600" : 
                                                item.status === 'partial' ? "text-amber-600" : 
                                                "text-rose-600"
                                              )}>
                                                {item.status === 'matched' ? <CheckCircle2 className="w-full h-full" /> : 
                                                 item.status === 'partial' ? <Activity className="w-full h-full" /> : 
                                                 <AlertCircle className="w-full h-full" />}
                                              </div>

                                              <div className="flex items-start justify-between gap-4 mb-4">
                                                <div className="font-black text-slate-800 text-sm leading-tight group-hover:text-indigo-600 transition-colors">{item.requirement}</div>
                                                <div className={cn(
                                                  "px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest shrink-0 shadow-sm",
                                                  item.status === 'matched' ? "bg-emerald-500 text-white" : 
                                                  item.status === 'partial' ? "bg-amber-500 text-white" : 
                                                  "bg-rose-500 text-white"
                                                )}>
                                                  {item.status === 'matched' ? t.matched : item.status === 'partial' ? t.partial : t.missing}
                                                </div>
                                              </div>
                                              
                                              {item.cvEvidence && (
                                                <div className="mb-4 p-4 bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-100 text-xs text-slate-600 italic shadow-sm">
                                                  <span className="font-black text-[9px] uppercase tracking-widest text-slate-400 not-italic block mb-2 flex items-center gap-1.5">
                                                    <div className="w-1 h-1 bg-slate-300 rounded-full" />
                                                    {t.evidence}
                                                  </span>
                                                  "{item.cvEvidence}"
                                                </div>
                                              )}
                                              
                                              {item.improvement && (
                                                <div className="mt-auto pt-4 border-t border-slate-100/50">
                                                  <div className="flex items-start gap-2.5 text-xs text-slate-500 leading-relaxed">
                                                    <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
                                                    <span className="font-medium">{item.improvement}</span>
                                                  </div>
                                                </div>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {resultTab === 'optimization' && (
                        <div id="optimization-content" className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 scroll-mt-24">
                          {/* ATS & Rewriting */}
                          <div className="bg-white rounded-[2.5rem] p-8 border border-slate-200 shadow-sm">
                          <div className="flex flex-col gap-10">
                            <div>
                              <h4 className="font-bold mb-4 flex items-center gap-2 text-indigo-600">
                                <Sparkles className="w-5 h-5" />
                                {t.atsKeywords}
                              </h4>
                              <div className="flex flex-wrap gap-2.5">
                                {selectedResult.atsKeywords.map((kw, i) => (
                                  <motion.span 
                                    key={i} 
                                    whileHover={{ scale: 1.05, y: -2 }}
                                    className="px-4 py-1.5 bg-gradient-to-r from-indigo-50 to-violet-50 text-indigo-600 border border-indigo-100/50 rounded-full text-xs font-bold shadow-sm hover:shadow-md hover:border-indigo-200 transition-all cursor-default"
                                  >
                                    {kw}
                                  </motion.span>
                                ))}
                              </div>
                            </div>
                            
                            <div className="h-px bg-slate-100 w-full" />

                            <div>
                              <h4 className="font-bold mb-6 flex items-center gap-2 text-emerald-600 text-lg">
                                <RefreshCcw className="w-6 h-6" />
                                {t.rewriteSuggestions}
                              </h4>
                              <div className="space-y-10">
                                {Object.entries(
                                  selectedResult.rewriteSuggestions.reduce((acc, s) => {
                                    const key = s.section || (reportLanguage === 'vi' ? 'Khác' : 'Other');
                                    if (!acc[key]) acc[key] = [];
                                    acc[key].push(s);
                                    return acc;
                                  }, {} as Record<string, typeof selectedResult.rewriteSuggestions>)
                                ).map(([section, suggestions]) => (
                                  <div key={section} className="space-y-4">
                                    <div className="flex items-center gap-3 mb-4">
                                      <div className="h-px bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent flex-1" />
                                      <span className="text-[11px] font-black uppercase tracking-[0.4em] text-emerald-600 bg-emerald-50/50 backdrop-blur-sm px-6 py-1.5 rounded-full border border-emerald-100/50 shadow-sm">
                                        {section}
                                      </span>
                                      <div className="h-px bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent flex-1" />
                                    </div>
                                    
                                    <div className="grid grid-cols-1 gap-6">
                                      {suggestions.map((s, i) => (
                                        <div key={i} className="bg-white p-6 rounded-[2rem] border border-slate-100 hover:border-indigo-200 transition-all group relative overflow-hidden shadow-sm hover:shadow-md">
                                          
                                          <div className="relative space-y-6">
                                            {s.original && (
                                              <div className="space-y-3">
                                                <div className="flex items-center justify-between">
                                                  <div className="text-[10px] text-slate-400 uppercase font-black tracking-widest flex items-center gap-2">
                                                    <div className="w-1.5 h-1.5 bg-slate-200 rounded-full" />
                                                    {t.original}
                                                  </div>
                                                </div>
                                                <div className="text-xs text-slate-400 font-medium italic opacity-80 bg-slate-50/50 p-4 rounded-2xl border border-slate-100/50 leading-relaxed">
                                                  {s.original}
                                                </div>
                                              </div>
                                            )}
                                            
                                            <div className="space-y-3">
                                              <div className="flex items-center justify-between">
                                                <div className="text-[10px] text-emerald-600 uppercase font-black tracking-widest flex items-center gap-2">
                                                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                                                  {t.optimized}
                                                </div>
                                                <button 
                                                  onClick={() => {
                                                    navigator.clipboard.writeText(s.optimized);
                                                    setCopiedId(`suggestion-${i}`);
                                                    setTimeout(() => setCopiedId(null), 2000);
                                                  }}
                                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 rounded-xl text-[10px] font-black uppercase tracking-tight transition-all border border-slate-200 hover:border-emerald-200 shadow-sm"
                                                >
                                                  {copiedId === `suggestion-${i}` ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                                  {copiedId === `suggestion-${i}` ? t.copied : t.copy}
                                                </button>
                                              </div>
                                              <div className="text-sm text-slate-800 font-bold leading-relaxed bg-emerald-50 p-6 rounded-2xl border border-emerald-100 group-hover:border-emerald-300 transition-all shadow-sm ring-4 ring-emerald-50/20">
                                                {s.optimized}
                                              </div>
                                            </div>
                                            
                                            <div className="pt-5 border-t border-slate-100 flex items-start gap-4">
                                              <div className="w-8 h-8 bg-indigo-50 rounded-xl flex items-center justify-center shrink-0 border border-indigo-100">
                                                <Sparkles className="w-4 h-4 text-indigo-600" />
                                              </div>
                                              <div className="space-y-1">
                                                <div className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">{t.reason}</div>
                                                <p className="text-xs text-slate-600 leading-relaxed font-medium">
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

                            {selectedResult.fullRewrittenCV && (
                              <>
                                <div className="h-px bg-slate-100 w-full" />
                                <div>
                                  <h4 className="font-bold mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-indigo-600 text-lg">
                                    <div className="flex items-center gap-3">
                                      <div className="w-10 h-10 bg-indigo-100 rounded-2xl flex items-center justify-center shadow-sm">
                                        <FileText className="w-5 h-5" />
                                      </div>
                                      <span className="font-black tracking-tight">{t.fullRewrittenCV}</span>
                                    </div>
                                    <div className="flex items-center gap-2 no-print">
                                      <button 
                                        onClick={() => {
                                          if (selectedResult.fullRewrittenCV) {
                                            navigator.clipboard.writeText(selectedResult.fullRewrittenCV);
                                            setCopiedId('full-cv');
                                            setTimeout(() => setCopiedId(null), 2000);
                                          }
                                        }}
                                        className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-sm hover:shadow-md cursor-pointer hover:scale-105 active:scale-95"
                                      >
                                        {copiedId === 'full-cv' ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                                        {copiedId === 'full-cv' ? t.copied : reportLanguage === 'vi' ? 'Copy MD' : 'Copy MD'}
                                      </button>
                                      
                                      <button 
                                        onClick={() => window.print()}
                                        className="flex items-center gap-2 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-indigo-200 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-sm hover:shadow-md cursor-pointer hover:scale-105 active:scale-95"
                                      >
                                        <Printer className="w-4 h-4" />
                                        {t.printOptimized}
                                      </button>

                                      <button 
                                        onClick={() => {
                                          const blob = new Blob([selectedResult.fullRewrittenCV || ''], { type: 'text/markdown' });
                                          const url = URL.createObjectURL(blob);
                                          const a = document.createElement('a');
                                          a.href = url;
                                          a.download = `Optimized_CV_${selectedResult.cvName}.md`;
                                          a.click();
                                        }}
                                        className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-xl shadow-indigo-500/20 cursor-pointer hover:scale-105 active:scale-95"
                                      >
                                        <Download className="w-4 h-4" />
                                        {t.download}
                                      </button>
                                    </div>
                                  </h4>
                                  
                                  <div className="relative bg-slate-100/50 p-4 md:p-12 rounded-[3.5rem] border border-slate-200/50 max-w-none overflow-hidden mt-6 group/paper">
                                    {/* Paper decorative background elements */}
                                    <div className="absolute inset-0 bg-white/30 backdrop-blur-[2px] opacity-0 group-hover/paper:opacity-100 transition-opacity duration-700" />
                                    
                                    {/* Premium Badge */}
                                    <div className="absolute top-8 right-8 z-20 pointer-events-none no-print">
                                      <motion.div 
                                        initial={{ rotate: -12, scale: 0.8, opacity: 0 }}
                                        animate={{ rotate: -12, scale: 1, opacity: 1 }}
                                        className="px-6 py-2.5 bg-gradient-to-br from-amber-400 to-amber-600 text-white font-black text-[10px] uppercase tracking-[0.2em] rounded-lg shadow-xl border-2 border-amber-300 flex items-center gap-2"
                                      >
                                        <Sparkles className="w-4 h-4 fill-white" />
                                        {t.premiumOptimizedBadge}
                                      </motion.div>
                                    </div>

                                    <div id="printable-cv" className="relative bg-white p-12 md:p-24 rounded-sm shadow-[0_30px_60px_-12px_rgba(0,0,0,0.15),0_18px_36px_-18px_rgba(0,0,0,0.3)] border-t-[8px] border-indigo-600 mx-auto max-w-[850px] min-h-[1100px] transform transition-transform duration-500 group-hover/paper:scale-[1.01] hover:shadow-[0_40px_80px_-15px_rgba(0,0,0,0.2)]">
                                      {/* Watermark effect */}
                                      <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-[0.03] select-none flex items-center justify-center rotate-[-35deg] no-print">
                                        <span className="text-8xl font-black whitespace-nowrap tracking-[1em]">PREMIUM OPTIMIZED CV</span>
                                      </div>

                                      <div className="markdown-body break-words relative z-10">
                                        <Markdown 
                                          key={selectedResult.id}
                                          remarkPlugins={[remarkGfm, remarkBreaks]}
                                          rehypePlugins={[rehypeRaw, rehypeSanitize]}
                                          components={{
                                            h1: ({node, ...props}) => <h1 className="text-5xl font-black mt-2 mb-10 border-b-2 border-slate-100 pb-8 text-slate-900 text-center uppercase tracking-tight" {...props} />,
                                            h2: ({node, ...props}) => <h2 className="text-lg font-black mt-14 mb-6 text-indigo-700 flex items-center gap-3 uppercase tracking-[0.2em] bg-slate-50 -mx-6 px-6 py-2.5 rounded-r-lg border-l-4 border-indigo-600" {...props} />,
                                            h3: ({node, ...props}) => <h3 className="text-md font-bold mt-8 mb-4 text-slate-800 border-b border-slate-100 pb-2" {...props} />,
                                            p: ({node, ...props}) => <p className="mb-5 text-slate-700 leading-[1.8] text-[15px] font-medium" {...props} />,
                                            ul: ({node, ...props}) => <ul className="list-none pl-0 mb-8 space-y-3.5 text-slate-700 text-[15px] font-medium" {...props} />,
                                            li: ({node, ...props}) => (
                                              <li className="flex items-start gap-3 group/li" {...props}>
                                                <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-[10px] shrink-0 group-hover/li:scale-150 transition-transform bg-indigo-500 shadow-[0_0_4px_rgba(79,70,229,0.3)]" />
                                                <span>{props.children}</span>
                                              </li>
                                            ),
                                            strong: ({node, ...props}) => <strong className="font-bold text-slate-900" {...props} />,
                                            hr: ({node, ...props}) => <hr className="my-12 border-slate-100" {...props} />,
                                          }}
                                        >
                                          {selectedResult.fullRewrittenCV.replace(/^(#+)([^#\s])/gm, '$1 $2')}
                                        </Markdown>
                                        <div className="hidden print:block mt-12 pt-8 border-t border-slate-200 text-center text-[10px] text-slate-400 font-medium italic">
                                          cv.thanhnghiep.top - Công cụ phân tích CV thông minh giúp bạn tối ưu hóa hồ sơ.
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                      {/* Rating Section */}
                                <div className="mt-12 pt-8 border-t border-slate-200">
                                  <div className="bg-slate-50 rounded-3xl p-8 border border-slate-200">
                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                                      <div>
                                        <h3 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2">
                                          <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
                                          {t.rateResults}
                                        </h3>
                                        <p className="text-sm text-slate-500">
                                          {t.rateResultsDesc}
                                        </p>
                                      </div>
                                      
                                      {!isRatingSubmitted ? (
                                        <div className="flex flex-col gap-4">
                                          <div className="flex items-center gap-2">
                                            {[1, 2, 3, 4, 5].map((star) => (
                                              <button
                                                key={star}
                                                onClick={() => setUserRating(star)}
                                                className="p-1 transition-transform hover:scale-110"
                                              >
                                                <Star 
                                                  className={cn(
                                                    "w-8 h-8",
                                                    userRating >= star ? "text-amber-500 fill-amber-500" : "text-slate-300"
                                                  )} 
                                                />
                                              </button>
                                            ))}
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="flex items-center gap-2 text-emerald-600 font-bold">
                                          <CheckCircle2 className="w-5 h-5" />
                                          {t.thankYouRating}
                                          <div className="flex items-center gap-1 ml-2">
                                            {[1, 2, 3, 4, 5].map((star) => (
                                              <Star 
                                                key={star}
                                                className={cn(
                                                  "w-4 h-4",
                                                  userRating >= star ? "text-amber-500 fill-amber-500" : "text-slate-200"
                                                )} 
                                              />
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                    
                                    {!isRatingSubmitted && userRating > 0 && (
                                      <motion.div 
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="mt-6 space-y-4"
                                      >
                                        <div className="relative">
                                          <textarea
                                            value={userFeedback}
                                            onChange={(e) => setUserFeedback(e.target.value)}
                                            placeholder={reportLanguage === 'vi' ? 'Bạn có góp ý gì để kết quả chính xác hơn không? (Tùy chọn)' : 'Do you have any suggestions to make the results more accurate? (Optional)'}
                                            className="w-full bg-white border border-slate-200 rounded-2xl p-4 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none min-h-[100px] resize-none"
                                          />
                                          <MessageSquare className="absolute right-4 bottom-4 w-5 h-5 text-slate-300" />
                                        </div>
                                        <button
                                          disabled={isSubmittingRating}
                                          onClick={async () => {
                                            if (!user || !selectedResult || !executeRecaptcha) return;
                                            setIsSubmittingRating(true);
                                            try {
                                              // 1. Save to Firestore
                                              await rateAnalysis(user.uid, selectedResult.id, userRating, userFeedback);
                                              
                                              // 2. Get reCAPTCHA token
                                              const token = await executeRecaptcha('feedback_submission');
                                              
                                              // 3. Send email via Resend (Backend API)
                                              await axios.post('/api/send-feedback', {
                                                token,
                                                rating: userRating,
                                                title: selectedResult.jobTitle || selectedResult.jdTitle || 'CV Analysis Feedback',
                                                content: userFeedback || (reportLanguage === 'vi' ? 'Không có nội dung góp ý.' : 'No feedback content provided.'),
                                                userEmail: user.email
                                              });

                                              setIsRatingSubmitted(true);
                                              // Update history locally
                                              setHistory(prev => prev.map(h => h.id === selectedResult.id ? { ...h, rating: userRating, feedback: userFeedback } : h));
                                            } catch (err: any) {
                                              console.error("Error submitting feedback:", err);
                                              setError(reportLanguage === 'vi' ? "Không thể gửi đánh giá: " + (err.response?.data?.message || err.message) : "Failed to send rating: " + (err.response?.data?.message || err.message));
                                            } finally {
                                              setIsSubmittingRating(false);
                                            }
                                          }}
                                          className="w-full py-3 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer hover:scale-105 active:scale-95"
                                        >
                                          {isSubmittingRating ? <Loader2 className="w-5 h-5 animate-spin" /> : t.submitRating}
                                        </button>
                                      </motion.div>
                                    )}
                                    
                                    {isRatingSubmitted && userFeedback && (
                                      <div className="mt-6 p-4 bg-white rounded-2xl border border-slate-100 italic text-sm text-slate-600">
                                        "{userFeedback}"
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                  </motion.div>
                ) : (
                  <motion.div 
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="h-full min-h-[500px] flex flex-col items-center justify-center text-center p-8 bg-slate-50 rounded-3xl border border-slate-200 border-dashed"
                  >
                    <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-sm mb-6">
                      <TrendingUp className="w-10 h-10 text-slate-300" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-800 mb-2">{t.readyToAnalyze}</h3>
                    <p className="text-sm text-slate-500 max-w-xs">
                      {t.readyToAnalyzeDesc}
                    </p>
                  </motion.div>
                )}
    </AnimatePresence>
  );
}
