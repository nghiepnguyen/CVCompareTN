import { useEffect } from 'react';
import { initGa4Bootstrap, restoreAnalyticsConsent } from '../../lib/ga4';

/** Mount once beside Vercel Analytics — GA4 consent bootstrap, separate from AppContent. */
export function AnalyticsBootstrap() {
  useEffect(() => {
    initGa4Bootstrap();
    restoreAnalyticsConsent();
  }, []);

  return null;
}
