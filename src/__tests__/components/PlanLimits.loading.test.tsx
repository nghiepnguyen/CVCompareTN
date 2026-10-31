// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { UI_LABELS } from '../../translations';
import type { PublicPlanLimits } from '../../services/publicPlanLimitsService';
const state = vi.hoisted(() => ({
  limits: null as PublicPlanLimits | null, isLoading: true, error: false, retry: vi.fn(), hasProfile: true,
}));
vi.mock('../../hooks/usePublicPlanLimits', () => ({ usePublicPlanLimits: () => state }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({
  user: { id: 'u1' }, effectivePlan: 'free', userProfile: state.hasProfile ? { role: 'user' } : null,
}) }));
vi.mock('../../context/UIContext', () => ({ useUI: () => ({
  t: UI_LABELS.vi, reportLanguage: 'vi', setActiveTab: vi.fn(),
}) }));
import { PricingSection } from '../../components/views/landing/PricingSection';
import { UpgradeView } from '../../components/views/UpgradeView';

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  Object.assign(state, { limits: null, isLoading: true, error: false, hasProfile: true });
  state.retry.mockClear();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
for (const [name, element] of [
  ['landing', <PricingSection t={UI_LABELS.vi} login={() => {}} theme="light" />],
  ['upgrade', <UpgradeView />],
] as const) {
  it(name + ': only dynamic quotas wait; prices and features stay visible', () => {
    const view = render(element);
    expect(screen.getAllByRole('status', { name: UI_LABELS.vi.appLoadingContent })).toHaveLength(6);
    expect(screen.getAllByText('69.000đ').length).toBeGreaterThan(0);
    expect(screen.queryByText('100')).toBeNull();
    state.limits = { free: 3, pro: 100, recruiter: 500 };
    // Cached values must remain visible even if a background refresh is loading.
    view.rerender(element.type === UpgradeView ? <UpgradeView /> :
      <PricingSection t={UI_LABELS.vi} login={() => {}} theme="light" />);
    expect(screen.queryAllByRole('status', { name: UI_LABELS.vi.appLoadingContent })).toHaveLength(0);
    expect(screen.getAllByText('100').length).toBeGreaterThan(0);
  });
  it(name + ': failure replaces skeleton with retry', () => {
    state.isLoading = false;
    state.error = true;
    render(element);
    expect(screen.queryAllByRole('status')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: UI_LABELS.vi.appRetry }));
    expect(state.retry).toHaveBeenCalledOnce();
  });
}

it('does not mark Free as the current plan or allow checkout without a profile', () => {
  state.hasProfile = false;
  render(<UpgradeView />);
  expect(screen.queryAllByText(UI_LABELS.vi.upgradeBadgeCurrentPlan)).toHaveLength(0);
  for (const button of screen.getAllByRole('button', { name: UI_LABELS.vi.upgradeCta })) {
    expect(button.hasAttribute('disabled')).toBe(true);
  }
});
