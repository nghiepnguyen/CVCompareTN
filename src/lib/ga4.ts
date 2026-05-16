const STORAGE_KEY = 'cv_compare_analytics_consent';
const CONSENT_RESET_EVENT = 'cv-compare-analytics-consent-reset';

const MEASUREMENT_ID = (import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined)?.trim() ?? '';

export type AnalyticsConsent = 'granted' | 'denied' | null;

type QueuedEvent = { name: string; params?: Record<string, unknown> };

let isScriptLoaded = false;
let loadPromise: Promise<void> | null = null;
let consentDefaultsApplied = false;
const eventQueue: QueuedEvent[] = [];

export function getGaMeasurementId(): string {
  return MEASUREMENT_ID;
}

export function isGa4Configured(): boolean {
  return MEASUREMENT_ID.length > 0;
}

export function getAnalyticsConsent(): AnalyticsConsent {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === 'granted' || value === 'denied') return value;
  } catch {
    /* private mode */
  }
  return null;
}

export function setAnalyticsConsent(consent: 'granted' | 'denied'): void {
  try {
    localStorage.setItem(STORAGE_KEY, consent);
  } catch {
    /* ignore */
  }
}

export function resetAnalyticsConsentPrompt(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(CONSENT_RESET_EVENT));
}

export function subscribeAnalyticsConsentReset(listener: () => void): () => void {
  window.addEventListener(CONSENT_RESET_EVENT, listener);
  return () => window.removeEventListener(CONSENT_RESET_EVENT, listener);
}

function flushEventQueue(): void {
  if (!window.gtag) return;
  while (eventQueue.length > 0) {
    const { name, params } = eventQueue.shift()!;
    window.gtag('event', name, params ?? {});
  }
}

function ensureDataLayer(): void {
  window.dataLayer = window.dataLayer ?? [];
  if (!window.gtag) {
    window.gtag = (...args: unknown[]) => {
      window.dataLayer.push(args);
    };
  }
}

/** Stub gtag + Consent Mode defaults (denied until user accepts). Safe to call on every app load. */
export function initGa4Bootstrap(): void {
  if (!MEASUREMENT_ID || consentDefaultsApplied) return;
  ensureDataLayer();
  window.gtag!('consent', 'default', {
    analytics_storage: 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    wait_for_update: 500,
  });
  consentDefaultsApplied = true;
}

export async function loadGA4(): Promise<void> {
  if (!MEASUREMENT_ID || isScriptLoaded) return;
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    ensureDataLayer();

    window.gtag!('consent', 'update', {
      analytics_storage: 'granted',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
    script.onload = () => {
      window.gtag!('js', new Date());
      window.gtag!('config', MEASUREMENT_ID, {
        anonymize_ip: true,
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
      });
      isScriptLoaded = true;
      flushEventQueue();
      resolve();
    };
    script.onerror = () => reject(new Error('Không tải được Google Analytics.'));
    document.head.appendChild(script);
  });

  return loadPromise;
}

export function restoreAnalyticsConsent(): void {
  initGa4Bootstrap();
  if (getAnalyticsConsent() === 'granted') {
    void loadGA4();
  }
}

export async function grantAnalyticsConsent(): Promise<void> {
  setAnalyticsConsent('granted');
  await loadGA4();
  flushEventQueue();
}

export function denyAnalyticsConsent(): void {
  setAnalyticsConsent('denied');
  eventQueue.length = 0;
}

export function trackEvent(name: string, params?: Record<string, unknown>): void {
  if (getAnalyticsConsent() !== 'granted' || !MEASUREMENT_ID) return;

  if (isScriptLoaded && window.gtag) {
    window.gtag('event', name, params ?? {});
    return;
  }

  eventQueue.push({ name, params });
  void loadGA4().catch((err) => console.error('[GA4]', err));
}
