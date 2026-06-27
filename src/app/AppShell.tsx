import React from 'react';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { GoogleReCaptchaProvider } from 'react-google-recaptcha-v3';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { UIProvider } from '../context/UIContext';
import { AnalysisProvider } from '../context/AnalysisContext';
import { RecruiterProvider } from '../context/recruiter';
import { AnalyticsBootstrap } from '../components/layout/AnalyticsBootstrap';
import { AppErrorBoundary } from './AppErrorBoundary';
import { AppContent } from './AppContent';

const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY as string;

// Only inject the reCAPTCHA script for logged-in users — saves ~100KB for guests
function RecaptchaWrapper({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return <>{children}</>;
  return (
    <GoogleReCaptchaProvider reCaptchaKey={RECAPTCHA_SITE_KEY}>
      {children}
    </GoogleReCaptchaProvider>
  );
}

export default function AppShell() {
  return (
    <AppErrorBoundary>
      <AuthProvider>
        <UIProvider>
          <RecaptchaWrapper>
            <AnalysisProvider>
              <RecruiterProvider>
                <AppContent />
                <AnalyticsBootstrap />
                <Analytics />
                <SpeedInsights />
              </RecruiterProvider>
            </AnalysisProvider>
          </RecaptchaWrapper>
        </UIProvider>
      </AuthProvider>
    </AppErrorBoundary>
  );
}
