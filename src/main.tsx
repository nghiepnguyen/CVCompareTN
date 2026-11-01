import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { initSentry } from './lib/sentry.ts';
import './index.css';

function startApp() {
  const rootEl = document.getElementById('root');
  if (!rootEl) return;

  // Render immediately — bootstrapSupabase() runs inside AuthContext
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>
  );

  // Error reporting is not needed to paint; load its chunk once the browser is idle.
  const start = () => void initSentry();
  if ('requestIdleCallback' in window) window.requestIdleCallback(start, { timeout: 3000 });
  else setTimeout(start, 1500);
}

startApp();
