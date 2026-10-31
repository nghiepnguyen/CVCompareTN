import { useEffect, useState } from 'react';
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
export function usePublicPlanLimits(): PublicPlanLimits {
  const [limits, setLimits] = useState<PublicPlanLimits>(getCachedPublicPlanLimits());

  useEffect(() => {
    let active = true;
    const load = (force: boolean) => {
      void fetchPublicPlanLimits(force)
        .then((next) => { if (active) setLimits(next); })
        .catch((err: unknown) => {
          // Keep the cached/default value; a transient RPC failure must not
          // change the advertised quota back to a hardcoded number.
          console.error('Failed to load public plan limits:', err);
        });
    };

    load(true);
    const onFocus = () => load(true);
    window.addEventListener('focus', onFocus);
    return () => {
      active = false;
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  return limits;
}
