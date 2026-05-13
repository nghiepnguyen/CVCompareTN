import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeSanitize from 'rehype-sanitize';
import rehypeRaw from 'rehype-raw';
import { 
  AlertCircle, 
  Loader2, 
  FileSearch,
  Check,
  X,
  Clock,
  Search,
  Bookmark,
  BookmarkPlus,
  Trash2,
  ArrowRight
} from 'lucide-react';

const LandingView = React.lazy(() => import('./components/views/LandingView').then(m => ({ default: m.LandingView })));
const DashboardView = React.lazy(() => import('./components/views/DashboardView').then(m => ({ default: m.DashboardView })));
const AdminView = React.lazy(() => import('./components/views/AdminView').then(m => ({ default: m.AdminView })));
const HistoryView = React.lazy(() => import('./components/views/HistoryView').then(m => ({ default: m.HistoryView })));
const NoPermissionView = React.lazy(() => import('./components/views/NoPermissionView').then(m => ({ default: m.NoPermissionView })));
import { AuthProvider, useAuth } from './context/AuthContext';
import { UIProvider, useUI } from './context/UIContext';
import { AnalysisProvider, useAnalysis } from './context/AnalysisContext';
import { Header } from './components/layout/Header';
import { Footer } from './components/layout/Footer';
import { InAppBrowserWarning } from './components/layout/InAppBrowserWarning';
const PrivacyPolicyPage = React.lazy(() => import('./components/PrivacyPolicyPage').then(m => ({ default: m.PrivacyPolicyPage })));
const TermsOfServicePage = React.lazy(() => import('./components/TermsOfServicePage').then(m => ({ default: m.TermsOfServicePage })));
const SupportDevelopmentPage = React.lazy(() => import('./components/SupportDevelopmentPage').then(m => ({ default: m.SupportDevelopmentPage })));
import { cn } from './lib/utils';

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
          <div className="w-20 h-20 bg-rose-50 rounded-3xl flex items-center justify-center mb-6">
            <AlertCircle className="w-10 h-10 text-rose-500" />
          </div>
          <h2 className="text-2xl font-black text-slate-800 mb-2">Rất tiếc!</h2>
          <p className="text-slate-500 text-center max-w-md mb-8">
            Đã có lỗi xảy ra khi khởi tạo ứng dụng. Vui lòng làm mới trang hoặc thử lại sau.
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="px-8 py-3 bg-indigo-600 text-white font-bold rounded-2xl shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all"
          >
            Làm mới trang
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <UIProvider>
          <AnalysisProvider>
            <AppContent />
          </AnalysisProvider>
        </UIProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

