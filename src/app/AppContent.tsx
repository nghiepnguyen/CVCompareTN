import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, Loader2, FileSearch, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useUI } from '../context/UIContext';
import { useAnalysis } from '../context/AnalysisContext';
import { Header } from '../components/layout/Header';
import { Footer } from '../components/layout/Footer';
import { InAppBrowserWarning } from '../components/layout/InAppBrowserWarning';
import { CookieConsentBanner } from '../components/layout/CookieConsentBanner';
import { cn } from '../lib/utils';
import { isRecruiterPlan } from '../lib/planLimits';
import { MobileBottomNav } from './MobileBottomNav';
import { SavedJdsListModal } from './SavedJdsListModal';
import { SaveJdNameModal } from './SaveJdNameModal';
import { SavedCvsListModal } from './SavedCvsListModal';

const LandingView = React.lazy(() =>
  import('../components/views/LandingView').then((m) => ({ default: m.LandingView }))
);
const DashboardView = React.lazy(() =>
  import('../components/views/DashboardView').then((m) => ({ default: m.DashboardView }))
);
const AdminView = React.lazy(() =>
  import('../components/views/AdminView').then((m) => ({ default: m.AdminView }))
);
const HistoryView = React.lazy(() =>
  import('../components/views/HistoryView').then((m) => ({ default: m.HistoryView }))
);
const NoPermissionView = React.lazy(() =>
  import('../components/views/NoPermissionView').then((m) => ({ default: m.NoPermissionView }))
);
const PrivacyPolicyPage = React.lazy(() =>
  import('../components/PrivacyPolicyPage').then((m) => ({ default: m.PrivacyPolicyPage }))
);
const TermsOfServicePage = React.lazy(() =>
  import('../components/TermsOfServicePage').then((m) => ({ default: m.TermsOfServicePage }))
);
const SupportDevelopmentPage = React.lazy(() =>
  import('../components/SupportDevelopmentPage').then((m) => ({ default: m.SupportDevelopmentPage }))
);
const AboutPage = React.lazy(() =>
  import('../components/AboutPage').then((m) => ({ default: m.AboutPage }))
);
const PrintView = React.lazy(() =>
  import('../components/views/result/PrintView').then((m) => ({ default: m.PrintView }))
);
const ProfileView = React.lazy(() =>
  import('../components/views/ProfileView').then((m) => ({ default: m.ProfileView }))
);
const UpgradeView = React.lazy(() =>
  import('../components/views/UpgradeView').then((m) => ({ default: m.UpgradeView }))
);
const RecruiterView = React.lazy(() =>
  import('../components/views/RecruiterView').then((m) => ({ default: m.RecruiterView }))
);
const PaymentSuccessView = React.lazy(() =>
  import('../components/views/PaymentSuccessView').then((m) => ({ default: m.PaymentSuccessView }))
);
const PaymentCancelView = React.lazy(() =>
  import('../components/views/PaymentCancelView').then((m) => ({ default: m.PaymentCancelView }))
);

