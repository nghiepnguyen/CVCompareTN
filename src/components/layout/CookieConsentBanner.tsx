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
        <>
          <motion.div
            key="cookie-consent-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[59] bg-primary/20 backdrop-blur-[2px]"
            aria-hidden
          />
          <motion.div
            key="cookie-consent-panel"
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed bottom-20 lg:bottom-6 left-4 right-4 z-[60] mx-auto max-w-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cookie-consent-title"
            aria-describedby="cookie-consent-desc"
          >
            <div className="border-2 border-border bg-surface p-5 shadow-[4px_4px_0_0_var(--color-border)] ring-1 ring-border/40">
              <div className="flex gap-4">
                <div className="hidden sm:flex w-11 h-11 shrink-0 border-2 border-border bg-surface-secondary items-center justify-center">
                  <Cookie className="w-5 h-5 text-accent" aria-hidden />
                </div>
                <div className="min-w-0 flex-1 space-y-3">
                  <div>
                    <h2
                      id="cookie-consent-title"
                      className="text-sm font-black uppercase tracking-tight text-text-main"
                    >
                      {t.cookieConsentTitle}
                    </h2>
                    <p id="cookie-consent-desc" className="mt-1.5 text-xs text-text-muted leading-relaxed">
                      {t.cookieConsentDesc}
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                    <button
                      type="button"
                      onClick={() => void handleAccept()}
                      disabled={isSaving}
                      className={cn(
                        'flex-1 py-2.5 px-4 bg-accent text-white text-xs font-black uppercase tracking-widest',
                        'border-2 border-border cursor-pointer hover:bg-accent-hover',
                        'hover:scale-[1.02] active:scale-[0.98] transition-transform disabled:opacity-60'
                      )}
                    >
                      {isSaving ? t.cookieAcceptLoading : t.cookieAccept}
                    </button>
                    <button
                      type="button"
                      onClick={handleReject}
                      disabled={isSaving}
                      className={cn(
                        'flex-1 py-2.5 px-4 bg-surface-secondary text-text-main text-xs font-black uppercase tracking-widest',
                        'border-2 border-border cursor-pointer hover:bg-surface-muted',
                        'hover:scale-[1.02] active:scale-[0.98] transition-transform disabled:opacity-60'
                      )}
                    >
                      {t.cookieReject}
                    </button>
                    {onOpenPrivacy && (
                      <button
                        type="button"
                        onClick={onOpenPrivacy}
                        className="text-[10px] font-bold uppercase tracking-wider text-text-muted hover:text-accent underline underline-offset-2 cursor-pointer sm:ml-1"
                      >
                        {t.cookiePolicy}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
