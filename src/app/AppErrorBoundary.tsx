import React from 'react';
import { AlertCircle } from 'lucide-react';
import * as Sentry from '@sentry/react';

export class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error', error, errorInfo);
    Sentry.captureException(error, {
      contexts: { react: { componentStack: errorInfo.componentStack } },
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-surface-secondary flex flex-col items-center justify-center p-4">
          <div className="w-20 h-20 bg-error-light rounded-3xl flex items-center justify-center mb-6">
            <AlertCircle className="w-10 h-10 text-error" />
          </div>
          <h2 className="text-2xl font-black text-text-main mb-2">Rất tiếc!</h2>
          <p className="text-text-muted text-center max-w-md mb-8">
            Đã có lỗi xảy ra khi khởi tạo ứng dụng. Vui lòng làm mới trang hoặc thử lại sau.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-8 py-3 bg-accent text-white font-bold rounded-2xl shadow-lg shadow-accent-light hover:bg-accent-hover transition-all cursor-pointer hover:scale-105 active:scale-95"
          >
            Làm mới trang
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
