import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { Trash2, TrendingUp, Download, Eye, FileText, CheckCircle2, AlertCircle, History as HistoryIcon, Clock, ChevronRight, Sparkles, Target, BarChart3, Search, Filter, Calendar } from 'lucide-react';
import { useAnalysis } from '../../context/AnalysisContext';
import { useUI } from '../../context/UIContext';
import { formatLabel } from '../../translations';
import { cn } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';
import { deleteFromHistory } from '../../services/historyService';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, Cell, Tooltip } from 'recharts';

export function HistoryView() {
    const { 
    history, 
    setHistory, 
    clearHistory, 
    setSelectedResult, 
    setResults,
    isLoadingHistory 
  } = useAnalysis();
  const { t, setActiveTab, reportLanguage } = useUI();
  const dateLocale = reportLanguage === 'vi' ? 'vi-VN' : 'en-US';
  const { user } = useAuth();

  const [historySearchQuery, setHistorySearchQuery] = useState('');
  const [historyScoreFilter, setHistoryScoreFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [historyDateFilter, setHistoryDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');

  const filteredHistory = useMemo(() => {
    return history.filter(item => {
      // Search filter
      const matchesSearch = 
        !historySearchQuery || 
        item.cvName.toLowerCase().includes(historySearchQuery.toLowerCase()) ||
        (item.jobTitle || '').toLowerCase().includes(historySearchQuery.toLowerCase()) ||
        (item.jdTitle || '').toLowerCase().includes(historySearchQuery.toLowerCase());
        
      // Score filter
      let matchesScore = true;
      if (historyScoreFilter === 'high') matchesScore = item.matchScore > 80;
      if (historyScoreFilter === 'medium') matchesScore = item.matchScore >= 60 && item.matchScore <= 80;
      if (historyScoreFilter === 'low') matchesScore = item.matchScore < 60;
      
      // Date filter
      let matchesDate = true;
      const itemDate = new Date(item.timestamp);
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      if (historyDateFilter === 'today') {
        matchesDate = itemDate >= today;
      } else if (historyDateFilter === 'week') {
        const lastWeek = new Date(today);
        lastWeek.setDate(lastWeek.getDate() - 7);
        matchesDate = itemDate >= lastWeek;
      } else if (historyDateFilter === 'month') {
        const lastMonth = new Date(today);
        lastMonth.setMonth(lastMonth.getMonth() - 1);
        matchesDate = itemDate >= lastMonth;
      }
      
      return matchesSearch && matchesScore && matchesDate;
    });
  }, [history, historySearchQuery, historyScoreFilter, historyDateFilter]);

  const deleteHistoryItem = async (id: string) => {
    setHistory(prev => prev.filter(item => item.id !== id));
    if (user?.id) {
      try {
        await deleteFromHistory(user.id, id);
      } catch (err) {
        console.error('Error deleting history item:', err);
      }
    }
  };

  return (
    <>
          <section className="max-w-5xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
              <div>
                <h2 className="text-2xl font-black text-text-main tracking-tight">{t.analysisHistory}</h2>
                <p className="text-sm text-text-muted">{t.historyDesc}</p>
              </div>
              {history.length > 0 && (
                <button 
                  onClick={clearHistory}
                  className="flex items-center gap-2 text-sm font-bold text-error hover:text-error transition-colors px-4 py-2 bg-error-light rounded-xl border border-error/10 cursor-pointer hover:scale-105 active:scale-95"
                >
                  <Trash2 className="w-4 h-4" />
                  {t.clearHistory}
                </button>
              )}
            </div>

            {isLoadingHistory ? (
              <div className="text-center py-24 bg-surface rounded-[2rem] border border-border shadow-sm flex flex-col items-center justify-center">
                <div className="w-16 h-16 border-4 border-accent-light border-t-accent rounded-full animate-spin mb-6"></div>
                <h3 className="text-xl font-bold text-text-main mb-2">{t.historyLoadingTitle}</h3>
                <p className="text-text-muted max-w-sm mx-auto">{t.historyLoadingDesc}</p>
              </div>
            ) : history.length === 0 ? (
              <div className="text-center py-24 bg-surface rounded-[2rem] border border-border shadow-sm">
                <div className="w-20 h-20 bg-surface-secondary rounded-3xl flex items-center justify-center mx-auto mb-6">
                  <HistoryIcon className="w-10 h-10 text-text-light" />
                </div>
                <h3 className="text-xl font-bold text-text-main mb-2">{t.historyEmptyTitle}</h3>
                <p className="text-text-muted max-w-sm mx-auto">{t.historyEmptyDesc}</p>
                <button 
                  onClick={() => setActiveTab('analyze')}
                  className="mt-8 px-6 py-3 bg-accent text-white rounded-xl font-bold hover:bg-accent-hover transition-all shadow-lg shadow-accent-light cursor-pointer hover:scale-105 active:scale-95"
                >
                  {t.historyAnalyzeNow}
                </button>
              </div>
            ) : (
              <div className="space-y-8">
                {/* History Analytics Dashboard */}
                {history.length >= 2 && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="min-w-0 bg-surface p-6 rounded-[2rem] border border-border shadow-sm"
                    >
                      <div className="flex items-center justify-between mb-6">
                        <h3 className="font-bold text-text-main flex items-center gap-2">
                          <TrendingUp className="w-5 h-5 text-accent" />
                          {t.historyScoreTrend}
                        </h3>
                        <span className="text-[10px] font-black text-text-light uppercase tracking-widest">{t.historyLabelRecent}</span>
                      </div>
                      <div className="h-48 min-h-[192px] w-full min-w-0 shrink-0">
                        <ResponsiveContainer width="100%" height={192} debounce={32}>
                          <AreaChart data={[...history].reverse().slice(-10).map(h => ({ name: new Date(h.timestamp).toLocaleDateString(dateLocale, { day: '2-digit', month: '2-digit' }), score: h.matchScore }))}>
                            <defs>
                              <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--color-text-light)' }} />
                            <YAxis domain={[0, 100]} hide />
                            <Tooltip 
                              contentStyle={{ borderRadius: '1rem', background: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                              itemStyle={{ fontWeight: 'bold', color: 'var(--color-accent)' }}
                            />
                            <Area type="monotone" dataKey="score" stroke="var(--color-accent)" strokeWidth={3} fillOpacity={1} fill="url(#colorScore)" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </motion.div>

                    <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 }}
                      className="min-w-0 bg-surface p-6 rounded-[2rem] border border-border shadow-sm"
                    >
                      <div className="flex items-center justify-between mb-6">
                        <h3 className="font-bold text-text-main flex items-center gap-2">
                          <BarChart3 className="w-5 h-5 text-success" />
                          {t.historyQualityDistribution}
                        </h3>
                        <span className="text-[10px] font-black text-text-light uppercase tracking-widest">{t.historyLabelOverview}</span>
                      </div>
                      <div className="h-48 min-h-[192px] w-full min-w-0 shrink-0">
                        <ResponsiveContainer width="100%" height={192} debounce={32}>
                          <BarChart data={[
                            { name: t.historyChartLow, count: history.filter(h => h.matchScore < 60).length, color: 'var(--color-warning)' },
                            { name: t.historyChartMedium, count: history.filter(h => h.matchScore >= 60 && h.matchScore <= 80).length, color: 'var(--color-accent)' },
                            { name: t.historyChartHigh, count: history.filter(h => h.matchScore > 80).length, color: 'var(--color-success)' }
                          ]}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--color-text-light)' }} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--color-text-light)' }} />
                            <Tooltip 
                              cursor={{ fill: 'var(--color-surface-secondary)' }}
                              contentStyle={{ borderRadius: '1rem', background: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                            />
                            <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                              {[
                                { color: 'var(--color-warning)' },
                                { color: 'var(--color-accent)' },
                                { color: 'var(--color-success)' }
                              ].map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </motion.div>
                  </div>
                )}

                {/* Search and Filters */}
                <div className="bg-surface p-4 rounded-2xl border border-border shadow-sm flex flex-col lg:flex-row gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-light" />
                    <input 
                      type="text"
                      placeholder={t.historySearchPlaceholder}
                      value={historySearchQuery}
                      onChange={(e) => setHistorySearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-surface-secondary border border-border rounded-xl text-sm focus:ring-2 focus:ring-accent focus:border-transparent transition-all text-text-main"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 bg-surface-secondary px-3 py-2 sm:py-1.5 rounded-xl border border-border">
                      <Filter className="w-3.5 h-3.5 text-text-light" />
                      <select 
                        value={historyScoreFilter}
                        onChange={(e) => setHistoryScoreFilter(e.target.value as any)}
                        className="bg-transparent text-xs font-bold text-text-muted focus:outline-none cursor-pointer h-8 sm:h-auto"
                      >
                        <option value="all">{t.historyFilterAllScores}</option>
                        <option value="high">{t.historyFilterHigh}</option>
                        <option value="medium">{t.historyFilterMedium}</option>
                        <option value="low">{t.historyFilterLow}</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2 bg-surface-secondary px-3 py-2 sm:py-1.5 rounded-xl border border-border">
                      <Calendar className="w-3.5 h-3.5 text-text-light" />
                      <select 
                        value={historyDateFilter}
                        onChange={(e) => setHistoryDateFilter(e.target.value as any)}
                        className="bg-transparent text-xs font-bold text-text-muted focus:outline-none cursor-pointer h-8 sm:h-auto"
                      >
                        <option value="all">{t.historyFilterAllTime}</option>
                        <option value="today">{t.historyFilterToday}</option>
                        <option value="week">{t.historyFilterWeek}</option>
                        <option value="month">{t.historyFilterMonth}</option>
                      </select>
                    </div>
                    {(historySearchQuery || historyScoreFilter !== 'all' || historyDateFilter !== 'all') && (
                      <button 
                        onClick={() => {
                          setHistorySearchQuery('');
                          setHistoryScoreFilter('all');
                          setHistoryDateFilter('all');
                        }}
                        className="text-xs font-bold text-accent hover:text-accent-hover px-2"
                      >
                        {t.historyClearFilters}
                      </button>
                    )}
                  </div>
                </div>

                {/* Results Count */}
                <div className="flex items-center justify-between px-2">
                  <p className="text-xs font-bold text-text-light uppercase tracking-widest">
                    {formatLabel(t.historyShowingResults, { count: filteredHistory.length })}
                  </p>
                </div>

                {/* History List */}
                {filteredHistory.length === 0 ? (
                  <div className="text-center py-20 bg-surface-secondary/50 rounded-3xl border border-dashed border-border">
                    <Search className="w-10 h-10 text-text-light mx-auto mb-4" />
                    <p className="text-text-muted text-sm">{t.historyNoFilterResults}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {filteredHistory.sort((a, b) => b.timestamp - a.timestamp).map((item) => (
                      <motion.article 
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        key={item.id} 
                        className="bg-surface p-5 rounded-2xl shadow-sm border border-border flex flex-col md:flex-row md:items-center justify-between gap-6 group hover:border-accent/30 hover:shadow-md transition-all cursor-pointer relative overflow-hidden"
                        onClick={() => {
                          setSelectedResult(item);
                          setResults([item]);
                          setActiveTab('analyze');
                        }}
                      >
                        {/* Visual Indicator on the side */}
                        <div className={cn(
                          "absolute left-0 top-0 bottom-0 w-1.5",
                          item.matchScore > 80 ? "bg-success" : 
                          item.matchScore > 60 ? "bg-accent" : "bg-warning"
                        )} />

                        <div className="flex items-center gap-5 flex-1 min-w-0">
                          <div className={cn(
                            "w-16 h-16 rounded-2xl flex flex-col items-center justify-center font-black text-xl border-2 shrink-0",
                            item.matchScore > 80 ? "bg-success-light border-success/10 text-success" : 
                            item.matchScore > 60 ? "bg-accent-light border-accent/10 text-accent" : "bg-warning-light border-warning/10 text-warning"
                          )}>
                            <span className="leading-none">{item.matchScore}</span>
                            <span className="text-[9px] uppercase tracking-tighter opacity-60">ATS</span>
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-bold text-text-main truncate text-lg group-hover:text-accent transition-colors">{item.cvName}</h3>
                              {item.matchScore > 85 && (
                                <div className="bg-success-light text-success text-[8px] font-black uppercase px-1.5 py-0.5 rounded flex items-center gap-1 shrink-0">
                                  <Sparkles className="w-2 h-2" />
                                  {t.historyTopMatch}
                                </div>
                              )}
                            </div>
                            <p className="text-sm text-text-muted font-medium truncate">
                              {(item.jobTitle || item.jdTitle || t.historyUnknownPosition).split('\n')[0]}
                            </p>
                            <div className="flex items-center gap-4 mt-3">
                              <div className="flex items-center gap-1.5 text-[10px] font-bold text-text-light uppercase tracking-wider">
                                <Clock className="w-3 h-3" />
                                {new Date(item.timestamp).toLocaleDateString(dateLocale, { day: '2-digit', month: '2-digit', year: 'numeric' })}
                              </div>
                              <div className="flex items-center gap-1.5 text-[10px] font-bold text-text-light uppercase tracking-wider">
                                <Target className="w-3 h-3" />
                                {item.successProbability}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Mini Visual Stats */}
                        <div className="flex items-center gap-8 shrink-0">
                          <div className="hidden lg:flex items-center gap-4">
                            {item.categoryScores && (
                              <div 
                                className="flex gap-1.5 cursor-help" 
                                title={formatLabel(t.historyCategoryTooltip, {
                                  skills: item.categoryScores.skills,
                                  experience: item.categoryScores.experience,
                                  tools: item.categoryScores.tools,
                                  education: item.categoryScores.education,
                                })}
                              >
                                {[
                                  { key: 'skills', label: 'K', color: 'bg-accent' },
                                  { key: 'experience', label: 'N', color: 'bg-success' },
                                  { key: 'tools', label: 'C', color: 'bg-warning' },
                                  { key: 'education', label: 'H', color: 'bg-purple-400' }
                                ].map((cat) => {
                                  const score = item.categoryScores[cat.key as keyof typeof item.categoryScores] || 0;
                                  return (
                                    <div key={cat.key} className="flex flex-col items-center gap-1">
                                      <div className="w-1.5 h-8 bg-surface-secondary rounded-full overflow-hidden flex flex-col justify-end">
                                        <motion.div 
                                          initial={{ height: 0 }}
                                          animate={{ height: `${score}%` }}
                                          className={cn("w-full rounded-full", cat.color)}
                                        />
                                      </div>
                                      <span className="text-[7px] font-black text-text-light uppercase">{cat.label}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteHistoryItem(item.id);
                              }}
                              className="p-3 text-text-light hover:text-error hover:bg-error-light rounded-xl transition-all lg:opacity-0 lg:group-hover:opacity-100 cursor-pointer"
                              title={t.historyDeleteResult}
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                            <div className="p-2.5 bg-surface-secondary text-text-light group-hover:bg-accent-light group-hover:text-accent rounded-xl transition-all">
                              <ChevronRight className="w-5 h-5" />
                            </div>
                          </div>
                        </div>
                      </motion.article>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
    </>
  );
}
