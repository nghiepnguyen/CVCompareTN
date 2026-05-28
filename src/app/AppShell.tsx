import React from 'react';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { AuthProvider } from '../context/AuthContext';
import { UIProvider } from '../context/UIContext';
import { AnalysisProvider } from '../context/AnalysisContext';
import { AnalyticsBootstrap } from '../components/layout/AnalyticsBootstrap';
import { AppErrorBoundary } from './AppErrorBoundary';
import { AppContent } from './AppContent';

export default function AppShell() {
  return (
    <AppErrorBoundary>
      <AuthProvider>
        <UIProvider>
          <AnalysisProvider>
            <AppContent />
            <AnalyticsBootstrap />
            <Analytics />
            <SpeedInsights />
          </AnalysisProvider>
        </UIProvider>
      </AuthProvider>
    </AppErrorBoundary>
  );
}
