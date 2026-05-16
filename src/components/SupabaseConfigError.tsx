import { AlertCircle } from 'lucide-react';

export function SupabaseConfigError() {
  return (
    <div className="min-h-screen bg-surface-secondary flex flex-col items-center justify-center p-6">
      <div className="max-w-lg w-full border-2 border-border-main bg-surface-primary p-8">
        <div className="w-14 h-14 border-2 border-error flex items-center justify-center mb-6">
          <AlertCircle className="w-7 h-7 text-error" />
        </div>
        <h1 className="text-xl font-black text-text-main mb-3 uppercase tracking-tight">
          Thiếu cấu hình Supabase
        </h1>
        <p className="text-sm text-text-muted leading-relaxed mb-4">
          Thêm <code className="text-text-main">VITE_SUPABASE_URL</code> và{' '}
          <code className="text-text-main">VITE_SUPABASE_ANON_KEY</code> trên Vercel (project{' '}
          <strong className="text-text-main">cvcompare</strong>) → Environment Variables → Redeploy.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-6 w-full py-3 bg-accent text-white font-bold uppercase tracking-widest text-xs hover:bg-accent-hover transition-colors cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
        >
          Thử lại
        </button>
      </div>
    </div>
  );
}