import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { Trash2, TrendingUp, Download, Eye, FileText, CheckCircle2, AlertCircle, History as HistoryIcon, Clock, ChevronRight, Sparkles, Target, BarChart3, Search, Filter, Calendar } from 'lucide-react';
import { useAnalysis } from '../../context/AnalysisContext';
import { useUI } from '../../context/UIContext';
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
  const { t, setActiveTab } = useUI();
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
    if (user?.uid) {
      try {
        await deleteFromHistory(user.uid, id);
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
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">{t.analysisHistory}</h2>
                <p className="text-sm text-slate-500">{t.historyDesc}</p>
              </div>
              {history.length > 0 && (
                <button 
                  onClick={clearHistory}
                  className="flex items-center gap-2 text-sm font-bold text-red-500 hover:text-red-600 transition-colors px-4 py-2 bg-red-50 rounded-xl border border-red-100 cursor-pointer hover:scale-105 active:scale-95"
                >
                  <Trash2 className="w-4 h-4" />
                  {t.clearHistory}
                </button>
              )}
            </div>

            {isLoadingHistory ? (
              <div className="text-center py-24 bg-white rounded-[2rem] border border-slate-200 shadow-sm flex flex-col items-center justify-center">
                <div className="w-16 h-16 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin mb-6"></div>
                <h3 className="text-xl font-bold text-slate-800 mb-2">Đang tải lịch sử...</h3>
                <p className="text-slate-500 max-w-sm mx-auto">Vui lòng đợi trong giây lát khi chúng tôi lấy dữ liệu của bạn.</p>
              </div>
            ) : history.length === 0 ? (
              <div className="text-center py-24 bg-white rounded-[2rem] border border-slate-200 shadow-sm">
                <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center mx-auto mb-6">
                  <HistoryIcon className="w-10 h-10 text-slate-200" />
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-2">Chưa có lịch sử</h3>
                <p className="text-slate-500 max-w-sm mx-auto">Hãy bắt đầu bằng cách tải lên CV và phân tích để lưu lại kết quả tại đây.</p>
                <button 
                  onClick={() => setActiveTab('analyze')}
                  className="mt-8 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 cursor-pointer hover:scale-105 active:scale-95"
                >
                  Phân tích ngay
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
                      className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm"
                    >
                      <div className="flex items-center justify-between mb-6">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                          <TrendingUp className="w-5 h-5 text-indigo-500" />
                          Xu hướng điểm số
                        </h3>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Gần đây</span>
                      </div>
                      <div className="h-48 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={[...history].reverse().slice(-10).map(h => ({ name: new Date(h.timestamp).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }), score: h.matchScore }))}>
                            <defs>
                              <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                            <YAxis domain={[0, 100]} hide />
                            <Tooltip 
                              contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                              itemStyle={{ fontWeight: 'bold', color: '#6366f1' }}
                            />
                            <Area type="monotone" dataKey="score" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorScore)" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </motion.div>

                    <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 }}
                      className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm"
                    >
                      <div className="flex items-center justify-between mb-6">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                          <BarChart3 className="w-5 h-5 text-emerald-500" />
                          Phân bổ chất lượng CV
                        </h3>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tổng quan</span>
                      </div>
                      <div className="h-48 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={[
                            { name: 'Thấp', count: history.filter(h => h.matchScore < 60).length, color: '#f59e0b' },
                            { name: 'T.Bình', count: history.filter(h => h.matchScore >= 60 && h.matchScore <= 80).length, color: '#6366f1' },
                            { name: 'Cao', count: history.filter(h => h.matchScore > 80).length, color: '#10b981' }
                          ]}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                            <Tooltip 
                              cursor={{ fill: '#f8fafc' }}
                              contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                            />
                            <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                              {[
                                { color: '#f59e0b' },
                                { color: '#6366f1' },
                                { color: '#10b981' }
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
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col lg:flex-row gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                      type="text"
                      placeholder="Tìm kiếm theo tên CV hoặc vị trí công việc..."
                      value={historySearchQuery}
                      onChange={(e) => setHistorySearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 sm:py-1.5 rounded-xl border border-slate-200">
                      <Filter className="w-3.5 h-3.5 text-slate-400" />
                      <select 
                        value={historyScoreFilter}
                        onChange={(e) => setHistoryScoreFilter(e.target.value as any)}
                        className="bg-transparent text-xs font-bold text-slate-600 focus:outline-none cursor-pointer h-8 sm:h-auto"
                      >
                        <option value="all">Tất cả điểm số</option>
                        <option value="high">Điểm cao ({'>'}80)</option>
                        <option value="medium">Trung bình (60-80)</option>
                        <option value="low">Điểm thấp ({'<'}60)</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 sm:py-1.5 rounded-xl border border-slate-200">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <select 
                        value={historyDateFilter}
                        onChange={(e) => setHistoryDateFilter(e.target.value as any)}
                        className="bg-transparent text-xs font-bold text-slate-600 focus:outline-none cursor-pointer h-8 sm:h-auto"
                      >
                        <option value="all">Mọi thời gian</option>
                        <option value="today">Hôm nay</option>
                        <option value="week">7 ngày qua</option>
                        <option value="month">30 ngày qua</option>
                      </select>
                    </div>
                    {(historySearchQuery || historyScoreFilter !== 'all' || historyDateFilter !== 'all') && (
                      <button 
                        onClick={() => {
                          setHistorySearchQuery('');
                          setHistoryScoreFilter('all');
                          setHistoryDateFilter('all');
                        }}
                        className="text-xs font-bold text-indigo-600 hover:text-indigo-700 px-2"
                      >
                        Xóa bộ lọc
                      </button>
                    )}
                  </div>
                </div>

                {/* Results Count */}
                <div className="flex items-center justify-between px-2">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                    Hiển thị {filteredHistory.length} kết quả
                  </p>
                </div>

                {/* History List */}
                {filteredHistory.length === 0 ? (
                  <div className="text-center py-20 bg-slate-50/50 rounded-3xl border border-dashed border-slate-200">
                    <Search className="w-10 h-10 text-slate-200 mx-auto mb-4" />
                    <p className="text-slate-500 text-sm">Không tìm thấy kết quả phù hợp với bộ lọc.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {filteredHistory.sort((a, b) => b.timestamp - a.timestamp).map((item) => (
                      <motion.article 
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        key={item.id} 
                        className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-6 group hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer relative overflow-hidden"
                        onClick={() => {
                          setSelectedResult(item);
                          setResults([item]);
                          setActiveTab('analyze');
                        }}
                      >
                        {/* Visual Indicator on the side */}
                        <div className={cn(
                          "absolute left-0 top-0 bottom-0 w-1.5",
                          item.matchScore > 80 ? "bg-emerald-500" : 
                          item.matchScore > 60 ? "bg-indigo-500" : "bg-amber-500"
                        )} />

                        <div className="flex items-center gap-5 flex-1 min-w-0">
                          <div className={cn(
                            "w-16 h-16 rounded-2xl flex flex-col items-center justify-center font-black text-xl border-2 shrink-0",
                            item.matchScore > 80 ? "bg-emerald-50 border-emerald-100 text-emerald-600" : 
                            item.matchScore > 60 ? "bg-indigo-50 border-indigo-100 text-indigo-600" : "bg-amber-50 border-amber-100 text-amber-600"
                          )}>
                            <span className="leading-none">{item.matchScore}</span>
                            <span className="text-[9px] uppercase tracking-tighter opacity-60">ATS</span>
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-bold text-slate-800 truncate text-lg group-hover:text-indigo-600 transition-colors">{item.cvName}</h3>
                              {item.matchScore > 85 && (
                                <div className="bg-emerald-100 text-emerald-700 text-[8px] font-black uppercase px-1.5 py-0.5 rounded flex items-center gap-1 shrink-0">
                                  <Sparkles className="w-2 h-2" />
                                  Top Match
                                </div>
                              )}
                            </div>
                            <p className="text-sm text-slate-500 font-medium truncate">
                              {(item.jobTitle || item.jdTitle || 'Không rõ vị trí').split('\n')[0]}
                            </p>
                            <div className="flex items-center gap-4 mt-3">
                              <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                <Clock className="w-3 h-3" />
                                {new Date(item.timestamp).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                              </div>
                              <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
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
                                title={`Kỹ năng (K): ${item.categoryScores.skills}%\nKinh nghiệm (N): ${item.categoryScores.experience}%\nCông cụ (C): ${item.categoryScores.tools}%\nHọc vấn (H): ${item.categoryScores.education}%`}
                              >
                                {[
                                  { key: 'skills', label: 'K', color: 'bg-indigo-400' },
                                  { key: 'experience', label: 'N', color: 'bg-emerald-400' },
                                  { key: 'tools', label: 'C', color: 'bg-amber-400' },
                                  { key: 'education', label: 'H', color: 'bg-purple-400' }
                                ].map((cat) => {
                                  const score = item.categoryScores[cat.key as keyof typeof item.categoryScores] || 0;
                                  return (
                                    <div key={cat.key} className="flex flex-col items-center gap-1">
                                      <div className="w-1.5 h-8 bg-slate-100 rounded-full overflow-hidden flex flex-col justify-end">
                                        <motion.div 
                                          initial={{ height: 0 }}
                                          animate={{ height: `${score}%` }}
                                          className={cn("w-full rounded-full", cat.color)}
                                        />
                                      </div>
                                      <span className="text-[7px] font-black text-slate-300 uppercase">{cat.label}</span>
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
                              className="p-3 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all lg:opacity-0 lg:group-hover:opacity-100 cursor-pointer"
                              title="Xóa kết quả"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                            <div className="p-2.5 bg-slate-50 text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 rounded-xl transition-all">
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
