// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { UI_LABELS } from '../../translations';
const state = vi.hoisted(() => ({ ready: false, logged: false, hasProfile: false, loading: true }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({
  user: state.logged ? { id: 'u1', user_metadata: { full_name: 'User' } } : null,
  userProfile: state.hasProfile ? { role: 'user' } : null,
  effectivePlan: 'free', isAuthInitialized: state.ready, isLoadingProfile: state.loading,
}) }));
vi.mock('../../context/UIContext', () => ({ useUI: () => ({
  reportLanguage: 'vi', isUserMenuOpen: true, t: UI_LABELS.vi,
}) }));
vi.mock('../../context/AnalysisContext', () => ({ useAnalysis: () => ({}) }));
import { Header } from '../../components/layout/Header';
afterEach(cleanup);
it('shows session status instead of a premature login button', () => {
  state.ready = false; state.logged = false;
  const view = render(<Header />);
  expect(screen.queryByRole('status')).not.toBeNull();
  expect(screen.queryByText('Đăng nhập')).toBeNull();
  state.ready = true;
  view.rerender(<Header />);
  expect(screen.queryByRole('status')).toBeNull();
  expect(screen.queryByText('Đăng nhập')).not.toBeNull();
});

it('does not offer Free-plan upgrades before the account plan is known', () => {
  Object.assign(state, { ready: true, logged: true, hasProfile: false, loading: true });
  const view = render(<Header />);
  expect(screen.getByRole('status', { name: UI_LABELS.vi.appLoadingContent })).not.toBeNull();
  expect(screen.queryByText(UI_LABELS.vi.menuUpgrade)).toBeNull();
  state.hasProfile = true;
  state.loading = false;
  view.rerender(<Header />);
  expect(screen.queryByRole('status')).toBeNull();
  expect(screen.queryByText(UI_LABELS.vi.menuUpgrade)).not.toBeNull();
});
