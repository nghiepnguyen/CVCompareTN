// @vitest-environment jsdom
import React from 'react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';

const state = vi.hoisted(() => ({
  auth: { user: null as { id: string } | null, userProfile: null as { role: string; hasPermission?: boolean } | null,
    isAuthInitialized: false, isRedirectChecked: true, isSupabaseConfigured: null as boolean | null,
    isLoadingProfile: true, authModalMode: null as string | null, closeAuthModal: vi.fn(), error: null, setError: vi.fn(), refreshUserProfile: vi.fn() },
  tab: 'analyze', setActiveTab: vi.fn(),
}));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => state.auth }));
vi.mock('../../context/UIContext', () => ({ useUI: () => ({
  activeTab: state.tab, setActiveTab: state.setActiveTab, reportLanguage: 'vi',
  t: new Proxy({}, { get: (_, key) => String(key) }),
}) }));
vi.mock('../../context/AnalysisContext', () => ({ useAnalysis: () => ({ savedJDs: [], savedCVs: [] }) }));
vi.mock('../../components/layout/Header', () => ({ Header: () => null }));
vi.mock('../../components/layout/Footer', () => ({ Footer: () => null }));
vi.mock('../../components/layout/InAppBrowserWarning', () => ({ InAppBrowserWarning: () => null }));
vi.mock('../../components/layout/CookieConsentBanner', () => ({ CookieConsentBanner: () => null }));
vi.mock('../../app/MobileBottomNav', () => ({ MobileBottomNav: () => null }));
vi.mock('../../app/SavedJdsListModal', () => ({ SavedJdsListModal: () => null }));
vi.mock('../../app/SaveJdNameModal', () => ({ SaveJdNameModal: () => null }));
vi.mock('../../app/SavedCvsListModal', () => ({ SavedCvsListModal: () => null }));
vi.mock('../../components/views/LandingView', () => ({ LandingView: () => <div>LandingView</div> }));
vi.mock('../../components/views/DashboardView', () => ({ DashboardView: () => <div>DashboardView</div> }));
vi.mock('../../components/views/AdminView', () => ({ AdminView: () => <div>AdminView</div> }));
vi.mock('../../components/views/NoPermissionView', () => ({ NoPermissionView: () => <div>NoPermissionView</div> }));
vi.mock('../../components/PrivacyPolicyPage', () => ({ PrivacyPolicyPage: () => <div>PrivacyPolicyPage</div> }));
vi.mock('../../components/auth/AuthModal', () => ({ AuthModal: () => <div>AuthModal</div> }));

import { AppContent } from '../../app/AppContent';
beforeEach(() => {
  state.tab = 'analyze';
  Object.assign(state.auth, { user: null, userProfile: null, isAuthInitialized: false,
    isLoadingProfile: true, isSupabaseConfigured: null, authModalMode: null });
  vi.clearAllMocks();
});
afterEach(cleanup);

it('renders landing while auth/config are still pending, without opening auth modal', () => {
  render(<AppContent />);
  expect(screen.queryByText('LandingView')).not.toBeNull();
  expect(screen.queryByText('appInitializing')).toBeNull();
  expect(screen.queryByText('AuthModal')).toBeNull();
});
it('renders a public deep link while auth is pending', async () => {
  state.tab = 'privacy';
  render(<AppContent />);
  expect(await screen.findByText('PrivacyPolicyPage')).not.toBeNull();
});
it('keeps private deep links pending without redirecting', () => {
  state.tab = 'admin';
  render(<AppContent />);
  expect(screen.queryByText('LandingView')).toBeNull();
  expect(screen.queryByText('appInitializing')).not.toBeNull();
  expect(state.setActiveTab).not.toHaveBeenCalled();
});
it('waits for admin profile before rendering or redirecting', async () => {
  state.tab = 'admin';
  Object.assign(state.auth, { user: { id: 'a' }, isAuthInitialized: true, isSupabaseConfigured: true });
  const view = render(<AppContent />);
  expect(state.setActiveTab).not.toHaveBeenCalled();
  expect(screen.queryByText('DashboardView')).toBeNull();
  Object.assign(state.auth, { userProfile: { role: 'admin' }, isLoadingProfile: false });
  await act(async () => view.rerender(<AppContent />));
  expect(screen.queryByText('AdminView')).not.toBeNull();
  expect(state.setActiveTab).not.toHaveBeenCalled();
});
it('never renders private content when profile is missing or restricted', async () => {
  Object.assign(state.auth, { user: { id: 'a' }, isAuthInitialized: true,
    isSupabaseConfigured: true, isLoadingProfile: false });
  const view = render(<AppContent />);
  expect(screen.queryByText('DashboardView')).toBeNull();
  Object.assign(state.auth, { userProfile: { role: 'user', hasPermission: false } });
  await act(async () => view.rerender(<AppContent />));
  expect(screen.queryByText('NoPermissionView')).not.toBeNull();
});

it('acknowledges an auth request while initialization is pending and allows dismissal', () => {
  state.auth.authModalMode = 'signIn';
  render(<AppContent />);
  expect(screen.getByRole('status', { name: 'appCheckingSession' })).toBeTruthy();
  expect(screen.queryByText('AuthModal')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'cvStoreClose' }));
  expect(state.auth.closeAuthModal).toHaveBeenCalledOnce();
});

it('does not load the auth modal until the user asks to sign in', async () => {
  Object.assign(state.auth, { isAuthInitialized: true, isSupabaseConfigured: true });
  let view!: ReturnType<typeof render>;
  await act(async () => { view = render(<AppContent />); });
  expect(screen.queryByText('AuthModal')).toBeNull();
  state.auth.authModalMode = 'signIn';
  await act(async () => view.rerender(<AppContent />));
  expect(screen.queryByText('AuthModal')).not.toBeNull();
});
