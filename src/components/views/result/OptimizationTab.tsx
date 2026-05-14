import React from 'react';
import { motion } from 'motion/react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { Sparkles, RefreshCcw, Copy, Check, FileText, Printer } from 'lucide-react';
import { useUI } from '../../../context/UIContext';
import { AnalysisResult, RewriteSuggestion } from '../../../services/aiService';

interface OptimizationTabProps {
  selectedResult: AnalysisResult;
}

export function OptimizationTab({ selectedResult }: OptimizationTabProps) {
  const { t, reportLanguage } = useUI();
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  return (
    <div id="optimization-content" className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 scroll-mt-24">
      {/* ATS Keywords */}
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

          {/* Rewrite Suggestions */}
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
                }, {} as Record<string, RewriteSuggestion[]>)
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
                                className="flex items-center gap-1.5 px-4 py-2.5 bg-white hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 rounded-xl text-[10px] font-black uppercase tracking-tight transition-all border border-slate-200 hover:border-emerald-200 shadow-sm cursor-pointer hover:scale-105 active:scale-95"
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

          {/* Full Rewritten CV */}
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
                      className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-3 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-sm hover:shadow-md cursor-pointer hover:scale-105 active:scale-95"
                    >
                      {copiedId === 'full-cv' ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                      {copiedId === 'full-cv' ? t.copied : reportLanguage === 'vi' ? 'Copy MD' : 'Copy MD'}
                    </button>
                    
                    <button 
                      onClick={() => window.print()}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-indigo-200 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-sm hover:shadow-md cursor-pointer hover:scale-105 active:scale-95"
                    >
                      <Printer className="w-4 h-4" />
                      {t.printOptimized}
                    </button>
                  </div>
                </h4>
                
                <div className="bg-slate-100/50 rounded-[2.5rem] p-4 sm:p-12 border border-slate-200 shadow-inner overflow-hidden">
                  <div className="bg-white rounded-sm p-8 sm:p-16 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.1)] relative group/cv overflow-hidden max-w-[210mm] mx-auto min-h-[297mm] ring-1 ring-slate-200">
                    {/* Paper texture/gradient subtle effect */}
                    <div className="absolute inset-0 bg-gradient-to-br from-white via-white to-slate-50/20 pointer-events-none" />
                    
                    <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
                      <FileText className="w-48 h-48" />
                    </div>
                    
                    <div className="markdown-body relative z-10">
                      <Markdown 
                        remarkPlugins={[remarkGfm, remarkBreaks]}
                        rehypePlugins={[rehypeRaw, rehypeSanitize]}
                        components={{
                          h1: ({node, ...props}) => <h1 className="text-3xl font-black mb-4 text-center text-slate-900 border-none pb-0" {...props} />,
                          h2: ({node, ...props}) => <h2 className="text-sm font-black mt-8 mb-4 pb-1 border-b-2 border-indigo-600 text-indigo-700 uppercase tracking-widest flex items-center gap-3" {...props} />,
                          h3: ({node, ...props}) => <h3 className="text-base font-bold mt-5 mb-2 text-slate-800" {...props} />,
                          p: ({node, ...props}) => <p className="mb-3 text-slate-600 leading-relaxed text-[13px]" {...props} />,
                          ul: ({node, ...props}) => <ul className="list-disc pl-5 mb-5 space-y-1.5 text-[13px]" {...props} />,
                          li: ({node, ...props}) => <li className="text-slate-600" {...props} />,
                          strong: ({node, ...props}) => <strong className="font-bold text-slate-900" {...props} />,
                          hr: ({node, ...props}) => <hr className="my-8 border-slate-100" {...props} />,
                        }}
                      >
                        {selectedResult.fullRewrittenCV.replace(/^(#+)([^#\s])/gm, '$1 $2')}
                      </Markdown>
                    </div>

                    {/* Bottom Professional Footer */}
                    <div className="mt-20 pt-8 border-t border-slate-100 text-center text-[9px] text-slate-300 font-medium uppercase tracking-tighter relative z-10">
                      Generated by CV Matcher & Optimizer AI - Professional Version
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
