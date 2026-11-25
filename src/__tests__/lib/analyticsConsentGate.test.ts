// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const GA_ID = 'G-TEST000000';
const optionalScripts = () =>
  [...document.querySelectorAll('script')]
    .map((s) => s.src)
    .filter((src) => src.includes('googletagmanager.com') || src.includes('analytics.ahrefs.com'));

async function loadModule() {
  vi.resetModules();
  vi.stubEnv('VITE_GA_MEASUREMENT_ID', GA_ID);
  return import('../../lib/ga4');
}

describe('optional analytics load only after consent', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    localStorage.clear();
    delete (window as { gtag?: unknown }).gtag;
    (window as { dataLayer?: unknown[] }).dataLayer = undefined as unknown as unknown[];
  });
  afterEach(() => vi.unstubAllEnvs());

  it('loads neither GA4 nor Ahrefs before any choice', async () => {
    const ga4 = await loadModule();
    ga4.restoreAnalyticsConsent();
    ga4.trackEvent('page_view');
    expect(optionalScripts()).toEqual([]);
  });

  it('loads neither after the user declines', async () => {
    localStorage.setItem('cv_compare_analytics_consent', 'denied');
    const ga4 = await loadModule();
    ga4.restoreAnalyticsConsent();
    ga4.denyAnalyticsConsent();
    ga4.trackEvent('page_view');
    expect(optionalScripts()).toEqual([]);
  });

  it('loads both once the user accepts, with GA consent updated before the tag runs', async () => {
    const ga4 = await loadModule();
    ga4.restoreAnalyticsConsent();
    void ga4.grantAnalyticsConsent();
    const srcs = optionalScripts();
    expect(srcs).toContain(`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`);
    expect(srcs).toContain('https://analytics.ahrefs.com/analytics.js');
    const updates = (window.dataLayer as unknown[][]).filter((a) => a[0] === 'consent');
    expect(updates.map((a) => a[1])).toEqual(['default', 'update']);
  });

  it('loads both on a return visit with stored consent, once each', async () => {
    localStorage.setItem('cv_compare_analytics_consent', 'granted');
    const ga4 = await loadModule();
    ga4.restoreAnalyticsConsent();
    ga4.restoreAnalyticsConsent();
    expect(optionalScripts().filter((s) => s.includes('ahrefs'))).toHaveLength(1);
    expect(optionalScripts().filter((s) => s.includes('googletagmanager'))).toHaveLength(1);
  });

  it('makes no network request to GA or Ahrefs before a choice or after decline', async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(new Response('')));
    const beaconSpy = vi.fn(() => true);
    vi.stubGlobal('fetch', fetchSpy);
    Object.defineProperty(navigator, 'sendBeacon', { value: beaconSpy, configurable: true });
    const ga4 = await loadModule();
    ga4.restoreAnalyticsConsent();
    ga4.trackEvent('page_view', { page: '/vi/' });
    ga4.denyAnalyticsConsent();
    ga4.trackEvent('analyze_cv');
    const urls = [...fetchSpy.mock.calls, ...beaconSpy.mock.calls].map((c) => String((c as unknown[])[0]));
    expect(urls.filter((u) => /google|ahrefs/.test(u))).toEqual([]);
    expect(optionalScripts()).toEqual([]);
    // Nothing but the consent default reaches the dataLayer queue.
    expect((window.dataLayer as unknown[][]).map((a) => a[0])).toEqual(['consent']);
    vi.unstubAllGlobals();
  });

  it('stops sending events after consent is withdrawn in the same session', async () => {
    const ga4 = await loadModule();
    ga4.restoreAnalyticsConsent();
    void ga4.grantAnalyticsConsent();
    // Simulate the GA script finishing loading.
    const gaScript = [...document.querySelectorAll('script')].find((s) => s.src.includes('googletagmanager'))!;
    gaScript.onload?.(new Event('load'));
    ga4.trackEvent('before_withdraw');
    ga4.denyAnalyticsConsent();
    ga4.trackEvent('after_withdraw');
    const events = (window.dataLayer as unknown[][]).filter((a) => a[0] === 'event').map((a) => a[1]);
    expect(events).toContain('before_withdraw');
    expect(events).not.toContain('after_withdraw');
    expect(localStorage.getItem('cv_compare_analytics_consent')).toBe('denied');
  });

  it('after a reload with stored denial, nothing loads; with the prompt reset, nothing loads until a new choice', async () => {
    localStorage.setItem('cv_compare_analytics_consent', 'denied');
    let ga4 = await loadModule();
    ga4.restoreAnalyticsConsent();
    expect(optionalScripts()).toEqual([]);
    ga4.resetAnalyticsConsentPrompt();
    document.head.innerHTML = '';
    ga4 = await loadModule(); // reload
    ga4.restoreAnalyticsConsent();
    expect(ga4.getAnalyticsConsent()).toBeNull();
    expect(optionalScripts()).toEqual([]);
  });

  it('keeps essential services independent of analytics consent', () => {
    const root = resolve(__dirname, '../../..');
    const shell = readFileSync(resolve(root, 'src/app/AppShell.tsx'), 'utf8');
    // reCAPTCHA provider and Vercel performance measurement are not behind the consent gate.
    expect(shell).toContain('GoogleReCaptchaProvider');
    expect(shell).toContain('<SpeedInsights />');
    const ga4src = readFileSync(resolve(root, 'src/lib/ga4.ts'), 'utf8');
    expect(ga4src).not.toMatch(/sentry|recaptcha|supabase/i);
  });

  it('ships no optional analytics tag in the static HTML or the build config', () => {
    const root = resolve(__dirname, '../../..');
    const html = readFileSync(resolve(root, 'index.html'), 'utf8');
    expect(html).not.toContain('analytics.ahrefs.com');
    expect(html).not.toContain('googletagmanager.com/gtag/js');
    expect(readFileSync(resolve(root, 'vite.config.ts'), 'utf8')).not.toContain('gtag/js');
  });
});
