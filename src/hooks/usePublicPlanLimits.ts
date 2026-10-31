import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  fetchPublicPlanLimits,
  getCachedPublicPlanLimits,
} from '../services/publicPlanLimitsService';
import type { PublicPlanLimits } from '../services/publicPlanLimitsService';

/**
 * Shared public plan limits for the landing pricing table and the upgrade page.
 * Fetches once per session (module cache) and refreshes on tab focus so an
 * admin's global-limit change is reflected without a full reload.
 */
export function usePublicPlanLimits() {
  const { isSupabaseConfigured } = useAuth();
  const [limits, setLimits] = useState<PublicPlanLimits | null>(getCachedPublicPlanLimits);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  const retry = useCallback(() => setReload((value) => value + 1), []);

  useEffect(() => {
    if (isSupabaseConfigured !== true) {
      if (isSupabaseConfigured === false) {
        setIsLoading(false);
        setError(true);
      }
      return;
    }
    let active = true;
    let requestId = 0;
    const load = (force: boolean) => {
      const currentRequest = ++requestId;
      setIsLoading(true);
      setError(false);
      void fetchPublicPlanLimits(force)
        .then((next) => {
          if (active && currentRequest === requestId) setLimits(next);
        })
        .catch((err: unknown) => {
          if (active && currentRequest === requestId) setError(true);
          console.error('Failed to load public plan limits:', err);
        })
        .finally(() => {
          if (active && currentRequest === requestId) setIsLoading(false);
        });
    };

    load(true);
    const onFocus = () => load(true);
    window.addEventListener('focus', onFocus);
    return () => {
      active = false;
      window.removeEventListener('focus', onFocus);
    };
  }, [isSupabaseConfigured, reload]);

  return { limits, isLoading, error, retry };
}
