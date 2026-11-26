const STORAGE_KEY = 'cv_compare_analytics_consent';
const CONSENT_RESET_EVENT = 'cv-compare-analytics-consent-reset';

const MEASUREMENT_ID = (import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined)?.trim() ?? '';

export type AnalyticsConsent = 'granted' | 'denied' | null;

type QueuedEvent = { name: string; params?: Record<string, unknown> };

let isScriptLoaded = false;
let loadPromise: Promise<void> | null = null;
let consentDefaultsApplied = false;
const eventQueue: QueuedEvent[] = [];

const GRANTED_CONSENT = {
  analytics_storage: 'granted' as const,
  ad_storage: 'denied' as const,
  ad_user_data: 'denied' as const,
  ad_personalization: 'denied' as const,
};

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

// Ahrefs Web Analytics: optional measurement, loaded only with analytics
// consent (it used to be a static tag in index.html that ran before any choice).
const AHREFS_SRC = 'https://analytics.ahrefs.com/analytics.js';
const AHREFS_KEY = 'X76zkXHI2/tBZKbeCIThzA';

function loadAhrefs(): void {
  if (isAhrefsInPage()) return;
  const script = document.createElement('script');
  script.async = true;
  script.src = AHREFS_SRC;
  script.dataset.key = AHREFS_KEY;
  document.head.appendChild(script);
}

function isAhrefsInPage(): boolean {
  return !!document.querySelector(`script[src="${AHREFS_SRC}"]`);
}

// GA4 first-party cookies (_ga, _ga_<stream>, legacy _gid), on this host and the
// registrable parent domain GA writes to by default.
function clearGaCookies(): void {
  const names = document.cookie
    .split(';')
    .map((c) => c.split('=')[0].trim())
    .filter((n) => n === '_ga' || n === '_gid' || n.startsWith('_ga_'));
  const host = window.location.hostname;
  // shortcut: registrable domain = last two labels (right for cvfit.pro and its
  // subdomains such as recuiter.cvfit.pro); a multi-label TLD would need a PSL lookup.
  const base = host.split('.').slice(-2).join('.');
  const domains = [...new Set(['', host, `.${host}`, `.${base}`])];
  for (const name of names) {
    for (const domain of domains) {
      document.cookie = `${name}=; Max-Age=0; path=/${domain ? `; domain=${domain}` : ''}`;
    }
  }
}

function isGtagScriptInPage(): boolean {
  return !!document.querySelector(`script[src*="googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}"]`);
}

function ensureDataLayer(): void {
  window.dataLayer = window.dataLayer ?? [];
  if (!window.gtag) {
    // Google's standard snippet: gtag.js only runs entries pushed as `arguments`;
    // an Array (e.g. from rest params) is ignored, so GA4 would never `config`.
    window.gtag = function gtag() {
      window.dataLayer.push(arguments);
    };
  }
}

function applyGrantedConsent(): void {
  ensureDataLayer();
  window.gtag!('consent', 'update', GRANTED_CONSENT);
}

function flushEventQueue(): void {
  if (!window.gtag) return;
  while (eventQueue.length > 0) {
    const { name, params } = eventQueue.shift()!;
    window.gtag('event', name, params ?? {});
  }
}

/** Align in-app state with gtag injected in index.html (build-time). */
export function initGa4Bootstrap(): void {
  if (!MEASUREMENT_ID) return;

  if (isGtagScriptInPage()) {
    consentDefaultsApplied = true;
    isScriptLoaded = true;
    if (getAnalyticsConsent() === 'granted') {
      applyGrantedConsent();
      flushEventQueue();
    }
    return;
  }

  if (consentDefaultsApplied) return;
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

  if (isGtagScriptInPage()) {
    applyGrantedConsent();
    isScriptLoaded = true;
    flushEventQueue();
    return;
  }

  loadPromise = new Promise((resolve, reject) => {
    ensureDataLayer();
    applyGrantedConsent();

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
  if (getAnalyticsConsent() === 'denied') clearGaCookies();
  if (getAnalyticsConsent() === 'granted') {
    loadAhrefs();
    void loadGA4();
  }
}

export async function grantAnalyticsConsent(): Promise<void> {
  setAnalyticsConsent('granted');
  loadAhrefs();
  // When script is already in the page (injected via index.html), loadGA4()
  // returns early without updating consent. Apply it directly.
  if (isGtagScriptInPage() || isScriptLoaded) {
    applyGrantedConsent();
    isScriptLoaded = true;
    flushEventQueue();
    return;
  }
  await loadGA4();
  flushEventQueue();
}

export function denyAnalyticsConsent(): void {
  setAnalyticsConsent('denied');
  eventQueue.length = 0;
  const optionalScriptsRunning = isScriptLoaded || isGtagScriptInPage() || isAhrefsInPage();
  if (window.gtag) {
    window.gtag('consent', 'update', {
      analytics_storage: 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
  }
  clearGaCookies();
  // Withdrawal after acceptance: GA4 / Ahrefs code already running in this page
  // cannot be unloaded, so reload; the fresh page loads neither (stored 'denied').
  if (optionalScriptsRunning) window.location.reload();
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
