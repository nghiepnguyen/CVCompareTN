import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FileSearch, LayoutDashboard, History as HistoryIcon, ShieldCheck, Briefcase, LogOut, LogIn, ExternalLink, User as UserIcon, Sparkles } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { formatPlanExpiryDate, isProPlan, isRecruiterPlan } from '../../lib/planLimits';
import { formatLabel } from '../../translations';
import { useUI } from '../../context/UIContext';
import { useAnalysis } from '../../context/AnalysisContext';
import { trackEvent } from '../../lib/ga4';
import { cn } from '../../lib/utils';

export function Header() {
  const { user, userProfile, effectivePlan, allUsers, login, logout } = useAuth();
  const showProBadge =
    user && (userProfile?.role === 'admin' || isProPlan(effectivePlan));
  const showRecruiterBadge =
    user && (userProfile?.role === 'admin' || isRecruiterPlan(effectivePlan));
  const showRecruiterTab =
    user && userProfile && (userProfile.role === 'admin' || isRecruiterPlan(userProfile.plan));
  const { activeTab, setActiveTab, navigateToUpgrade, reportLanguage, setReportLanguage, isUserMenuOpen, setIsUserMenuOpen, t } = useUI();
  const { selectedResult, setSelectedResult } = useAnalysis();

  const newUsersCount = allUsers.filter(u => u.isNew && u.role !== 'admin').length;
  const planExpiryInMenu =
    (showProBadge || showRecruiterBadge) && userProfile?.planExpiresAt
      ? formatLabel(t.planExpiresUntil, {
          date: formatPlanExpiryDate(userProfile.planExpiresAt, reportLanguage) ?? '',
        })
      : null;

  const handleLogout = async () => {
    await logout();
    setIsUserMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-50 bg-primary/80 backdrop-blur-2xl border-b border-white/[0.06]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3 cursor-pointer group" onClick={() => { setActiveTab('analyze'); setSelectedResult(null); }}>
          <div className="relative w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-xl transition-transform group-hover:scale-110">
            <div className="absolute inset-0 bg-accent opacity-20 blur-lg rounded-full" />
            <FileSearch className="text-white w-5 h-5 relative z-10" />
          </div>
          <span className="text-xl font-extrabold tracking-tighter text-text-main hidden sm:inline font-sans">
            cv<span className="text-accent">Fit</span>.pro
          </span>
        </div>
          
        <div className="flex items-center gap-2 sm:gap-4">
          <nav className="hidden lg:flex items-center gap-1 bg-white/[0.03] p-1 rounded-xl backdrop-blur-md">
            {user && (
              <>
                <button 
                  onClick={() => { setActiveTab('analyze'); setSelectedResult(null); }}
                  className={cn(
                    "flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-1.5 rounded-lg text-sm font-bold transition-all cursor-pointer",
                    activeTab === 'analyze' && !selectedResult ? "bg-white/[0.06] text-accent" : "text-text-muted hover:text-text-main"
                  )}
                >
                  <LayoutDashboard className="w-4 h-4" />
                  <span className="hidden md:inline">{t.analyze}</span>
                </button>
                <button 
                  onClick={() => { 
                    setActiveTab('history'); 
                    setSelectedResult(null); 
                    trackEvent('view_history');
                  }}
                  className={cn(
                    "flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-1.5 rounded-lg text-sm font-bold transition-all cursor-pointer",
                    activeTab === 'history' && !selectedResult ? "bg-white/[0.06] text-accent" : "text-text-muted hover:text-text-main"
                  )}
                >
                  <HistoryIcon className="w-4 h-4" />
                  <span className="hidden md:inline">{t.history}</span>
                </button>
                {showRecruiterTab && (
                  <button 
                    onClick={() => { setActiveTab('recruiter'); setSelectedResult(null); }}
                    className={cn(
                      "flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-1.5 rounded-lg text-sm font-bold transition-all cursor-pointer",
                      activeTab === 'recruiter' && !selectedResult ? "bg-white/[0.06] text-accent" : "text-text-muted hover:text-text-main"
                    )}
                  >
                    <Briefcase className="w-4 h-4" />
                    <span className="hidden md:inline">{t.recruiterTab}</span>
                  </button>
                )}
              </>
            )}
            { (userProfile?.role === 'admin' || user?.email?.toLowerCase() === (import.meta.env.VITE_ADMIN_EMAIL || "").toLowerCase()) && (
              <button 
                onClick={() => { setActiveTab('admin'); setSelectedResult(null); }}
                className={cn(
                    "flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-lg text-sm font-bold transition-all relative cursor-pointer",
                    activeTab === 'admin' && !selectedResult ? "bg-white/[0.06] text-accent" : "text-text-muted hover:text-text-main"
                )}
              >
                <ShieldCheck className="w-4 h-4" />
                <span className="hidden md:inline">{t.admin}</span>
                {newUsersCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-error text-white text-[10px] flex items-center justify-center rounded-full border-2 border-surface animate-pulse">
                    {newUsersCount}
                  </span>
                )}
              </button>
            )}
          </nav>

          <div className="h-8 w-px bg-white/[0.06] mx-1 hidden md:block" />

          {/* Language Switcher */}
          <div className="flex items-center gap-1 bg-white/[0.03] p-1 rounded-xl">
            <button 
              onClick={() => setReportLanguage('vi')}
              className={cn(
                  "px-3 py-2 sm:px-2 sm:py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer",
                  reportLanguage === 'vi' ? "bg-white/[0.06] text-accent" : "text-text-light hover:text-text-muted"
              )}
            >
              VI
            </button>
            <button 
              onClick={() => setReportLanguage('en')}
              className={cn(
                  "px-3 py-2 sm:px-2 sm:py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer",
                  reportLanguage === 'en' ? "bg-white/[0.06] text-accent" : "text-text-light hover:text-text-muted"
              )}
            >
              EN
            </button>
          </div>

          <div className="h-8 w-px bg-white/[0.06] mx-1 hidden md:block" />

          {user ? (
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="relative">
                <button 
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  className="flex items-center focus:outline-none cursor-pointer"
                >
                  {(userProfile?.photoURL || user.user_metadata?.avatar_url) ? (
                    <img src={userProfile?.photoURL || user.user_metadata?.avatar_url || ''} alt={user.user_metadata?.full_name || ''} className="w-9 h-9 rounded-full border-2 border-white/[0.1] hover:border-accent/50 transition-all" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-accent/10 flex items-center justify-center text-accent border-2 border-white/[0.1] hover:border-accent/50 transition-all">
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
                        className="absolute top-full right-0 mt-2 bg-primary-light/95 backdrop-blur-2xl border border-white/[0.08] rounded-2xl shadow-2xl p-2 z-[60] min-w-[200px]"
                      >
                        <div className="px-4 py-3 border-b border-white/[0.06] mb-1 rounded-t-2xl">
                          <div className="flex items-center gap-2">
                            <div className="text-sm font-bold text-text-main truncate">{user.user_metadata?.full_name || user.email}</div>
                            {showRecruiterBadge && (
                              <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-400/20 shrink-0">
                                RECRUITER
                              </span>
                            )}
                            {showProBadge && !showRecruiterBadge && (
                              <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-accent/10 text-accent border border-accent/20 shrink-0">
                                {t.planBadgePro}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-text-light truncate font-medium">{user.email}</div>
                          {planExpiryInMenu && (
                            <div className="text-[10px] font-bold text-accent mt-1">
                              {planExpiryInMenu}
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setIsUserMenuOpen(false);
                            setSelectedResult(null);
                            setActiveTab('profile');
                          }}
                          className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-text-main hover:bg-white/[0.05] rounded-xl transition-colors cursor-pointer"
                        >
                          <UserIcon className="w-4 h-4" />
                          {t.profile}
                        </button>
                        {!showProBadge && !showRecruiterBadge && (
                          <button
                            type="button"
                            onClick={() => {
                              setIsUserMenuOpen(false);
                              setSelectedResult(null);
                              navigateToUpgrade();
                            }}
                            className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-accent hover:bg-accent/10 rounded-xl transition-colors cursor-pointer"
                          >
                            <Sparkles className="w-4 h-4" />
                            {t.menuUpgrade}
                          </button>
                        )}
                        <button 
                          onClick={handleLogout}
                          className="w-full flex items-center gap-3 px-4 py-3.5 text-sm font-bold text-error hover:bg-error/10 rounded-xl transition-colors cursor-pointer"
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
                className="flex items-center gap-2 px-5 py-3 sm:px-4 sm:py-2 bg-accent text-white rounded-xl text-sm font-bold hover:bg-accent-hover transition-all sm:bg-white/[0.03] sm:text-text-main sm:border sm:border-white/[0.08] sm:hover:bg-white/[0.06] cursor-pointer"
              >
                <LogIn className="w-4 h-4 sm:text-accent" />
                <span className="hidden xs:inline sm:inline">{t.login}</span>
              </button>
              {window.self !== window.top && (
                <button 
                  onClick={() => window.open(window.location.href, '_blank')}
                  className="p-2 bg-white/[0.03] text-text-light rounded-xl hover:bg-white/[0.06] transition-all cursor-pointer"
                  title={t.openInNewTabTooltip}
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