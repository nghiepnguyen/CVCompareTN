import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { GoogleReCaptchaProvider } from 'react-google-recaptcha-v3';
import App from './App.tsx';
import './index.css';

const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY || '6Ld7FJYsAAAAAHqpwX3r2G5sx-intia5LoR4-CE0'; // User's site key

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GoogleReCaptchaProvider 
      reCaptchaKey={RECAPTCHA_SITE_KEY}
    >
      <App />
    </GoogleReCaptchaProvider>
  </StrictMode>,
);
