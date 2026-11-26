// @vitest-environment jsdom
// gtag.js only executes dataLayer entries pushed as an `arguments` object; Arrays
// are ignored silently (the 2026-11-25 #111 regression: GA4 loaded but never ran
// `config`, so no hits and no _ga cookie). These tests pin the wire format.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const GA_ID = 'G-TEST000000';
const isArgs = (e: unknown) => Object.prototype.toString.call(e) === '[object Arguments]';
const entries = () => (window.dataLayer ?? []) as ArrayLike<unknown>[];
const commands = (name: string) => entries().filter((e) => e[0] === name).map((e) => Array.from(e));
const gaScript = () =>
  [...document.querySelectorAll('script')].find((s) => s.src.startsWith('https://www.googletagmanager.com/'))!;

async function loadModule() {
  vi.resetModules();
  vi.stubEnv('VITE_GA_MEASUREMENT_ID', GA_ID);
  return import('../../lib/ga4');
}

describe('gtag command format', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    localStorage.clear();
    delete (window as { gtag?: unknown }).gtag;
    (window as { dataLayer?: unknown[] }).dataLayer = undefined as unknown as unknown[];
  });
  afterEach(() => vi.unstubAllEnvs());

  it('pushes the consent default as an arguments object, denied for every purpose', async () => {
    const ga4 = await loadModule();
    ga4.restoreAnalyticsConsent();
    expect(entries().length).toBeGreaterThan(0);
    expect(entries().every(isArgs)).toBe(true);
    expect(commands('consent')).toEqual([
      ['consent', 'default', {
        analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied',
        ad_personalization: 'denied', wait_for_update: 500,
      }],
    ]);
  });

  it('on accept pushes consent update, js and config (ID + privacy settings) as arguments objects', async () => {
    const ga4 = await loadModule();
    ga4.restoreAnalyticsConsent();
    const granted = ga4.grantAnalyticsConsent();
    gaScript().onload?.(new Event('load'));
    await granted;

    expect(entries().every(isArgs)).toBe(true);
    expect(commands('consent')[1]).toEqual(['consent', 'update', {
      analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
    }]);
    expect(commands('js')).toHaveLength(1);
    expect(commands('js')[0][1]).toBeInstanceOf(Date);
    expect(commands('config')).toEqual([['config', GA_ID, {
      anonymize_ip: true, allow_google_signals: false, allow_ad_personalization_signals: false,
    }]]);
  });

  it('flushes events queued before the tag loaded, after config, as arguments objects', async () => {
    localStorage.setItem('cv_compare_analytics_consent', 'granted');
    const ga4 = await loadModule();
    ga4.restoreAnalyticsConsent();
    ga4.trackEvent('cv_analyzed', { score_bucket: 'high' });
    expect(commands('event')).toEqual([]);

    gaScript().onload?.(new Event('load'));

    expect(entries().every(isArgs)).toBe(true);
    expect(commands('event')).toEqual([['event', 'cv_analyzed', { score_bucket: 'high' }]]);
    const names = entries().map((e) => e[0]);
    expect(names.indexOf('event')).toBeGreaterThan(names.indexOf('config'));
  });
});
