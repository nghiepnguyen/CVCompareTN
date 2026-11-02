import React from 'react';
import { captureException } from '../../../lib/sentry';
import { isDefiniteRejection, trackerErrorCode, type MutationResult } from '../../../services/applicationService';
import type { TrackerErrorCode } from '../../../services/applicationTypes';

// One idempotency key per user intent (scope = action + application). Module
// scope, not component state: a dialog/view remount must not turn a retry after
// an uncertain failure into a new intent. Cleared on success, on a definite
// server rejection (nothing committed) and on explicit cancel. Page reload clears it.
const intents = new Map<string, string>();

export function intentKey(scope: string): string {
  let key = intents.get(scope);
  if (!key) {
    key = crypto.randomUUID();
    intents.set(scope, key);
  }
  return key;
}

export const clearIntent = (scope: string) => { intents.delete(scope); };

/**
 * Runs one tracker mutation for `scope`. Double clicks are dropped (ref, not
 * state: two clicks in one tick both see the old state). Only the error code
 * reaches Sentry: never note text or field values.
 */
export function useTrackerMutation(scope: string, onSettled: () => void) {
  const inFlight = React.useRef(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<TrackerErrorCode | null>(null);

  const run = async (fn: (idempotencyKey: string) => Promise<MutationResult>): Promise<MutationResult | null> => {
    if (inFlight.current) return null;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await fn(intentKey(scope));
      clearIntent(scope);
      onSettled();
      return result;
    } catch (err) {
      const code = trackerErrorCode(err);
      if (isDefiniteRejection(code)) clearIntent(scope);
      if (code === 'unknown') captureException(new Error('application tracker mutation failed'), { tags: { feature: 'application_tracker' } });
      setError(code);
      // Someone else changed it: show the fresh state.
      if (code === 'stale_status') onSettled();
      return null;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const cancel = () => {
    clearIntent(scope);
    setError(null);
  };

  return { run, busy, error, cancel };
}
