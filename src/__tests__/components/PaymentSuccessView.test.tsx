// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';

const confirmProPayment = vi.fn();
const fetchEffectiveUserPlan = vi.fn();
vi.mock('../../services/paymentService', () => ({ confirmProPayment: (...a: unknown[]) => confirmProPayment(...a) }));
vi.mock('../../services/userService', () => ({ fetchEffectiveUserPlan: (...a: unknown[]) => fetchEffectiveUserPlan(...a) }));
vi.mock('../../lib/planLimits', () => ({ isProPlan: (p: string) => p === 'pro' || p === 'recruiter' }));
vi.mock('../../context/UIContext', () => ({ useUI: () => ({ t: new Proxy({}, { get: (_t, k) => String(k) }), setActiveTab: vi.fn() }) }));

// Like the real AuthContext: a new refreshUserProfile function on every render.
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' }, refreshUserProfile: async () => {} }),
}));

import { PaymentSuccessView } from '../../components/views/PaymentSuccessView';

beforeEach(() => {
  vi.useFakeTimers();
  window.history.replaceState({}, '', '/payment-success?orderCode=555');
  confirmProPayment.mockReset().mockResolvedValue({ success: true });
  fetchEffectiveUserPlan.mockReset().mockResolvedValue('free');
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('PaymentSuccessView', () => {
  it('re-renders do not start extra confirm polls', async () => {
    const view = render(<PaymentSuccessView />);
    await act(async () => { await Promise.resolve(); });
    for (let i = 0; i < 5; i++) view.rerender(<PaymentSuccessView />);
    await act(async () => { await Promise.resolve(); });
    expect(confirmProPayment).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(confirmProPayment).toHaveBeenCalledTimes(2);
  });
});
