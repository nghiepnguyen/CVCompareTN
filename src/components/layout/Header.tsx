import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FileSearch, LayoutDashboard, History as HistoryIcon, ShieldCheck, Briefcase, LogOut, LogIn, ExternalLink, User as UserIcon, Sparkles, Sun, Moon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { formatPlanExpiryDate, isProPlan, isRecruiterPlan } from '../../lib/planLimits';
import { formatLabel } from '../../translations';
import { useUI } from '../../context/UIContext';
import { useAnalysis } from '../../context/AnalysisContext';
import { trackEvent } from '../../lib/ga4';
import { cn } from '../../lib/utils';
import { UserAvatar } from '../ui/UserAvatar';

export function Header() {
  const { user, userProfile, effectivePlan, adminNewUsersCount, login, logout, openAuthModal } = useAuth();
  const showProBadge =
    user && (userProfile?.role === 'admin' || isProPlan(effectivePlan));
  const showRecruiterBadge =
    user && (userProfile?.role === 'admin' || isRecruiterPlan(effectivePlan));
  const showRecruiterTab = !!user;
  const { activeTab, setActiveTab, navigateToUpgrade, reportLanguage, setReportLanguage, isUserMenuOpen, setIsUserMenuOpen, isDarkMode, toggleTheme, t } = useUI();
  const { selectedResult, setSelectedResult } = useAnalysis();

  const newUsersCount = adminNewUsersCount;
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
    <header className={cn(
      "z-50 transition-colors",
      user
        ? "sticky top-0 backdrop-blur-xl border-b bg-primary/95 border-border"
        : "fixed top-3 inset-x-3 sm:top-4 sm:inset-x-4"
    )}>
      <div className={cn(
        "mx-auto flex items-center justify-between gap-4 h-16",
        user
          ? "max-w-7xl px-4 sm:px-6 lg:px-8"
          : "max-w-5xl rounded-full border border-slate-900/[0.06] bg-white/50 px-3 sm:px-4 lg:px-6 backdrop-blur-md shadow-[0_8px_30px_rgba(15,23,42,0.08)] transition-shadow duration-500 hover:shadow-[0_8px_36px_rgba(5,150,105,0.14)]"
      )}>
        {/* ---- Logo ---- */}
        <a
          href={`/${reportLanguage}/`}
          className="flex items-center gap-3 cursor-pointer group shrink-0"
          onClick={(e) => { e.preventDefault(); setActiveTab('analyze'); setSelectedResult(null); }}
        >
          <div className={cn(
            "relative w-10 h-10 rounded-xl flex items-center justify-center shadow-xl transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:scale-110",
            user ? "dark:bg-primary bg-accent" : "bg-accent"
          )}>
            <div className="absolute inset-0 bg-accent opacity-20 blur-lg rounded-full" />
            <FileSearch className="text-white w-5 h-5 relative z-10" strokeWidth={1.75} />
          </div>
          <span className={cn(
            "hidden min-[360px]:inline text-xl font-extrabold tracking-tighter font-sans",
            user ? "text-text-main" : "text-slate-900"
          )}>
            cv<span className="text-accent">Fit</span>.pro
          </span>
        </a>

        {/* ---- Desktop Nav ---- */}
        {(user || userProfile?.role === 'admin') && (
        <nav className="hidden lg:flex items-center gap-1 dark:bg-white/[0.03] bg-surface-muted p-1 rounded-xl backdrop-blur-md shrink-0">
          {user && (
            <>
              <button 
                onClick={() => { setActiveTab('analyze'); setSelectedResult(null); }}
                className={cn(
                  "flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-sm font-bold transition-all cursor-pointer",
                  activeTab === 'analyze' && !selectedResult ? "dark:bg-white/[0.06] bg-surface text-accent" : "text-text-muted hover:text-text-main"
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
                  "flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-sm font-bold transition-all cursor-pointer",
                  activeTab === 'history' && !selectedResult ? "dark:bg-white/[0.06] bg-surface text-accent" : "text-text-muted hover:text-text-main"
                )}
              >
                <HistoryIcon className="w-4 h-4" />
                <span className="hidden md:inline">{t.history}</span>
              </button>
              {showRecruiterTab && (
                <button 
                  onClick={() => { setActiveTab('recruiter'); setSelectedResult(null); }}
                  className={cn(
                    "flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-sm font-bold transition-all cursor-pointer",
                    activeTab === 'recruiter' && !selectedResult ? "dark:bg-white/[0.06] bg-surface text-accent" : "text-text-muted hover:text-text-main"
                  )}
                >
                  <Briefcase className="w-4 h-4" />
                  <span className="hidden md:inline">{t.recruiterTab}</span>
                </button>
              )}
            </>
          )}
          { userProfile?.role === 'admin' && (
            <button 
              onClick={() => { setActiveTab('admin'); setSelectedResult(null); }}
              className={cn(
                  "flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-lg text-sm font-bold transition-all relative cursor-pointer",
                  activeTab === 'admin' && !selectedResult ? "dark:bg-white/[0.06] bg-surface text-accent" : "text-text-muted hover:text-text-main"
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
        )}

        {/* ---- Right Side Actions ---- */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Language Switcher */}
          <div className={cn(
            "flex items-center gap-0.5 p-1 rounded-xl",
            user ? "dark:bg-white/[0.03] bg-surface-muted" : "bg-slate-900/5"
          )}>
            <button
              onClick={() => setReportLanguage('vi')}
              className={cn(
                  "px-2.5 py-1.5 rounded-lg text-[10px] font-black transition-all cursor-pointer",
                  reportLanguage === 'vi'
                    ? user ? "dark:bg-white/[0.06] bg-surface text-accent" : "bg-white text-accent shadow-sm"
                    : user ? "text-text-light hover:text-text-muted" : "text-slate-400 hover:text-slate-600"
              )}
            >
              VI
            </button>
            <button
              onClick={() => setReportLanguage('en')}
              className={cn(
                  "px-2.5 py-1.5 rounded-lg text-[10px] font-black transition-all cursor-pointer",
                  reportLanguage === 'en'
                    ? user ? "dark:bg-white/[0.06] bg-surface text-accent" : "bg-white text-accent shadow-sm"
                    : user ? "text-text-light hover:text-text-muted" : "text-slate-400 hover:text-slate-600"
              )}
            >
              EN
            </button>
          </div>

          {user && (
            <>
              {/* Theme Toggle — only for logged-in users */}
              <button
                onClick={toggleTheme}
                className="w-9 h-9 rounded-xl dark:bg-white/[0.03] bg-surface-muted flex items-center justify-center hover:bg-surface-secondary dark:hover:bg-white/[0.06] transition-all cursor-pointer group"
                title={isDarkMode ? (reportLanguage === 'vi' ? 'Chuyển sang giao diện sáng' : 'Switch to light mode') : (reportLanguage === 'vi' ? 'Chuyển sang giao diện tối' : 'Switch to dark mode')}
              >
                {isDarkMode ? (
                  <Sun className="w-4 h-4 text-warning transition-all duration-300 group-hover:rotate-90 group-hover:scale-110" />
                ) : (
                  <Moon className="w-4 h-4 text-text-muted transition-all duration-300 group-hover:rotate-12 group-hover:scale-110" />
                )}
              </button>

              {/* Vertical divider */}
              <div className="h-8 w-px dark:bg-white/[0.06] bg-border hidden sm:block" />
            </>
          )}

          {/* ---- User Section ---- */}
          {user ? (
            <div className="relative">
              <button 
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className="flex items-center focus:outline-none cursor-pointer"
              >
                <UserAvatar
                  src={userProfile?.photoURL || user.user_metadata?.avatar_url}
                  alt={user.user_metadata?.full_name || ''}
                  imgClassName="w-9 h-9 rounded-full border-2 dark:border-white/[0.1] border-border hover:border-accent/50 transition-all"
                  fallbackClassName="w-9 h-9 rounded-full bg-accent/10 flex items-center justify-center text-accent border-2 dark:border-white/[0.1] border-border hover:border-accent/50 transition-all"
                >
                  <UserIcon className="w-5 h-5" />
                </UserAvatar>
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
                      className="absolute top-full right-0 mt-2 bg-primary-light/95 backdrop-blur-2xl border border-border rounded-2xl shadow-2xl p-2 z-[60] min-w-[200px]"
                    >
                      <div className="px-4 py-3 border-b dark:border-white/[0.06] border-border mb-1 rounded-t-2xl">
                        <div className="flex items-center gap-2">
                          <div className="text-sm font-bold text-text-main truncate">{user.user_metadata?.full_name || user.email}</div>
                          {showRecruiterBadge && (
                            <span className="text-[10px] font-black px-1.5 py-0.5 rounded dark:bg-purple-500/10 bg-purple-100 dark:text-purple-400 text-purple-700 border dark:border-purple-400/20 border-purple-300 shrink-0">
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
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-text-main dark:hover:bg-white/[0.05] hover:bg-surface-secondary rounded-xl transition-colors cursor-pointer"
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
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => openAuthModal('signIn')}
                className="hidden sm:flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-full text-sm font-bold hover:bg-accent-hover transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] cursor-pointer hover:scale-105 active:scale-95"
              >
                <LogIn className="w-4 h-4" strokeWidth={1.75} />
                <span>{t.login}</span>
              </button>
              {/* Mobile login (icon only) */}
              <button
                onClick={() => openAuthModal('signIn')}
                className="sm:hidden flex items-center justify-center w-9 h-9 bg-accent text-white rounded-full hover:bg-accent-hover transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] cursor-pointer hover:scale-105 active:scale-95"
              >
                <LogIn className="w-4 h-4" strokeWidth={1.75} />
              </button>
              {window.self !== window.top && (
                <button
                  onClick={() => window.open(window.location.href, '_blank')}
                  className="p-2 bg-slate-900/5 text-slate-400 rounded-xl hover:bg-slate-900/10 hover:text-slate-600 transition-all cursor-pointer"
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