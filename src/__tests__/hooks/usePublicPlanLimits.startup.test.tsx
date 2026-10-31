// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { PublicPlanLimits } from '../../services/publicPlanLimitsService';
const state = vi.hoisted(() => ({
  configured: null as boolean | null, fetch: vi.fn(), cached: null as PublicPlanLimits | null,
}));
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ isSupabaseConfigured: state.configured }),
}));
vi.mock('../../services/publicPlanLimitsService', () => ({
  getCachedPublicPlanLimits: () => state.cached,
  fetchPublicPlanLimits: state.fetch,
}));
import { usePublicPlanLimits } from '../../hooks/usePublicPlanLimits';
beforeEach(() => {
  vi.clearAllMocks();
  state.configured = null;
  state.cached = null;
  state.fetch.mockReturnValue(new Promise(() => {}));
});
afterEach(cleanup);

it('does not expose default quotas before configuration or the first response', async () => {
  const { result, rerender } = renderHook(usePublicPlanLimits);
  expect(result.current.limits).toBeNull();
  expect(result.current.isLoading).toBe(true);
  expect(state.fetch).not.toHaveBeenCalled();
  state.configured = true;
  rerender();
  expect(result.current.limits).toBeNull();
  state.fetch.mockResolvedValue({ free: 3, pro: 100, recruiter: 500 });
  await act(async () => result.current.retry());
  expect(result.current.limits?.free).toBe(3);
  expect(result.current.isLoading).toBe(false);
});

it('ends skeleton on failure and allows retry without fabricated values', async () => {
  state.configured = true;
  state.fetch.mockRejectedValue(new Error('offline'));
  const { result } = renderHook(usePublicPlanLimits);
  await waitFor(() => expect(result.current.error).toBe(true));
  expect(result.current.limits).toBeNull();
  expect(result.current.isLoading).toBe(false);
  state.fetch.mockResolvedValue({ free: 3, pro: 100, recruiter: 500 });
  await act(async () => result.current.retry());
  expect(result.current.error).toBe(false);
  expect(result.current.limits?.free).toBe(3);
});

it('keeps verified values visible during background refresh and refresh failure', async () => {
  state.configured = true;
  state.cached = { free: 3, pro: 100, recruiter: 500 };
  const { result } = renderHook(usePublicPlanLimits);
  expect(result.current.limits?.free).toBe(3);
  state.fetch.mockRejectedValue(new Error('offline'));
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(result.current.limits?.free).toBe(3);
  expect(result.current.error).toBe(true);
});

it('ends initial loading if configuration is unavailable', () => {
  state.configured = false;
  const { result } = renderHook(usePublicPlanLimits);
  expect(result.current.isLoading).toBe(false);
  expect(result.current.error).toBe(true);
  expect(state.fetch).not.toHaveBeenCalled();
});
