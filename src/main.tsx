import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleReCaptchaProvider } from 'react-google-recaptcha-v3';
import App from './App.tsx';
import { SupabaseConfigError } from './components/SupabaseConfigError.tsx';
import { bootstrapSupabase } from './lib/supabase.ts';
import './index.css';

const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY;

async function startApp() {
  const rootEl = document.getElementById('root');
  if (!rootEl) return;

  const supabaseReady = await bootstrapSupabase();

  if (!supabaseReady) {
    createRoot(rootEl).render(
      <StrictMode>
        <SupabaseConfigError />
      </StrictMode>
    );
    return;
  }

  createRoot(rootEl).render(
    <StrictMode>
      <GoogleReCaptchaProvider reCaptchaKey={RECAPTCHA_SITE_KEY}>
        <App />
      </GoogleReCaptchaProvider>
    </StrictMode>
  );
}

void startApp();
