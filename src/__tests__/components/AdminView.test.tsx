// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup, within } from '@testing-library/react';
import type { UserProfile } from '../../services/userService';

vi.mock('../../context/UIContext', () => ({
  useUI: () => ({
    // Keys render as their own name; *Error keys keep a {message} slot like the real strings.
    t: new Proxy({}, { get: (_t, key) => (String(key).endsWith('Error') ? `${String(key)}: {message}` : String(key)) }),
    reportLanguage: 'vi',
  }),
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'admin-self' }, userProfile: null }),
}));

vi.mock('../../lib/supabase', () => ({ supabase: {} }));

vi.mock('../../services/appSettingsService', () => ({
  getDefaultMonthlyAnalyticsLimit: vi.fn().mockResolvedValue(5),
  updateDefaultMonthlyAnalyticsLimit: vi.fn(),
}));

vi.mock('../../components/views/AdminReportTab', () => ({ AdminReportTab: () => null }));

// Render motion elements as plain DOM so exit animations don't delay unmount.
vi.mock('framer-motion', () => {
  const strip = ({ initial: _i, animate: _a, exit: _e, transition: _t, ...rest }: Record<string, unknown>) => rest;
  // Cache per tag: a fresh component type each access would remount the subtree every render.
  const cache = new Map<string, React.FC<Record<string, unknown>>>();
  const motion = new Proxy({}, {
    get: (_t, tag: string) => {
      if (!cache.has(tag)) cache.set(tag, (props) => React.createElement(tag, strip(props)));
      return cache.get(tag);
    },
  });
  return { motion, AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</> };
});

let adminUsersState: { users: UserProfile[] };
vi.mock('../../hooks/useAdminUsers', () => ({
  useAdminUsers: () => ({
    users: adminUsersState.users,
    isLoading: false,
    hasMore: false,
    totalCount: adminUsersState.users.length,
    loadMore: vi.fn(),
    refresh: vi.fn(),
  }),
}));

const svc = vi.hoisted(() => ({
  updateUserMonthlyAnalyticsLimit: vi.fn(),
  resetUserToGlobalAnalyticsLimit: vi.fn(),
  adminUpdateUserPlan: vi.fn(),
  updateUserRole: vi.fn(),
  updateUserPermission: vi.fn(),
  deleteUser: vi.fn(),
  markUserAsRead: vi.fn(),
  fetchAllProfiles: vi.fn(),
}));
vi.mock('../../services/userService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/userService')>();
  return { ...actual, ...svc };
});

import { AdminView } from '../../components/views/AdminView';

function user(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'u1',
    email: 'u1@x.com',
    displayName: 'User One',
    photoURL: '',
    role: 'user',
    createdAt: '2026-09-01T00:00:00Z',
    isNew: false,
    hasPermission: true,
    usageCount: 2,
    effectiveUsageCount: 2,
    monthlyAnalyticsLimit: null,
    monthlyAnalyticsLimitCustom: false,
    usageMonth: '2026-09-01',
    plan: 'free',
    planExpiresAt: null,
    quotaResetDay: 1,
    ...overrides,
  };
}

// Pre-fix builds hardcoded these Vietnamese labels; match both so RED runs fail on behavior, not text.
const EDIT_BUTTON = /adminEditUserButton|Chỉnh sửa ▾/;
const SAVE_BUTTON = /adminSaveChanges|Lưu thay đổi/;
const MODAL_TITLE = /adminEditUserTitle|Chỉnh sửa người dùng/;

async function renderView() {
  const utils = render(<AdminView />);
  await act(async () => {
    await Promise.resolve();
  });
  return utils;
}

function openModal() {
  fireEvent.click(screen.getByText(EDIT_BUTTON));
  return screen.getByText(MODAL_TITLE).parentElement as HTMLElement;
}

describe('AdminView', () => {
  beforeEach(() => {
    Object.values(svc).forEach((fn) => fn.mockReset());
    svc.updateUserMonthlyAnalyticsLimit.mockResolvedValue(undefined);
    svc.adminUpdateUserPlan.mockResolvedValue(undefined);
    svc.updateUserRole.mockResolvedValue(undefined);
    svc.deleteUser.mockResolvedValue(undefined);
    svc.fetchAllProfiles.mockResolvedValue([]);
    adminUsersState = { users: [user()] };
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('saves a custom monthly limit typed into the edit modal', async () => {
    await renderView();
    const modal = openModal();

    fireEvent.change(within(modal).getByRole('spinbutton'), { target: { value: '20' } });
    await act(async () => {
      fireEvent.click(within(modal).getByText(SAVE_BUTTON));
    });

    expect(svc.updateUserMonthlyAnalyticsLimit).toHaveBeenCalledWith('u1', 20);
  });

  it('keeps the modal open and shows the error when saving the plan fails', async () => {
    svc.adminUpdateUserPlan.mockRejectedValue(new Error('rpc exploded'));
    await renderView();
    const modal = openModal();

    fireEvent.click(within(modal).getByText('adminPlanGrantPro30'));
    await act(async () => {
      fireEvent.click(within(modal).getByText(SAVE_BUTTON));
    });

    expect(screen.queryByText(MODAL_TITLE)).not.toBeNull();
    expect(screen.queryByText(/rpc exploded/)).not.toBeNull();
  });

  it('asks for confirmation before changing a role, and does nothing if declined', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await renderView();

    await act(async () => {
      fireEvent.click(screen.getByTitle('adminToggleRole'));
    });

    expect(window.confirm).toHaveBeenCalled();
    expect(svc.updateUserRole).not.toHaveBeenCalled();
  });

  it('shows the error when a permission toggle fails', async () => {
    svc.updateUserPermission.mockRejectedValue(new Error('permission write denied'));
    await renderView();

    await act(async () => {
      fireEvent.click(screen.getByTitle('adminLock'));
    });

    expect(screen.queryByText(/permission write denied/)).not.toBeNull();
  });

  it('does not offer delete for admin accounts', async () => {
    adminUsersState = { users: [user({ id: 'a2', email: 'a2@x.com', role: 'admin' })] };
    await renderView();

    expect(screen.queryByTitle('adminDelete')).toBeNull();
  });

  it('re-fetches the full-table snapshot while filtering when profiles change', async () => {
    const { rerender } = await renderView();

    fireEvent.change(screen.getByPlaceholderText('adminSearchPlaceholder'), { target: { value: 'u1' } });
    await act(async () => {
      await Promise.resolve();
    });
    expect(svc.fetchAllProfiles).toHaveBeenCalledTimes(1);

    // Realtime refresh in useAdminUsers hands back a new array.
    adminUsersState = { users: [user({ effectiveUsageCount: 3 })] };
    rerender(<AdminView />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(svc.fetchAllProfiles).toHaveBeenCalledTimes(2);
  });
});
