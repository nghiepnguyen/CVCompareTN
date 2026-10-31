import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchAdminAuditPage } from '../services/adminAuditService';
import type { AdminAuditPage, AdminAuditQuery } from '../services/adminAuditService';

export interface AdminAuditState {
  rows: AdminAuditPage['rows'];
  total: number | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useAdminAudit(query: AdminAuditQuery): AdminAuditState {
  const [rows, setRows] = useState<AdminAuditPage['rows']>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryRef = useRef(query);
  queryRef.current = query;
  const seqRef = useRef(0);
  const inflightRef = useRef(0);

  const refresh = useCallback(async () => {
    const seq = ++seqRef.current;
    inflightRef.current += 1;
    setIsLoading(true);
    try {
      const page = await fetchAdminAuditPage(queryRef.current);
      if (seq !== seqRef.current) return;
      setRows(page.rows);
      setTotal(page.total);
      setError(null);
    } catch (err) {
      if (seq === seqRef.current) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      inflightRef.current = Math.max(0, inflightRef.current - 1);
      if (inflightRef.current === 0) setIsLoading(false);
    }
  }, []);

  const { action, search, page, pageSize } = query;
  useEffect(() => {
    void refresh();
  }, [action, search, page, pageSize, refresh]);

  return { rows, total, isLoading, error, refresh };
}
