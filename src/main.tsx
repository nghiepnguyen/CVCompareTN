import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { SupabaseConfigError } from './components/SupabaseConfigError.tsx';
import { bootstrapSupabase } from './lib/supabase.ts';
import { initSentry } from './lib/sentry.ts';
import './index.css';

async function startApp() {
  initSentry();
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
      <App />
    </StrictMode>
  );
}

void startApp();
