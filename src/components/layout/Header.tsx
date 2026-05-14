import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FileSearch, LayoutDashboard, History as HistoryIcon, ShieldCheck, LogOut, LogIn, ExternalLink, User as UserIcon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { useAnalysis } from '../../context/AnalysisContext';
import { cn } from '../../lib/utils';

export function Header() {
  const { user, userProfile, allUsers, login, logout } = useAuth();
  const { activeTab, setActiveTab, reportLanguage, setReportLanguage, isUserMenuOpen, setIsUserMenuOpen, t } = useUI();
  const { selectedResult, setSelectedResult } = useAnalysis();

  const newUsersCount = allUsers.filter(u => u.isNew && u.role !== 'admin').length;

  const handleLogout = async () => {
    await logout();
    setIsUserMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3 cursor-pointer group" onClick={() => { setActiveTab('analyze'); setSelectedResult(null); }}>
          <div className="relative w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center shadow-xl transition-transform group-hover:scale-110">
            <div className="absolute inset-0 bg-primary opacity-20 blur-lg rounded-full" />
            <FileSearch className="text-white w-5 h-5 relative z-10" />
          </div>
          <span className="text-xl font-extrabold tracking-tighter text-slate-900 hidden sm:inline font-sans">
            cv matcher<span className="text-primary italic">.ai</span>
          </span>
        </div>
          
        <div className="flex items-center gap-2 sm:gap-4">
          <nav className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            {user && (
              <>
                <button 
                  onClick={() => { setActiveTab('analyze'); setSelectedResult(null); }}
                  className={cn(
                    "flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-1.5 rounded-lg text-sm font-bold transition-all cursor-pointer hover:scale-105 active:scale-95",
                    activeTab === 'analyze' && !selectedResult ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  )}
                >
                  <LayoutDashboard className="w-4 h-4" />
                  <span className="hidden md:inline">{t.analyze}</span>
                </button>
                <button 
                  onClick={() => { 
                    setActiveTab('history'); 
                    setSelectedResult(null); 
                    if (window.gtag) window.gtag('event', 'view_history');
                  }}
                  className={cn(
                    "flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-1.5 rounded-lg text-sm font-bold transition-all cursor-pointer hover:scale-105 active:scale-95",
                    activeTab === 'history' && !selectedResult ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  )}
                >
                  <HistoryIcon className="w-4 h-4" />
                  <span className="hidden md:inline">{t.history}</span>
                </button>
              </>
            )}
            { (userProfile?.role === 'admin' || user?.email?.toLowerCase() === (import.meta.env.VITE_ADMIN_EMAIL || "").toLowerCase()) && (
              <button 
                onClick={() => { setActiveTab('admin'); setSelectedResult(null); }}
                className={cn(
                  "flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-lg text-sm font-bold transition-all relative cursor-pointer hover:scale-105 active:scale-95",
                  activeTab === 'admin' && !selectedResult ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                <ShieldCheck className="w-4 h-4" />
                <span className="hidden md:inline">{t.admin}</span>
                {newUsersCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] flex items-center justify-center rounded-full border-2 border-white animate-pulse">
                    {newUsersCount}
                  </span>
                )}
              </button>
            )}
          </nav>

          <div className="h-8 w-px bg-slate-200 mx-1 hidden md:block" />

          {/* Language Switcher */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            <button 
              onClick={() => setReportLanguage('vi')}
              className={cn(
                "px-3 py-2 sm:px-2 sm:py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer hover:scale-110 active:scale-90",
                reportLanguage === 'vi' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
              )}
            >
              VI
            </button>
            <button 
              onClick={() => setReportLanguage('en')}
              className={cn(
                "px-3 py-2 sm:px-2 sm:py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer hover:scale-110 active:scale-90",
                reportLanguage === 'en' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
              )}
            >
              EN
            </button>
          </div>

          <div className="h-8 w-px bg-slate-200 mx-1 hidden md:block" />

          {user ? (
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="relative">
                <button 
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  className="flex items-center focus:outline-none cursor-pointer"
                >
                  {(userProfile?.photoURL || user.photoURL) ? (
                    <img src={userProfile?.photoURL || user.photoURL || ''} alt={user.displayName || ''} className="w-9 h-9 rounded-full border-2 border-white shadow-sm hover:border-indigo-200 transition-all" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 border-2 border-white shadow-sm hover:border-indigo-200 transition-all">
                      <UserIcon className="w-5 h-5" />
                    </div>
                  )}
                </button>
                
                <AnimatePresence>
                  {isUserMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-[55] cursor-pointer" onClick={() => setIsUserMenuOpen(false)} />
                      <motion.div 
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="absolute top-full right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl p-2 z-[60] min-w-[200px]"
                      >
                        <div className="px-4 py-3 border-b border-slate-100 mb-1 bg-slate-50/50 rounded-t-2xl">
                          <div className="text-sm font-bold text-slate-800 truncate">{user.displayName}</div>
                          <div className="text-[10px] text-slate-400 truncate font-medium">{user.email}</div>
                        </div>
                        <button 
                          onClick={handleLogout}
                          className="w-full flex items-center gap-3 px-4 py-3.5 text-sm font-bold text-red-500 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
                        >
                          <LogOut className="w-4 h-4" />
                          {t.logout}
                        </button>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button 
                onClick={login}
                className="flex items-center gap-2 px-5 py-3 sm:px-4 sm:py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 sm:bg-white sm:text-slate-700 sm:border sm:border-slate-200 sm:shadow-sm sm:hover:bg-slate-50 cursor-pointer"
              >
                <LogIn className="w-4 h-4 sm:text-indigo-600" />
                <span className="hidden xs:inline sm:inline">{t.login}</span>
              </button>
              {window.self !== window.top && (
                <button 
                  onClick={() => window.open(window.location.href, '_blank')}
                  className="p-2 bg-slate-100 text-slate-500 rounded-xl hover:bg-slate-200 transition-all cursor-pointer"
                  title="Mở trong tab mới để đăng nhập dễ hơn"
                >
                  <ExternalLink className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
