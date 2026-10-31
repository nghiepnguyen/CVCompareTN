// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { AdminUsersPage, AdminUsersQuery, UserProfile } from '../../services/userService';

let realtimeHandler: (() => void) | null = null;
let fetchCalls: AdminUsersQuery[] = [];
let fetchImpl: (query: AdminUsersQuery) => Promise<AdminUsersPage>;

vi.mock('../../services/userService', () => ({
  fetchAdminUsersPage: (query: AdminUsersQuery) => {
    fetchCalls.push(query);
    return fetchImpl(query);
  },
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    channel: () => {
      const ch = {
        on: (_evt: string, _filter: unknown, cb: () => void) => {
          realtimeHandler = cb;
          return ch;
        },
        subscribe: () => ch,
      };
      return ch;
    },
    removeChannel: vi.fn(),
  },
}));

import { useAdminUsers } from '../../hooks/useAdminUsers';

const QUERY: AdminUsersQuery = {
  search: '',
  plan: 'all',
  role: 'all',
  status: 'all',
  flag: 'all',
  sort: 'created_desc',
  page: 1,
  pageSize: 20,
};

function profile(id: string): UserProfile {
  return {
    id,
    email: `${id}@x.com`,
    displayName: id,
    photoURL: '',
    role: 'user',
    createdAt: '2026-09-01T00:00:00Z',
    isNew: false,
    hasPermission: true,
    usageCount: 0,
    effectiveUsageCount: 0,
    monthlyAnalyticsLimit: null,
    monthlyAnalyticsLimitCustom: false,
    usageMonth: '2026-09-01',
    plan: 'free',
    planExpiresAt: null,
    quotaResetDay: 1,
  };
}

function page(rows: UserProfile[], total = rows.length): AdminUsersPage {
  return { rows, total, newUsersCount: 0, newUsers: [] };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('useAdminUsers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fetchCalls = [];
    realtimeHandler = null;
    fetchImpl = async (query) => {
      const rows = [profile(`u${query.page}`)];
      return page(rows, 120);
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('passes the server query through and exposes total/new-user data', async () => {
    fetchImpl = async () => ({
      rows: [profile('u1'), profile('u2')],
      total: 120,
      newUsersCount: 3,
      newUsers: [profile('new')],
    });

    const { result } = renderHook(() => useAdminUsers(QUERY));
    await flush();

    expect(fetchCalls).toEqual([QUERY]);
    expect(result.current.users).toHaveLength(2);
    expect(result.current.totalCount).toBe(120);
    expect(result.current.newUsersCount).toBe(3);
    expect(result.current.newUsers).toHaveLength(1);
  });

  it('refetches when a filter/page changes and keeps the latest result', async () => {
    const { result, rerender } = renderHook(({ query }) => useAdminUsers(query), {
      initialProps: { query: QUERY },
    });
    await flush();

    const next = { ...QUERY, page: 2, search: 'bob' };
    rerender({ query: next });
    await flush();

    expect(fetchCalls.at(-1)).toEqual(next);
    expect(result.current.users[0].id).toBe('u2');
  });

  it('coalesces a burst of realtime events into a single re-fetch', async () => {
    renderHook(() => useAdminUsers(QUERY));
    await flush();
    fetchCalls = [];

    act(() => {
      for (let i = 0; i < 10; i++) realtimeHandler?.();
    });
    expect(fetchCalls).toHaveLength(0);

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(fetchCalls).toEqual([QUERY]);
  });

  it('re-fetches periodically and when the tab becomes visible again', async () => {
    renderHook(() => useAdminUsers(QUERY));
    await flush();
    fetchCalls = [];

    await act(async () => {
      vi.advanceTimersByTime(5 * 60 * 1000);
    });
    expect(fetchCalls).toHaveLength(1);

    fetchCalls = [];
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(fetchCalls).toHaveLength(1);
  });

  it('exposes the fetch error', async () => {
    fetchImpl = async () => {
      throw new Error('rpc failed');
    };

    const { result } = renderHook(() => useAdminUsers(QUERY));
    await flush();

    expect(result.current.error).toBe('rpc failed');
  });

  it('stops timers and listeners on unmount', async () => {
    const { unmount } = renderHook(() => useAdminUsers(QUERY));
    await flush();
    unmount();
    fetchCalls = [];

    await act(async () => {
      realtimeHandler?.();
      document.dispatchEvent(new Event('visibilitychange'));
      vi.advanceTimersByTime(10 * 60 * 1000);
    });
    expect(fetchCalls).toHaveLength(0);
  });
});
