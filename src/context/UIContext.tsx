import React, { createContext, useCallback, useContext, useState, useEffect } from 'react';
import { UI_LABELS } from '../translations';

export type Tab =
  | 'analyze'
  | 'history'
  | 'admin'
  | 'profile'
  | 'privacy'
  | 'terms'
  | 'support'
  | 'upgrade'
  | 'payment-success'
  | 'payment-cancel'
  | 'about';

function tabFromPath(path: string, params: URLSearchParams): Tab {
  if (path.includes('/payment/success')) return 'payment-success';
  if (path.includes('/payment/cancel')) return 'payment-cancel';
  if (path.includes('/upgrade')) return 'upgrade';
  if (path.includes('/privacy') || path.includes('/policy')) return 'privacy';
  if (path.includes('/terms')) return 'terms';
    if (path.includes('/support')) return 'support';
    if (path.includes('/about')) return 'about';
  if (params.get('policy') === 'true' || params.get('privacy') === 'true') return 'privacy';
  if (params.get('terms') === 'true') return 'terms';
  if (params.get('support') === 'true') return 'support';
  return 'analyze';
}

interface UIContextType {
  activeTab: Tab;
  setActiveTab: React.Dispatch<React.SetStateAction<Tab>>;
  /** Opens upgrade page: updates tab, URL, and scrolls to top */
  navigateToUpgrade: () => void;
  reportLanguage: 'vi' | 'en';
  setReportLanguage: React.Dispatch<React.SetStateAction<'vi' | 'en'>>;
  isInAppBrowser: boolean;
  showInAppWarning: boolean;
  setShowInAppWarning: React.Dispatch<React.SetStateAction<boolean>>;
  isUserMenuOpen: boolean;
  setIsUserMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isSavedJDsModalOpen: boolean;
  setIsSavedJDsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isSaveJDNameModalOpen: boolean;
  setIsSaveJDNameModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isSavedCVsModalOpen: boolean;
  setIsSavedCVsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  t: typeof UI_LABELS['vi'];
}

const UIContext = createContext<UIContextType | undefined>(undefined);

export function UIProvider({ children }: { children: React.ReactNode }) {
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const path = window.location.pathname;
    const params = new URLSearchParams(window.location.search);
    return tabFromPath(path, params);
  });

  const [reportLanguage, setReportLanguage] = useState<'vi' | 'en'>(() => {
    const path = window.location.pathname;
    if (path.startsWith('/en')) return 'en';
    return 'vi';
  });

  const [isInAppBrowser, setIsInAppBrowser] = useState(false);
  const [showInAppWarning, setShowInAppWarning] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isSavedJDsModalOpen, setIsSavedJDsModalOpen] = useState(false);
  const [isSaveJDNameModalOpen, setIsSaveJDNameModalOpen] = useState(false);
  const [isSavedCVsModalOpen, setIsSavedCVsModalOpen] = useState(false);

  // Sync Language and Tab with Path
  useEffect(() => {
    const currentPathname = window.location.pathname;
    const langPrefix = reportLanguage === 'en' ? '/en' : '/vi';
    let subPath = '';
    
    if (activeTab === 'payment-success') {
      const orderCode = new URLSearchParams(window.location.search).get('orderCode');
      const qs = orderCode ? `?orderCode=${encodeURIComponent(orderCode)}` : '';
      const newPath = `/payment/success${qs}`;
      if (currentPathname !== newPath) {
        window.history.pushState(null, '', newPath + window.location.hash);
      }
      return;
    }
    if (activeTab === 'payment-cancel') {
      const newPath = '/payment/cancel';
      if (currentPathname !== newPath) {
        window.history.pushState(null, '', newPath + window.location.hash);
      }
      return;
    }

    if (activeTab === 'privacy') subPath = '/privacy';
    else if (activeTab === 'terms') subPath = '/terms';
    else if (activeTab === 'support') subPath = '/support';
    else if (activeTab === 'upgrade') subPath = '/upgrade';
    else if (activeTab === 'about') subPath = '/about';

    const newPathname = langPrefix + subPath;

    const url = new URL(window.location.href);
    const hadLegacyParams = url.searchParams.has('policy') || url.searchParams.has('privacy') || url.searchParams.has('terms') || url.searchParams.has('support');
    
    url.searchParams.delete('policy');
    url.searchParams.delete('privacy');
    url.searchParams.delete('terms');
    url.searchParams.delete('support');
    
    if (currentPathname !== newPathname || hadLegacyParams) {
      // Đảm bảo giữ lại hash fragment (chứa token của Supabase)
      window.history.pushState(null, '', newPathname + url.search + window.location.hash);
    }
  }, [reportLanguage, activeTab]);

  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      
      if (path.startsWith('/en')) {
        setReportLanguage('en');
      } else {
        setReportLanguage('vi');
      }

      const params = new URLSearchParams(window.location.search);
      setActiveTab(tabFromPath(path, params));
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    const ua = navigator.userAgent || navigator.vendor || (window as any).opera;
    const isInApp = /FBAN|FBAV|Instagram|Zalo|Messenger|Telegram|Line|Viber|Twitter|LinkedIn/i.test(ua);
    setIsInAppBrowser(isInApp);
    if (isInApp) {
      setShowInAppWarning(true);
    }
  }, []);

  const t = UI_LABELS[reportLanguage];

  const navigateToUpgrade = useCallback(() => {
    const langPrefix = reportLanguage === 'en' ? '/en' : '/vi';
    const newPathname = `${langPrefix}/upgrade`;
    const url = new URL(window.location.href);
    url.searchParams.delete('policy');
    url.searchParams.delete('privacy');
    url.searchParams.delete('terms');
    url.searchParams.delete('support');

    if (window.location.pathname !== newPathname) {
      window.history.pushState(null, '', newPathname + url.search + window.location.hash);
    }

    setActiveTab('upgrade');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [reportLanguage]);

  return (
    <UIContext.Provider value={{
      activeTab, setActiveTab, navigateToUpgrade, reportLanguage, setReportLanguage, 
      isInAppBrowser, showInAppWarning, setShowInAppWarning,
      isUserMenuOpen, setIsUserMenuOpen,
      isSavedJDsModalOpen, setIsSavedJDsModalOpen,
      isSaveJDNameModalOpen, setIsSaveJDNameModalOpen,
      isSavedCVsModalOpen, setIsSavedCVsModalOpen,
      t
    }}>
      {children}
    </UIContext.Provider>
  );
}

export const useUI = () => {
  const context = useContext(UIContext);
  if (context === undefined) {
    throw new Error('useUI must be used within a UIProvider');
  }
  return context;
};
