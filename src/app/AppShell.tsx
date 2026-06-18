import React from 'react';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { GoogleReCaptchaProvider } from 'react-google-recaptcha-v3';
import { AuthProvider } from '../context/AuthContext';
import { UIProvider } from '../context/UIContext';
import { AnalysisProvider } from '../context/AnalysisContext';
import { RecruiterProvider } from '../context/recruiter';
import { AnalyticsBootstrap } from '../components/layout/AnalyticsBootstrap';
import { AppErrorBoundary } from './AppErrorBoundary';
import { AppContent } from './AppContent';

const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY as string;

export default function AppShell() {
  return (
    <AppErrorBoundary>
      <GoogleReCaptchaProvider reCaptchaKey={RECAPTCHA_SITE_KEY}>
        <AuthProvider>
          <UIProvider>
            <AnalysisProvider>
              <RecruiterProvider>
                <AppContent />
                <AnalyticsBootstrap />
                <Analytics />
                <SpeedInsights />
              </RecruiterProvider>
            </AnalysisProvider>
          </UIProvider>
        </AuthProvider>
      </GoogleReCaptchaProvider>
    </AppErrorBoundary>
  );
}
