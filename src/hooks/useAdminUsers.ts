import { useState, useEffect, useCallback } from 'react';
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

  const fetchPage = useCallback(async (pageIndex: number, replace: boolean) => {
    setIsLoading(true);
    const from = pageIndex * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      console.error('useAdminUsers fetchPage error:', error);
      setIsLoading(false);
      return;
    }

    const mapped = (data ?? []).map(mapProfile);
    setUsers(prev => (replace ? mapped : [...prev, ...mapped]));
    setHasMore(mapped.length === PAGE_SIZE);
    setIsLoading(false);
  }, []);

  const refresh = useCallback(() => {
    setPage(0);
    fetchPage(0, true);
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (isLoading || !hasMore) return;
    const next = page + 1;
    setPage(next);
    fetchPage(next, false);
  }, [isLoading, hasMore, page, fetchPage]);

  useEffect(() => {
    fetchPage(0, true);

    const channel = supabase
      .channel('admin_users_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, refresh)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { users, isLoading, hasMore, loadMore, refresh };
}
