// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const rangeCalls: Array<[number, number]> = [];
let realtimeHandler: (() => void) | null = null;
let totalInDb = 120;

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: () => ({
          range: (from: number, to: number) => {
            rangeCalls.push([from, to]);
            const rows = Array.from({ length: to - from + 1 }, (_, i) => ({
              id: `u${from + i}`,
              email: `u${from + i}@x.com`,
              created_at: '2026-09-01T00:00:00Z',
              usage_count: 0,
              effective_usage_count: 0,
            }));
            return Promise.resolve({ data: rows, error: null, count: totalInDb });
          },
        }),
      }),
    }),
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

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('useAdminUsers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    rangeCalls.length = 0;
    realtimeHandler = null;
    totalInDb = 120;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('exposes the real DB total, not just the loaded window', async () => {
    const { result } = renderHook(() => useAdminUsers());
    await flush();

    expect(result.current.users).toHaveLength(50);
    expect(result.current.totalCount).toBe(120);
  });

  it('coalesces a burst of realtime events into a single re-fetch', async () => {
    renderHook(() => useAdminUsers());
    await flush();
    rangeCalls.length = 0;

    act(() => {
      for (let i = 0; i < 10; i++) realtimeHandler?.();
    });
    expect(rangeCalls).toHaveLength(0);

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(rangeCalls).toEqual([[0, 49]]);
  });

  it('re-fetches periodically so time-based quota rollover shows without a row write', async () => {
    renderHook(() => useAdminUsers());
    await flush();
    rangeCalls.length = 0;

    await act(async () => {
      vi.advanceTimersByTime(5 * 60 * 1000);
    });
    expect(rangeCalls).toEqual([[0, 49]]);
  });

  it('re-fetches when the tab becomes visible again', async () => {
    renderHook(() => useAdminUsers());
    await flush();
    rangeCalls.length = 0;

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(rangeCalls).toEqual([[0, 49]]);
  });

  it('stops timers and listeners on unmount', async () => {
    const { unmount } = renderHook(() => useAdminUsers());
    await flush();
    unmount();
    rangeCalls.length = 0;

    await act(async () => {
      realtimeHandler?.();
      document.dispatchEvent(new Event('visibilitychange'));
      vi.advanceTimersByTime(10 * 60 * 1000);
    });
    expect(rangeCalls).toHaveLength(0);
  });
});
