import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { fetchAdminUsersPage } from '../services/userService';
import type { AdminUsersQuery, UserProfile } from '../services/userService';

// Every analysis bumps a profiles row, so bursts of realtime events are normal —
// coalesce them into one re-fetch instead of one per event.
const REALTIME_DEBOUNCE_MS = 1000;
// effective_usage_count is time-dependent (quota cycle rollover / plan expiry)
// and changes without any row write, so no realtime event ever fires for it.
const PERIODIC_REFRESH_MS = 5 * 60 * 1000;

export interface AdminUsersState {
  users: UserProfile[];
  isLoading: boolean;
  /** Total profiles matching the current filters; null until first fetch. */
  totalCount: number | null;
  /** DB-wide new non-admin users (same definition as the Header badge). */
  newUsersCount: number;
  /** Up to 12 new users for the banner, independent of the current page. */
  newUsers: UserProfile[];
  /** Last list-fetch error; cleared by a successful refresh. */
  error: string | null;
  refresh: () => void;
  /** Optimistic local updates used after a successful row action. */
  applyUser: (id: string, patch: Partial<UserProfile>) => void;
  removeUser: (id: string) => void;
}

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function useAdminUsers(query: AdminUsersQuery): AdminUsersState {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [newUsersCount, setNewUsersCount] = useState(0);
  const [newUsers, setNewUsers] = useState<UserProfile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const usersRef = useRef<UserProfile[]>([]);
  usersRef.current = users;

  // The realtime/interval listeners are subscribed once but must always read
  // the latest filters/page.
  const queryRef = useRef(query);
  queryRef.current = query;

  // Every fetch gets a sequence number. A response only wins if no newer query
  // started meanwhile, so fast typing/filter changes cannot overwrite the
  // result of the latest query.
  const requestSeqRef = useRef(0);
  const inflightRef = useRef(0);

  const beginRequest = useCallback(() => {
    inflightRef.current += 1;
    setIsLoading(true);
  }, []);

  const endRequest = useCallback(() => {
    inflightRef.current = Math.max(0, inflightRef.current - 1);
    if (inflightRef.current === 0) setIsLoading(false);
  }, []);

  const refresh = useCallback(async () => {
    const seq = ++requestSeqRef.current;
    beginRequest();
    try {
      const result = await fetchAdminUsersPage(queryRef.current);
      if (seq !== requestSeqRef.current) return;

      setUsers(result.rows);
      setTotalCount(result.total);
      setNewUsersCount(result.newUsersCount);
      setNewUsers(result.newUsers);
      setError(null);
    } catch (err) {
      if (seq === requestSeqRef.current) setError(toErrorMessage(err));
    } finally {
      endRequest();
    }
  }, [beginRequest, endRequest]);

  // Re-fetch whenever a server-side query parameter changes. Search is
  // debounced by AdminView so each keystroke doesn't hit the RPC.
  const { search, plan, role, status, flag, sort, page, pageSize } = query;
  useEffect(() => {
    void refresh();
  }, [search, plan, role, status, flag, sort, page, pageSize, refresh]);

  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    // removeChannel is async — an in-flight event can still land after cleanup.
    let disposed = false;
    const scheduleRefresh = () => {
      if (disposed) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        void refresh();
      }, REALTIME_DEBOUNCE_MS);
    };

    const channel = supabase
      .channel('admin_users_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, scheduleRefresh)
      .subscribe();

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, PERIODIC_REFRESH_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      disposed = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  const applyUser = useCallback((id: string, patch: Partial<UserProfile>) => {
    setUsers((prev) => prev.map((user) => (user.id === id ? { ...user, ...patch } : user)));
    setNewUsers((prev) => prev.map((user) => (user.id === id ? { ...user, ...patch } : user)));
  }, []);

  const removeUser = useCallback((id: string) => {
    const removed = usersRef.current.find((user) => user.id === id);
    setUsers((prev) => prev.filter((user) => user.id !== id));
    setNewUsers((prev) => prev.filter((user) => user.id !== id));
    if (removed?.isNew && removed.role !== 'admin') {
      setNewUsersCount((count) => Math.max(0, count - 1));
    }
    setTotalCount((count) => (count === null ? count : Math.max(0, count - 1)));
  }, []);

  return {
    users,
    isLoading,
    totalCount,
    newUsersCount,
    newUsers,
    error,
    refresh,
    applyUser,
    removeUser,
  };
}
