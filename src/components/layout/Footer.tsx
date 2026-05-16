import React from 'react';
import { FileSearch, Heart } from 'lucide-react';
import { useUI } from '../../context/UIContext';
import { cn } from '../../lib/utils';

export function Footer() {
  const { setActiveTab, t } = useUI();

  return (
    <footer className="relative z-10 border-t border-border bg-surface pt-12 pb-24 lg:py-20">
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-4 md:grid-cols-2">
          <div className="lg:col-span-2">
            <div className="flex items-center gap-3 mb-6 group cursor-pointer" onClick={() => { setActiveTab('analyze'); window.scrollTo(0, 0); }}>
              <div className="relative w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-xl">
                <div className="absolute inset-0 bg-accent opacity-20 blur-lg rounded-full" />
                <FileSearch className="text-white w-5 h-5 relative z-10" />
              </div>
              <span className="text-xl font-extrabold tracking-tighter text-text-main font-sans">
                cv matcher<span className="text-accent italic">.ai</span>
              </span>
            </div>
            <p className="text-sm text-text-muted leading-relaxed max-w-sm">
              {t.footerDesc}
            </p>
          </div>
          
          <div>
            <h4 className="font-sans text-xs font-black uppercase tracking-[0.2em] text-text-light mb-6">Từ khóa phổ biến</h4>
            <ul className="text-sm font-medium text-text-muted space-y-3">
              <li className="hover:text-accent transition-colors cursor-default">Công cụ so sánh CV</li>
              <li className="hover:text-accent transition-colors cursor-default">ATS resume checker</li>
              <li className="hover:text-accent transition-colors cursor-default">CV và job description</li>
              <li className="hover:text-accent transition-colors cursor-default">Cải thiện CV cho hệ thống ATS</li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-sans text-xs font-black uppercase tracking-[0.2em] text-text-light mb-6">Liên hệ & Hỗ trợ</h4>
            <div className="space-y-4">
              <p className="text-sm font-medium text-text-muted">
                Email: <a href={`mailto:${import.meta.env.VITE_FEEDBACK_RECIPIENT_EMAIL || 'admin@example.com'}`} className="text-text-main hover:text-accent transition-colors">{import.meta.env.VITE_FEEDBACK_RECIPIENT_EMAIL || 'admin@example.com'}</a>
              </p>
              <button 
                onClick={() => { 
                  setActiveTab('support'); 
                  window.scrollTo(0, 0); 
                }}
                className="group flex items-center gap-3 rounded-2xl bg-surface-secondary px-5 py-3 text-sm font-bold text-text-main transition-all hover:bg-accent-light hover:text-accent active:scale-95 cursor-pointer"
              >
                <Heart className="h-4 w-4 fill-accent/10 text-accent transition-transform group-hover:scale-125" />
                <span>Hỗ trợ phát triển</span>
              </button>
            </div>
          </div>
        </div>
        
        <div className="mt-10 lg:mt-20 flex flex-col items-center justify-between gap-6 border-t border-border pt-10 md:flex-row">
          <div className="flex gap-8 text-xs font-bold text-text-light">
            <button onClick={() => { setActiveTab('privacy'); window.scrollTo(0,0); }} className="hover:text-accent transition-colors cursor-pointer">Chính sách bảo mật</button>
            <button onClick={() => { setActiveTab('terms'); window.scrollTo(0,0); }} className="hover:text-accent transition-colors cursor-pointer">Điều khoản dịch vụ</button>
          </div>
          <p className="text-xs font-bold text-text-light">
            © {new Date().getFullYear()} CV Matcher & Optimizer. Tất cả quyền được bảo lưu.
          </p>
        </div>
      </div>
    </footer>
  );
}