function AppContent() {
  const { user, userProfile, error, setError, isAuthInitialized, isRedirectChecked } = useAuth();
  const { 
    activeTab, setActiveTab, reportLanguage, t,
    isSavedJDsModalOpen, setIsSavedJDsModalOpen,
    isSaveJDNameModalOpen, setIsSaveJDNameModalOpen
  } = useUI();
  const { 
    setJd, selectedResult,
    savedJDs, handleDeleteSavedJD, confirmSaveJD, isSavingJD
  } = useAnalysis();

  const [savedJDSearchTerm, setSavedJDSearchTerm] = useState('');
  const [jdSaveTitle, setJdSaveTitle] = useState('');

  // SEO Dynamic Updates
  React.useEffect(() => {
    const isPolicyPage = activeTab === 'privacy' || activeTab === 'terms' || activeTab === 'support';
    const pageTitle = isPolicyPage 
      ? `${activeTab === 'privacy' ? (reportLanguage === 'vi' ? 'Chính sách bảo mật' : 'Privacy Policy') : 
         activeTab === 'terms' ? (reportLanguage === 'vi' ? 'Điều khoản dịch vụ' : 'Terms of Service') : 
         (reportLanguage === 'vi' ? 'Hỗ trợ phát triển' : 'Support Development')} | CV Matcher`
      : (t.seoTitle || "CV Matcher & Optimizer");

    // Update Document Title
    document.title = pageTitle;
    
    // Helper to update meta tag
    const updateMeta = (selector: string, content: string) => {
      const el = document.querySelector(selector);
      if (el) el.setAttribute('content', content);
    };

    const description = t.seoDescription || "";
    const keywords = t.seoKeywords || "";

    // Basic SEO
    updateMeta('meta[name="description"]', description);
    updateMeta('meta[name="keywords"]', keywords);
    
    // Open Graph
    updateMeta('meta[property="og:title"]', pageTitle);
    updateMeta('meta[property="og:description"]', description);
    
    // Twitter
    updateMeta('meta[name="twitter:title"]', pageTitle);
    updateMeta('meta[name="twitter:description"]', description);
    
    // Update HTML Lang attribute
    document.documentElement.lang = reportLanguage;

    // Dynamic JSON-LD Schema
    const existingSchema = document.getElementById('dynamic-schema');
    if (existingSchema) existingSchema.remove();

    const schemaData = {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "SoftwareApplication",
          "name": "CV Matcher & Optimizer",
          "description": description,
          "applicationCategory": "BusinessApplication",
          "operatingSystem": "Web",
          "url": "https://cv.thanhnghiep.top",
          "offers": {
            "@type": "Offer",
            "price": "0",
            "priceCurrency": reportLanguage === 'vi' ? 'VND' : 'USD'
          }
        },
        {
          "@type": "Organization",
          "name": "thanhnghiep.top",
          "url": "https://thanhnghiep.top",
          "logo": "https://thanhnghiep.top/wp-content/uploads/2021/10/cropped-logo-fav-192x192.png"
        }
      ]
    };

    const script = document.createElement('script');
    script.id = 'dynamic-schema';
    script.type = 'application/ld+json';
    script.text = JSON.stringify(schemaData);
    document.head.appendChild(script);
  }, [reportLanguage, t, activeTab]); 

  const isAdmin = user?.email?.toLowerCase() === (import.meta.env.VITE_ADMIN_EMAIL || '').toLowerCase();

  const handleLoadSavedJD = (content: string) => {
    setJd(content);
    setIsSavedJDsModalOpen(false);
  };

  const onConfirmSaveJD = async () => {
    if (!jdSaveTitle.trim()) return;
    await confirmSaveJD(jdSaveTitle);
    setIsSaveJDNameModalOpen(false);
    setJdSaveTitle('');
  };

  if (!isAuthInitialized || !isRedirectChecked) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="w-16 h-16 bg-white rounded-3xl shadow-xl flex items-center justify-center mb-6 animate-bounce">
          <FileSearch className="w-8 h-8 text-indigo-600" />
        </div>
        <div className="flex items-center gap-3 bg-white px-6 py-3 rounded-2xl shadow-sm border border-slate-100">
          <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />
          <span className="text-sm font-bold text-slate-600 tracking-tight">Đang khởi tạo hệ thống...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("min-h-screen transition-colors duration-500", selectedResult ? "bg-white" : "bg-slate-50")}>
      <div className="print:hidden">
        <InAppBrowserWarning />
        <Header />

        <main className={cn(
          "mx-auto transition-all duration-500",
          !user ? "w-full" : "max-w-7xl px-4 sm:px-6 lg:px-8 py-8"
        )}>
          <React.Suspense fallback={
            <div className="flex min-h-[60vh] w-full flex-col items-center justify-center">
              <div className="relative h-16 w-16">
                <div className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
                <div className="flex h-full w-full items-center justify-center rounded-2xl bg-white shadow-xl">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              </div>
              <p className="mt-4 text-sm font-bold text-slate-400 animate-pulse uppercase tracking-[0.2em]">
                {reportLanguage === 'vi' ? 'Đang tải nội dung...' : 'Loading Content...'}
              </p>
            </div>
          }>
            {activeTab === 'privacy' ? (
              <PrivacyPolicyPage onBack={() => setActiveTab('analyze')} />
            ) : activeTab === 'terms' ? (
              <TermsOfServicePage onBack={() => setActiveTab('analyze')} />
            ) : activeTab === 'support' ? (
              <SupportDevelopmentPage 
                onBack={() => setActiveTab('analyze')} 
                language={reportLanguage}
              />
            ) : !user ? (
              <LandingView />
            ) : user && userProfile?.hasPermission === false && userProfile?.role !== 'admin' && user.email?.toLowerCase() !== (import.meta.env.VITE_ADMIN_EMAIL || "").toLowerCase() ? (
              <NoPermissionView />
            ) : activeTab === 'admin' && isAdmin ? (
              <AdminView />
            ) : activeTab === 'analyze' ? (
              <DashboardView />
            ) : activeTab === 'history' ? (
              <HistoryView />
            ) : null}
          </React.Suspense>
        </main>

        <Footer />

        {/* Error Toast UI */}
        <AnimatePresence>
          {error && (
            <motion.div 
              initial={{ opacity: 0, x: -20, y: 0, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: -20, scale: 0.9 }}
              className="fixed bottom-6 left-6 z-[200] max-w-[calc(100vw-3rem)] sm:max-w-md w-full sm:w-auto"
            >
              <div className="bg-white rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] border border-slate-200 overflow-hidden flex items-stretch ring-1 ring-black/5">
                <div className="w-1.5 bg-rose-500 shrink-0" />
                <div className="flex-1 p-4 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-rose-50 flex items-center justify-center shrink-0 mt-0.5">
                    <AlertCircle className="w-5 h-5 text-rose-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">
                      {reportLanguage === 'vi' ? 'Thông báo lỗi' : 'Error Message'}
                    </h4>
                    <div className="text-sm font-bold text-slate-700 leading-relaxed pr-8">
                      {typeof error === 'string' ? error : 'Đã xảy ra lỗi không xác định'}
                    </div>
                  </div>
                  <button 
                    onClick={() => setError(null)}
                    className="absolute top-3 right-3 w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center transition-colors text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Saved JDs Modal */}
        <AnimatePresence>
          {isSavedJDsModalOpen && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
              >
                <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-indigo-600 text-white">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center">
                      <Bookmark className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold">Kho JD đã lưu</h2>
                      <p className="text-xs text-indigo-100">Chọn một JD để sử dụng ngay</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setIsSavedJDsModalOpen(false)}
                    className="w-10 h-10 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                      type="text"
                      placeholder="Tìm kiếm JD theo tên..."
                      value={savedJDSearchTerm}
                      onChange={(e) => setSavedJDSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    />
                  </div>
                </div>
                
                <div className="flex-1 overflow-y-auto p-6">
                  {savedJDs.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <BookmarkPlus className="w-8 h-8 text-slate-300" />
                      </div>
                      <h3 className="text-slate-600 font-bold">Chưa có JD nào được lưu</h3>
                      <p className="text-sm text-slate-400 mt-1">Hãy lưu các JD bạn thường xuyên sử dụng để tiết kiệm thời gian.</p>
                    </div>
                  ) : savedJDs.filter(jdItem => jdItem.title.toLowerCase().includes(savedJDSearchTerm.toLowerCase())).length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-slate-400 text-sm italic">Không tìm thấy JD nào khớp với từ khóa "{savedJDSearchTerm}"</p>
                    </div>
                  ) : (
                    <div className="grid gap-3">
                      {savedJDs
                        .filter(jdItem => jdItem.title.toLowerCase().includes(savedJDSearchTerm.toLowerCase()))
                        .map((savedJd) => (
                        <div 
                          key={savedJd.id}
                          className="group p-4 rounded-2xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all cursor-pointer flex items-start justify-between gap-4"
                          onClick={() => handleLoadSavedJD(savedJd.content)}
                        >
                          <div className="flex-1 min-w-0 overflow-hidden">
                            <h4 className="font-bold text-slate-800 break-words group-hover:text-indigo-600 transition-colors leading-tight">
                              {savedJd.title}
                            </h4>
                            <div className="flex items-center gap-2 mt-2">
                              <Clock className="w-3 h-3 text-slate-400" />
                              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                                {new Date(savedJd.timestamp).toLocaleDateString('vi-VN')}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 self-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteSavedJD(savedJd.id);
                              }}
                              className="w-8 h-8 rounded-full bg-white text-rose-500 shadow-sm border border-slate-100 flex items-center justify-center hover:bg-rose-50 transition-colors"
                              title="Xóa JD này"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                            <div className="w-8 h-8 rounded-full bg-indigo-600 text-white shadow-sm flex items-center justify-center">
                              <ArrowRight className="w-4 h-4" />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
                <div className="p-6 bg-slate-50 border-t border-slate-100">
                  <button 
                    onClick={() => setIsSavedJDsModalOpen(false)}
                    className="w-full py-3 rounded-2xl bg-white border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 transition-all shadow-sm"
                  >
                    Đóng
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Modal: Save JD Name */}
        <AnimatePresence>
          {isSaveJDNameModalOpen && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
              >
                <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-indigo-600 text-white">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center">
                      <BookmarkPlus className="w-5 h-5 text-white" />
                    </div>
                    <h2 className="text-xl font-bold">Lưu JD vào kho</h2>
                  </div>
                  <button 
                    onClick={() => setIsSaveJDNameModalOpen(false)}
                    className="w-10 h-10 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
                
                <div className="p-8">
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Tên gợi nhớ cho JD này</label>
                  <input 
                    type="text"
                    autoFocus
                    placeholder="Ví dụ: Frontend Developer - VNG"
                    value={jdSaveTitle}
                    onChange={(e) => setJdSaveTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && jdSaveTitle.trim() && !isSavingJD) {
                        onConfirmSaveJD();
                      }
                    }}
                    className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-700 font-bold focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all mb-2"
                  />
                  <p className="text-[10px] text-slate-400 font-medium italic">JD sẽ được lưu vào kho để bạn có thể sử dụng lại bất cứ lúc nào.</p>
                </div>
                
                <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
                  <button 
                    onClick={() => setIsSaveJDNameModalOpen(false)}
                    className="flex-1 py-3.5 rounded-2xl bg-white border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 transition-all"
                  >
                    Hủy bỏ
                  </button>
                  <button 
                    onClick={onConfirmSaveJD}
                    disabled={!jdSaveTitle.trim() || isSavingJD}
                    className="flex-1 py-3.5 rounded-2xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isSavingJD ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Đang lưu...
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        Xác nhận lưu
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* 🚀 DEDICATED PRINT VIEW - Isolated from Dashboard UI */}
      {selectedResult && (
        <div id="cv-print-root" className="min-h-screen bg-white">
          <div className="max-w-[210mm] mx-auto bg-white p-[20mm]">
            <div className="markdown-body">
              <Markdown 
                key={`print-${selectedResult.id}`}
                remarkPlugins={[remarkGfm, remarkBreaks]}
                rehypePlugins={[rehypeRaw, rehypeSanitize]}
                components={{
                  h1: ({node, ...props}) => <h1 className="text-3xl font-bold mb-8 text-center border-b-2 border-slate-100 pb-6" {...props} />,
                  h2: ({node, ...props}) => <h2 className="text-lg font-bold mt-10 mb-4 pb-1 border-b border-indigo-100 text-indigo-700" {...props} />,
                  p: ({node, ...props}) => <p className="mb-4 text-slate-800 leading-relaxed" {...props} />,
                  ul: ({node, ...props}) => <ul className="list-disc pl-6 mb-6 space-y-2" {...props} />,
                  li: ({node, ...props}) => <li className="text-slate-700" {...props} />,
                  strong: ({node, ...props}) => <strong className="font-bold text-slate-900" {...props} />,
                }}
              >
                {selectedResult.fullRewrittenCV.replace(/^(#+)([^#\s])/gm, '$1 $2')}
              </Markdown>
            </div>
            
            {/* Professional Footer for Print */}
            <div className="mt-20 pt-8 border-t border-slate-200 text-center text-[10px] text-slate-400 italic">
              cv.thanhnghiep.top - Công cụ phân tích CV thông minh giúp bạn tối ưu hóa hồ sơ.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
