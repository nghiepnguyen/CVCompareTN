import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { mapProfile } from '../services/userService';
import type { UserProfile } from '../services/userService';

const PAGE_SIZE = 50;

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

    const channel = supabase
      .channel('admin_users_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, refresh)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  return { users, isLoading, hasMore, loadMore, refresh };
}
