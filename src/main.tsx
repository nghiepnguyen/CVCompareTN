import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { initSentry } from './lib/sentry.ts';
import './index.css';

function startApp() {
  initSentry();
  const rootEl = document.getElementById('root');
  if (!rootEl) return;

  // Render immediately — bootstrapSupabase() runs inside AuthContext
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

startApp();
