// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  bootstrap: vi.fn(), getSession: vi.fn(), onAuthStateChange: vi.fn(), signUp: vi.fn(), rpc: vi.fn(),
}));
vi.mock('../../lib/supabase', () => ({
  bootstrapSupabase: mocks.bootstrap,
  supabase: {
    auth: { getSession: mocks.getSession, onAuthStateChange: mocks.onAuthStateChange, signUp: mocks.signUp },
    rpc: mocks.rpc,
  },
}));
vi.mock('../../services/userService', () => ({
  getUserProfile: vi.fn(), createUserProfile: vi.fn(), fetchEffectiveUserPlan: vi.fn(),
}));
vi.mock('../../lib/ga4', () => ({ trackEvent: vi.fn() }));
vi.mock('../../lib/sentry', () => ({ setSentryUser: vi.fn() }));
import { AuthProvider, useAuth } from '../../context/AuthContext';

const wrapper = ({ children }: { children: React.ReactNode }) => <AuthProvider>{children}</AuthProvider>;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.bootstrap.mockResolvedValue(true);
  mocks.getSession.mockResolvedValue({ data: { session: null } });
  mocks.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
});
afterEach(() => cleanup());

async function signUp(email = 'Someone@Example.test ') {
  const { result } = renderHook(useAuth, { wrapper });
  let out: Awaited<ReturnType<typeof result.current.signUpWithEmail>> | undefined;
  await act(async () => { out = await result.current.signUpWithEmail(email, 'pw-123456', 'Some One'); });
  return out!;
}

it('never calls the deleted-email lookup RPC; the Auth hook is the only check', async () => {
  mocks.signUp.mockResolvedValue({ data: { user: { identities: [{}] }, session: null }, error: null });
  const out = await signUp();
  expect(out).toEqual({ success: true, checkEmail: true });
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.signUp).toHaveBeenCalledWith(expect.objectContaining({ email: 'someone@example.test' }));
});

it.each([
  'SIGNUP_BLOCKED: Không thể đăng ký bằng email này. Vui lòng dùng email khác hoặc liên hệ hỗ trợ.',
  'ACCOUNT_DELETED: Tài khoản đã bị xóa vĩnh viễn. Vui lòng sử dụng email khác.', // hook before the migration
])('maps the hook rejection "%s" to the neutral authSignupBlocked key', async (message) => {
  mocks.signUp.mockResolvedValue({ data: { user: null, session: null }, error: { message } });
  const out = await signUp();
  expect(out).toEqual({ success: false, error: 'authSignupBlocked' });
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it('keeps the existing "already registered" mapping', async () => {
  mocks.signUp.mockResolvedValue({ data: { user: null, session: null }, error: { message: 'User already registered' } });
  expect(await signUp()).toEqual({ success: false, error: 'authEmailInUse' });
});
