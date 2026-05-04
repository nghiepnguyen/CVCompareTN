import React from 'react';
import { FileSearch, Heart } from 'lucide-react';
import { useUI } from '../../context/UIContext';

export function Footer() {
  const { setActiveTab, t } = useUI();

  return (
    <footer className="bg-white border-t border-slate-200 py-12 mt-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <FileSearch className="text-indigo-600 w-6 h-6" />
              <span className="text-lg font-bold tracking-tight text-slate-800">thanhnghiep<span className="text-indigo-600">.top</span></span>
            </div>
            <p className="text-sm text-slate-500 leading-relaxed">
              {t.footerDesc}
            </p>
          </div>
          <div>
            <h4 className="font-bold text-slate-800 mb-4">Từ khóa phổ biến</h4>
            <ul className="text-sm text-slate-500 space-y-2">
              <li>Công cụ so sánh CV</li>
              <li>ATS resume checker</li>
              <li>CV và job description</li>
              <li>Cải thiện CV cho hệ thống ATS</li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold text-slate-800 mb-4">Liên hệ</h4>
            <p className="text-sm text-slate-500">
              Email: <a href={`mailto:${import.meta.env.VITE_FEEDBACK_RECIPIENT_EMAIL || 'admin@example.com'}`} className="hover:text-indigo-600 transition-colors">{import.meta.env.VITE_FEEDBACK_RECIPIENT_EMAIL || 'admin@example.com'}</a><br />
              Website: thanhnghiep.top<br />
              <button 
                onClick={() => { 
                  setActiveTab('support'); 
                  window.scrollTo(0, 0); 
                }}
                className="text-indigo-600 hover:text-indigo-700 font-bold transition-all duration-200 flex items-center gap-2 mt-2 w-fit cursor-pointer hover:scale-105 active:scale-95 group"
              >
                <Heart 
                  className="w-4 h-4 fill-indigo-600 transition-transform duration-200 group-hover:scale-125 group-hover:rotate-12" 
                />
                <span className="group-hover:underline">Hỗ trợ phát triển</span>
              </button>
            </p>
          </div>
        </div>
        <div className="border-t border-slate-100 mt-8 pt-8 text-center text-xs text-slate-400">
          <div className="flex justify-center gap-4 mb-2">
            <button onClick={() => { setActiveTab('privacy'); window.scrollTo(0,0); }} className="hover:text-indigo-600 transition-colors cursor-pointer">Chính sách bảo mật</button>
            <button onClick={() => { setActiveTab('terms'); window.scrollTo(0,0); }} className="hover:text-indigo-600 transition-colors cursor-pointer">Điều khoản dịch vụ</button>
          </div>
          © {new Date().getFullYear()} thanhnghiep.top. Tất cả quyền được bảo lưu.
        </div>
      </div>
    </footer>
  );
}
