import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { mapProfile } from '../services/userService';
import type { UserProfile } from '../services/userService';

const PAGE_SIZE = 50;
// Every analysis bumps a profiles row, so bursts of realtime events are normal —
// coalesce them into one re-fetch instead of one per event.
const REALTIME_DEBOUNCE_MS = 1000;
// effective_usage_count is time-dependent (quota cycle rollover / plan expiry)
// and changes without any row write, so no realtime event ever fires for it.
const PERIODIC_REFRESH_MS = 5 * 60 * 1000;

export interface AdminUsersState {
  users: UserProfile[];
  isLoading: boolean;
  hasMore: boolean;
  loadMore: () => void;
  refresh: () => void;
}

export function useAdminUsers(): AdminUsersState {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  // Realtime handler below is subscribed once and must always see the latest
  // loaded page count, not the value captured at subscribe time.
  const pageRef = useRef(0);
  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  const fetchRange = useCallback(async (from: number, to: number, replace: boolean) => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('*, effective_usage_count')
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      console.error('useAdminUsers fetchRange error:', error);
      setIsLoading(false);
      return;
    }

    const mapped = (data ?? []).map(mapProfile);
    setUsers(prev => (replace ? mapped : [...prev, ...mapped]));
    setHasMore(mapped.length === to - from + 1);
    setIsLoading(false);
  }, []);

  // Re-fetches every row already loaded (not just page 0), so a change to any
  // profile doesn't silently drop pages an admin has already paged into.
  const refresh = useCallback(() => {
    fetchRange(0, (pageRef.current + 1) * PAGE_SIZE - 1, true);
  }, [fetchRange]);

  const loadMore = useCallback(() => {
    if (isLoading || !hasMore) return;
    const next = page + 1;
    setPage(next);
    fetchRange(next * PAGE_SIZE, next * PAGE_SIZE + PAGE_SIZE - 1, false);
  }, [isLoading, hasMore, page, fetchRange]);

  useEffect(() => {
    fetchRange(0, PAGE_SIZE - 1, true);

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        refresh();
      }, REALTIME_DEBOUNCE_MS);
    };

    const channel = supabase
      .channel('admin_users_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, scheduleRefresh)
      .subscribe();

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, PERIODIC_REFRESH_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  return { users, isLoading, hasMore, loadMore, refresh };
}