export function AppContent() {
  const { user, userProfile, error, setError, isAuthInitialized, isRedirectChecked } = useAuth();
  const {
    activeTab,
    setActiveTab,
    reportLanguage,
    t,
    isSavedJDsModalOpen,
    setIsSavedJDsModalOpen,
    isSaveJDNameModalOpen,
    setIsSaveJDNameModalOpen,
    isSavedCVsModalOpen,
    setIsSavedCVsModalOpen,
  } = useUI();
  const {
    jd,
    setJd,
    selectedResult,
    setSelectedResult,
    savedJDs,
    handleDeleteSavedJD,
    confirmSaveJD,
    isSavingJD,
    isLoadingSavedJDs,
    savedCVs,
    handleDeleteSavedCV,
    loadCVFromSaved,
    isLoadingSavedCVs,
    files,
    setFiles,
  } = useAnalysis();

  const [savedJDSearchTerm, setSavedJDSearchTerm] = useState('');
  const [jdSaveTitle, setJdSaveTitle] = useState('');
  const [savedCVSearchTerm, setSavedCVSearchTerm] = useState('');
  const [isLoadingCV, setIsLoadingCV] = useState(false);

  useEffect(() => {
    const isPolicyPage =
      activeTab === 'privacy' || activeTab === 'terms' || activeTab === 'support';
    const pageTitle = isPolicyPage
      ? `${activeTab === 'privacy' ? t.privacyPolicyPageTitle : activeTab === 'terms' ? t.termsPageTitle : t.supportPageTitle} | cvFit`
      : t.seoTitle || 'cvFit';

    document.title = pageTitle;

    const updateMeta = (selector: string, content: string) => {
      const el = document.querySelector(selector);
      if (el) el.setAttribute('content', content);
    };

    const description = t.seoDescription || '';
    const keywords = t.seoKeywords || '';

    updateMeta('meta[name="description"]', description);
    updateMeta('meta[name="keywords"]', keywords);
    updateMeta('meta[property="og:title"]', pageTitle);
    updateMeta('meta[property="og:description"]', description);
    updateMeta('meta[name="twitter:title"]', pageTitle);
    updateMeta('meta[name="twitter:description"]', description);

    // Update canonical URL per route
    const langPrefix = reportLanguage === 'en' ? '/en' : '/vi';
    const routePath =
      activeTab === 'privacy' ? '/privacy' :
      activeTab === 'terms' ? '/terms' :
      activeTab === 'support' ? '/support' :
      activeTab === 'upgrade' ? '/upgrade' :
      activeTab === 'about' ? '/about' :
      '';
    const canonicalUrl = `https://cvfit.pro${langPrefix}${routePath}`;
    const canonicalEl = document.querySelector('link[rel="canonical"]');
    if (canonicalEl) canonicalEl.setAttribute('href', canonicalUrl);

    // Update hreflang links for SPA navigation
    const hreflangLinks = document.querySelectorAll('link[rel="alternate"][hreflang]');
    for (let i = 0; i < hreflangLinks.length; i++) {
      const hl = hreflangLinks[i].getAttribute('hreflang');
      if (hl === 'vi') hreflangLinks[i].setAttribute('href', `https://cvfit.pro/vi${routePath}`);
      else if (hl === 'en') hreflangLinks[i].setAttribute('href', `https://cvfit.pro/en${routePath}`);
      else if (hl === 'x-default') hreflangLinks[i].setAttribute('href', `https://cvfit.pro/vi${routePath}`);
    }

    document.documentElement.lang = reportLanguage;

    // Update schema description (schema is already seeded by pre-hydration script; keep in sync)
    const schemaScript = document.querySelector('script[type="application/ld+json"]');
    if (schemaScript) {
      try {
        const schema = JSON.parse(schemaScript.textContent || '{}');
        if (schema['@graph'] && schema['@graph'][0]) {
          schema['@graph'][0].description = description;
          schema['@graph'][0].offers.priceCurrency = reportLanguage === 'vi' ? 'VND' : 'USD';
        }
        schemaScript.textContent = JSON.stringify(schema, null, 2);
      } catch {
        // ignore parse errors
      }
    }
  }, [reportLanguage, t, activeTab]);

  const adminEmail = (import.meta.env.VITE_ADMIN_EMAIL || '').toLowerCase();
  const isAdmin = user?.email?.toLowerCase() === adminEmail;

  const handleLoadSavedJD = (content: string) => {
    setJd(content);
    setIsSavedJDsModalOpen(false);
  };

  const onConfirmSaveJD = async () => {
    if (!jdSaveTitle.trim()) return;
    await confirmSaveJD(jdSaveTitle, jd);
    setIsSaveJDNameModalOpen(false);
    setJdSaveTitle('');
  };

  const handleLoadSavedCV = async (cv: { cvId: string; fileName: string; filePath: string; fileType: string }) => {
    setIsLoadingCV(true);
    try {
      const file = await loadCVFromSaved(cv as any);
      if (file) {
        setFiles(prev => [...prev, file]);
        setIsSavedCVsModalOpen(false);
      }
    } finally {
      setIsLoadingCV(false);
    }
  };

  const handleDeleteCV = async (cvId: string, filePath: string) => {
    await handleDeleteSavedCV(cvId, filePath);
  };

  if (!isAuthInitialized || !isRedirectChecked) {
    return (
      <div className="min-h-screen bg-surface-secondary flex flex-col items-center justify-center p-4">
        <div className="w-16 h-16 bg-surface rounded-3xl shadow-xl flex items-center justify-center mb-6 animate-bounce">
          <FileSearch className="w-8 h-8 text-accent" />
        </div>
        <div className="flex items-center gap-3 bg-surface px-6 py-3 rounded-2xl shadow-sm border border-border">
          <Loader2 className="w-5 h-5 text-accent animate-spin" />
          <span className="text-sm font-bold text-text-muted tracking-tight">{t.appInitializing}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'min-h-screen transition-colors duration-500',
        selectedResult ? 'bg-surface' : 'bg-surface-secondary'
      )}
    >
      <div className="print:hidden">
        <InAppBrowserWarning />
        <Header />

        <main
          className={cn(
            'mx-auto transition-all duration-500 mb-20 lg:mb-0',
            !user ? 'w-full' : 'max-w-7xl px-3 sm:px-6 lg:px-8 py-6 lg:py-8'
          )}
        >
          <React.Suspense
            fallback={
              <div className="flex min-h-[60vh] w-full flex-col items-center justify-center">
                <div className="relative h-16 w-16">
                  <div className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
                  <div className="flex h-full w-full items-center justify-center rounded-2xl bg-white shadow-xl">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                </div>
                <p className="mt-4 text-sm font-bold text-text-light animate-pulse uppercase tracking-[0.2em]">
                  {t.appLoadingContent}
                </p>
              </div>
            }
          >
            {activeTab === 'privacy' ? (
              <PrivacyPolicyPage onBack={() => setActiveTab('analyze')} />
            ) : activeTab === 'terms' ? (
              <TermsOfServicePage onBack={() => setActiveTab('analyze')} />
            ) : activeTab === 'support' ? (
              <SupportDevelopmentPage onBack={() => setActiveTab('analyze')} language={reportLanguage} />
            ) : activeTab === 'about' ? (
              <AboutPage onBack={() => setActiveTab('analyze')} />
            ) : activeTab === 'upgrade' && user ? (
              <UpgradeView />
            ) : activeTab === 'upgrade' && !user ? (
              <LandingView />
            ) : activeTab === 'payment-success' ? (
              <PaymentSuccessView />
            ) : activeTab === 'payment-cancel' ? (
              <PaymentCancelView />
            ) : !user ? (
              <LandingView />
            ) : user &&
              userProfile?.hasPermission === false &&
              userProfile?.role !== 'admin' &&
              user.email?.toLowerCase() !== adminEmail ? (
              <NoPermissionView />
            ) : activeTab === 'admin' && isAdmin ? (
              <AdminView />
            ) : activeTab === 'analyze' ? (
              <DashboardView />
            ) : activeTab === 'history' ? (
              <HistoryView />
            ) : activeTab === 'profile' ? (
              <ProfileView />
            ) : activeTab === 'recruiter' ? (
              <RecruiterView />
            ) : null}
          </React.Suspense>
        </main>

        <Footer />

        {user && (
          <MobileBottomNav
            activeTab={activeTab}
            selectedResult={selectedResult}
            setActiveTab={setActiveTab}
            setSelectedResult={setSelectedResult}
            onOpenSavedJds={() => setIsSavedJDsModalOpen(true)}
            showAdmin={isAdmin || userProfile?.role === 'admin'}
            showRecruiter={userProfile ? isRecruiterPlan(userProfile.plan) : false}
            labels={{
              analyze: t.analyze || 'Phân tích',
              history: t.history || 'Lịch sử',
              mobileJdStore: t.mobileJdStore,
              admin: t.admin,
              recruiter: 'Tuyển dụng',
            }}
          />
        )}

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 50, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.9 }}
              className={cn(
                'fixed left-4 right-4 z-[200] max-w-md mx-auto sm:left-6 sm:right-auto sm:mx-0',
                user ? 'bottom-24 sm:bottom-6' : 'bottom-6'
              )}
            >
              <div className="bg-surface rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] border border-border overflow-hidden flex items-stretch ring-1 ring-black/5">
                <div className="w-1.5 bg-error shrink-0" />
                <div className="flex-1 p-4 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-error-light flex items-center justify-center shrink-0 mt-0.5">
                    <AlertCircle className="w-5 h-5 text-error" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-xs font-black text-text-light uppercase tracking-widest mb-1">
                      {t.appErrorNotice}
                    </h4>
                    <div className="text-sm font-bold text-text-main leading-relaxed pr-8">
                      {typeof error === 'string' ? error : t.appUnknownError}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setError(null)}
                    className="absolute top-3 right-3 w-8 h-8 rounded-full hover:bg-surface-secondary flex items-center justify-center transition-colors text-text-light hover:text-text-muted cursor-pointer hover:scale-105 active:scale-95"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <SavedJdsListModal
          isOpen={isSavedJDsModalOpen}
          onClose={() => setIsSavedJDsModalOpen(false)}
          savedJDs={savedJDs}
          isLoading={isLoadingSavedJDs}
          searchTerm={savedJDSearchTerm}
          onSearchTermChange={setSavedJDSearchTerm}
          reportLanguage={reportLanguage}
          onLoadJd={handleLoadSavedJD}
          onDeleteJd={handleDeleteSavedJD}
          t={{
            jdStoreModalTitle: t.jdStoreModalTitle,
            jdStoreModalSubtitle: t.jdStoreModalSubtitle,
            jdStoreSearchPlaceholder: t.jdStoreSearchPlaceholder,
            jdStoreLoading: t.jdStoreLoading,
            jdStoreEmptyTitle: t.jdStoreEmptyTitle,
            jdStoreEmptyDesc: t.jdStoreEmptyDesc,
            jdStoreNoMatch: t.jdStoreNoMatch,
            jdStoreDeleteTitle: t.jdStoreDeleteTitle,
          }}
        />

        <SaveJdNameModal
          isOpen={isSaveJDNameModalOpen}
          onClose={() => setIsSaveJDNameModalOpen(false)}
          jdSaveTitle={jdSaveTitle}
          onJdSaveTitleChange={setJdSaveTitle}
          onConfirm={onConfirmSaveJD}
          isSavingJD={isSavingJD}
          t={{
            saveJdModalTitle: t.saveJdModalTitle,
            saveJdNameLabel: t.saveJdNameLabel,
            saveJdNamePlaceholder: t.saveJdNamePlaceholder,
            saveJdHint: t.saveJdHint,
            saveJdSaving: t.saveJdSaving,
            saveJdConfirm: t.saveJdConfirm,
          }}
        />

        <SavedCvsListModal
          isOpen={isSavedCVsModalOpen}
          onClose={() => setIsSavedCVsModalOpen(false)}
          savedCVs={savedCVs}
          isLoading={isLoadingSavedCVs}
          searchTerm={savedCVSearchTerm}
          onSearchTermChange={setSavedCVSearchTerm}
          reportLanguage={reportLanguage}
          onLoadCV={handleLoadSavedCV}
          onDeleteCV={handleDeleteCV}
          isLoadingCV={isLoadingCV}
          t={{
            cvStoreModalTitle: t.cvStoreModalTitle,
            cvStoreModalSubtitle: t.cvStoreModalSubtitle,
            cvStoreSearchPlaceholder: t.cvStoreSearchPlaceholder,
            cvStoreLoading: t.cvStoreLoading,
            cvStoreEmptyTitle: t.cvStoreEmptyTitle,
            cvStoreEmptyDesc: t.cvStoreEmptyDesc,
            cvStoreNoMatch: t.cvStoreNoMatch,
            cvStoreDeleteTitle: t.cvStoreDeleteTitle,
            cvStoreClose: t.cvStoreClose,
            cvStoreLoad: t.cvStoreLoad,
          }}
        />

        <CookieConsentBanner
          onOpenPrivacy={() => {
            setActiveTab('privacy');
            window.scrollTo(0, 0);
          }}
        />
      </div>

      {selectedResult && (
        <React.Suspense fallback={null}>
          <PrintView selectedResult={selectedResult} />
        </React.Suspense>
      )}
    </div>
  );
}
