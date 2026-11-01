// @vitest-environment jsdom
import React from 'react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import type { User, Session, AuthChangeEvent } from '@supabase/supabase-js';

const mocks = vi.hoisted(() => ({
  bootstrap: vi.fn(), getSession: vi.fn(), onAuthStateChange: vi.fn(), unsubscribe: vi.fn(),
  getProfile: vi.fn(), createProfile: vi.fn(), getPlan: vi.fn(),
}));
vi.mock('../../lib/supabase', () => ({
  bootstrapSupabase: mocks.bootstrap,
  supabase: { auth: { getSession: mocks.getSession, onAuthStateChange: mocks.onAuthStateChange } },
}));
vi.mock('../../services/userService', () => ({
  getUserProfile: mocks.getProfile, createUserProfile: mocks.createProfile, fetchEffectiveUserPlan: mocks.getPlan,
}));
vi.mock('../../lib/ga4', () => ({ trackEvent: vi.fn() }));
vi.mock('../../lib/sentry', () => ({ setSentryUser: vi.fn() }));
import { AuthProvider, useAuth } from '../../context/AuthContext';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
const user = { id: 'u1' } as User;
const session = { user } as Session;
let listener: (event: AuthChangeEvent, session: Session | null) => void;
const wrapper = ({ children }: { children: React.ReactNode }) => <AuthProvider>{children}</AuthProvider>;
const flush = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(0); }); };

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  mocks.bootstrap.mockResolvedValue(true);
  mocks.getSession.mockReturnValue(new Promise(() => {}));
  mocks.getProfile.mockResolvedValue({ role: 'user', hasPermission: true });
  mocks.getPlan.mockResolvedValue('free');
  mocks.onAuthStateChange.mockImplementation((cb) => {
    listener = cb;
    return { data: { subscription: { unsubscribe: mocks.unsubscribe } } };
  });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

it('subscribes before session recovery completes and ignores an older session result', async () => {
  const initial = deferred<{ data: { session: Session | null } }>();
  mocks.getSession.mockReturnValue(initial.promise);
  const { result } = renderHook(useAuth, { wrapper });
  await flush();
  expect(mocks.onAuthStateChange).toHaveBeenCalledOnce();
  act(() => listener('SIGNED_IN', session));
  // Profile I/O must not run inside the auth callback/lock.
  expect(mocks.getProfile).not.toHaveBeenCalled();
  await flush();
  expect(result.current.user?.id).toBe('u1');
  await act(async () => initial.resolve({ data: { session: null } }));
  expect(result.current.user?.id).toBe('u1');
});

it('accepts a late session after the initialization timeout', async () => {
  const { result } = renderHook(useAuth, { wrapper });
  await flush();
  await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
  expect(result.current.isAuthInitialized).toBe(true);
  act(() => listener('SIGNED_IN', session));
  await flush();
  expect(result.current.user?.id).toBe('u1');
  expect(result.current.userProfile?.hasPermission).toBe(true);
});

it('does not restore a stale profile after sign out', async () => {
  const profile = deferred<{ role: string; hasPermission: boolean }>();
  mocks.getProfile.mockReturnValue(profile.promise);
  mocks.getSession.mockResolvedValue({ data: { session } });
  const { result } = renderHook(useAuth, { wrapper });
  await flush();
  act(() => listener('SIGNED_OUT', null));
  await act(async () => profile.resolve({ role: 'user', hasPermission: true }));
  expect(result.current.user).toBeNull();
  expect(result.current.userProfile).toBeNull();
  expect(result.current.effectivePlan).toBe('free');
});

it('bounds a hung profile request and allows retry', async () => {
  mocks.getSession.mockResolvedValue({ data: { session } });
  mocks.getProfile.mockReturnValue(new Promise(() => {}));
  const { result } = renderHook(useAuth, { wrapper });
  await flush();
  await act(async () => { await vi.advanceTimersByTimeAsync(8000); });
  expect(result.current.isLoadingProfile).toBe(false);
  expect(result.current.userProfile).toBeNull();
  expect(result.current.error).toBeTruthy();
  mocks.getProfile.mockResolvedValue({ role: 'user', hasPermission: true });
  await act(async () => result.current.refreshUserProfile());
  expect(result.current.userProfile?.hasPermission).toBe(true);
});

it('unsubscribes and invalidates pending work on unmount', async () => {
  const { unmount } = renderHook(useAuth, { wrapper });
  await flush();
  unmount();
  expect(mocks.unsubscribe).toHaveBeenCalledOnce();
});

it('does not apply an older plan after switching accounts', async () => {
  const oldPlan = deferred<string>();
  mocks.getSession.mockResolvedValue({ data: { session } });
  mocks.getProfile.mockImplementation(async (id) => ({ id, role: 'user', hasPermission: true }));
  mocks.getPlan.mockImplementation((id) => id === 'u1' ? oldPlan.promise : Promise.resolve('free'));
  const { result } = renderHook(useAuth, { wrapper });
  await flush();
  act(() => listener('SIGNED_IN', { user: { id: 'u2' } } as Session));
  await flush();
  await act(async () => oldPlan.resolve('recruiter'));
  expect(result.current.user?.id).toBe('u2');
  expect(result.current.userProfile?.id).toBe('u2');
  expect(result.current.effectivePlan).toBe('free');
});

it('ignores a profile arriving after timeout and a successful retry', async () => {
  const oldProfile = deferred<{ role: string; hasPermission: boolean }>();
  mocks.getSession.mockResolvedValue({ data: { session } });
  mocks.getProfile.mockReturnValue(oldProfile.promise);
  const { result } = renderHook(useAuth, { wrapper });
  await flush();
  await act(async () => { await vi.advanceTimersByTimeAsync(8000); });
  mocks.getProfile.mockResolvedValue({ role: 'user', hasPermission: false });
  await act(async () => result.current.refreshUserProfile());
  expect(result.current.error).toBeNull();
  await act(async () => oldProfile.resolve({ role: 'user', hasPermission: true }));
  expect(result.current.userProfile?.hasPermission).toBe(false);
});

it('preserves expired email-link handling', async () => {
  window.history.replaceState(null, '', '/#error=access_denied&error_code=otp_expired');
  mocks.getSession.mockResolvedValue({ data: { session: null } });
  const { result } = renderHook(useAuth, { wrapper });
  await flush();
  expect(result.current.authModalMode).toBe('resendConfirmation');
  expect(result.current.error).toContain('hết hạn');
  expect(window.location.hash).toBe('');
});

it('shows configuration failure without calling auth', async () => {
  mocks.bootstrap.mockResolvedValue(false);
  const { result } = renderHook(useAuth, { wrapper });
  await flush();
  expect(result.current.isSupabaseConfigured).toBe(false);
  expect(result.current.isAuthInitialized).toBe(true);
  expect(mocks.getSession).not.toHaveBeenCalled();
});

it('does not apply a periodic plan response after switching accounts', async () => {
  const oldPlan = deferred<string>();
  mocks.getSession.mockResolvedValue({ data: { session } });
  const { result } = renderHook(useAuth, { wrapper });
  await flush();
  mocks.getPlan.mockReturnValueOnce(oldPlan.promise);
  await act(async () => { await vi.advanceTimersByTimeAsync(5 * 60 * 1000); });
  act(() => listener('SIGNED_IN', { user: { id: 'u2' } } as Session));
  await flush();
  await act(async () => oldPlan.resolve('recruiter'));
  expect(result.current.user?.id).toBe('u2');
  expect(result.current.effectivePlan).toBe('free');
});
