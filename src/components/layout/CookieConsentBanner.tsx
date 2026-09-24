import { useEffect, useState } from 'react';
import { Cookie } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  denyAnalyticsConsent,
  getAnalyticsConsent,
  grantAnalyticsConsent,
  isGa4Configured,
  subscribeAnalyticsConsentReset,
} from '../../lib/ga4';
import { cn } from '../../lib/utils';
import { useUI } from '../../context/UIContext';

type CookieConsentBannerProps = {
  onOpenPrivacy?: () => void;
};

export function CookieConsentBanner({ onOpenPrivacy }: CookieConsentBannerProps) {
  const { t } = useUI();
  const [isVisible, setIsVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const syncVisibility = () => {
    if (!isGa4Configured()) {
      setIsVisible(false);
      return;
    }
    setIsVisible(getAnalyticsConsent() === null);
  };

  useEffect(() => {
    syncVisibility();
    return subscribeAnalyticsConsentReset(syncVisibility);
  }, []);

  const handleAccept = async () => {
    setIsSaving(true);
    try {
      await grantAnalyticsConsent();
      setIsVisible(false);
    } catch (err) {
      console.error('[CookieConsent] GA4 load failed:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReject = () => {
    denyAnalyticsConsent();
    setIsVisible(false);
  };

  return (
    <AnimatePresence>
      {isVisible && (
        // Non-blocking on purpose: no scrim/blur and no aria-modal. Crawlers that render JS
        // (Google Auth Platform branding verification) read a blurred page as "behind a login
        // page" and the privacy policy as empty — the content must stay readable underneath.
        <motion.div
          key="cookie-consent-panel"
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 24, opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed bottom-20 lg:bottom-6 left-4 right-4 sm:right-auto sm:w-80 z-[60]"
          role="region"
          aria-labelledby="cookie-consent-title"
          aria-describedby="cookie-consent-desc"
        >
          <div className="border-2 border-border bg-surface p-3.5 shadow-[3px_3px_0_0_var(--color-border)]">
            <div className="flex items-center gap-2">
              <Cookie className="w-4 h-4 shrink-0 text-accent" aria-hidden />
              <h2
                id="cookie-consent-title"
                className="text-xs font-black uppercase tracking-tight text-text-main"
              >
                {t.cookieConsentTitle}
              </h2>
            </div>
            <p id="cookie-consent-desc" className="mt-1.5 text-[11px] text-text-muted leading-snug">
              {t.cookieConsentDesc}
            </p>
            <div className="mt-2.5 flex gap-2">
              <button
                type="button"
                onClick={() => void handleAccept()}
                disabled={isSaving}
                className={cn(
                  'flex-1 py-1.5 px-3 bg-accent text-white text-[10px] font-black uppercase tracking-widest',
                  'border-2 border-border cursor-pointer hover:bg-accent-hover',
                  'hover:scale-105 active:scale-95 transition-transform disabled:opacity-60'
                )}
              >
                {isSaving ? t.cookieAcceptLoading : t.cookieAccept}
              </button>
              <button
                type="button"
                onClick={handleReject}
                disabled={isSaving}
                className={cn(
                  'flex-1 py-1.5 px-3 bg-surface-secondary text-text-main text-[10px] font-black uppercase tracking-widest',
                  'border-2 border-border cursor-pointer hover:bg-surface-muted',
                  'hover:scale-105 active:scale-95 transition-transform disabled:opacity-60'
                )}
              >
                {t.cookieReject}
              </button>
            </div>
            {onOpenPrivacy && (
              <button
                type="button"
                onClick={onOpenPrivacy}
                className="mt-2 text-[10px] font-bold uppercase tracking-wider text-text-muted hover:text-accent underline underline-offset-2 cursor-pointer hover:scale-105 active:scale-95 transition-transform"
              >
                {t.cookiePolicy}
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
