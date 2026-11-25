// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CookieConsentBanner } from '../../components/layout/CookieConsentBanner';
import { system } from '../../translations/system';

let grant: () => Promise<void> = () => Promise.resolve();
vi.mock('../../lib/ga4', () => ({
  denyAnalyticsConsent: vi.fn(),
  getAnalyticsConsent: () => null,
  grantAnalyticsConsent: () => grant(),
  isGa4Configured: () => true,
  subscribeAnalyticsConsentReset: () => () => {},
}));
vi.mock('../../context/UIContext', () => ({
  useUI: () => ({ t: new Proxy({}, { get: (_t, key) => String(key) }) }),
}));

describe('CookieConsentBanner accept', () => {
  it('closes after acceptance even when the analytics tag is blocked', async () => {
    grant = () => Promise.reject(new Error('blocked'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<CookieConsentBanner />);
    fireEvent.click(screen.getByText('cookieAccept'));
    await waitFor(() => expect(screen.queryByText('cookieConsentTitle')).toBeNull());
  });

  it('names both optional analytics providers in each language', () => {
    for (const text of Object.values(system.cookieConsentDesc)) {
      expect(text).toContain('Google Analytics');
      expect(text).toContain('Ahrefs Analytics');
    }
  });
});
