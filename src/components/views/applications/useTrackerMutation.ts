import React from 'react';
import { captureException } from '../../../lib/sentry';
import { isDefiniteRejection, trackerErrorCode, type MutationResult } from '../../../services/applicationService';
import type { TrackerErrorCode } from '../../../services/applicationTypes';

// One idempotency key per user intent (scope = action + application). Module
// scope, not component state: a dialog/view remount must not turn a retry after
// an uncertain failure into a new intent. Cleared on success, on a definite
// server rejection (nothing committed) and on explicit cancel (unless held, below).
// Preserving scopes also hold the exact values sent (`args`) while the request is in
// flight and after an unknown outcome, so a reopened form shows them locked and a retry
// resends them under the same key. Memory only, never sessionStorage/localStorage
// (it holds private note text): a page reload ends the intent.
type Intent = { key: string; phase?: 'in_flight' | 'unresolved'; args?: unknown };
const intents = new Map<string, Intent>();
// Settles can land after the submitting form unmounted: mounted forms re-render on change.
const listeners = new Set<() => void>();
let version = 0;
const changed = () => { version += 1; listeners.forEach((l) => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const useIntentsVersion = () => React.useSyncExternalStore(subscribe, () => version);

export function intentKey(scope: string): string {
  let intent = intents.get(scope);
  if (!intent) {
    intent = { key: crypto.randomUUID() };
    intents.set(scope, intent);
  }
  return intent.key;
}

export const clearIntent = (scope: string) => { if (intents.delete(scope)) changed(); };
export const resetIntents = () => { intents.clear(); settles.clear(); changed(); };
export const hasUnresolvedIntent = (scope: string) => intents.get(scope)?.phase === 'unresolved';
// Last settle per scope, so a form mounted elsewhere (e.g. after the detail view remounted)
// can react to a request whose own form and callbacks are gone.
type Settle = { id: number; result?: MutationResult; recovered?: boolean; code?: TrackerErrorCode };
const settles = new Map<string, Settle>();
let settleSeq = 0;
const recordSettle = (scope: string, s: Omit<Settle, 'id'>) => { settleSeq += 1; settles.set(scope, { id: settleSeq, ...s }); return settleSeq; };
const reloadCodes: TrackerErrorCode[] = ['stale_status', 'stale_application', 'contact_not_allowed'];
const hold = (scope: string, phase: Intent['phase'], args: unknown) => {
  const intent = intents.get(scope);
  if (intent) { intent.phase = phase; intent.args = args; changed(); }
};

/**
 * Runs one tracker mutation for `scope`. Double clicks are dropped (ref, not
 * state: two clicks in one tick both see the old state). Only the error code
 * reaches Sentry: never note text or field values.
 *
 * `preserveUnknown` (non-CAS scopes only): the sent `args` are held while in flight
 * (`confirming` for any other mounted form) and after an unknown outcome (`unresolved`);
 * cancel then keeps the intent, only `abandon` drops an unresolved one.
 * `onSettled(result, true)` = a retry of an unresolved intent was a server replay.
 * A mounted form that did not submit reacts when its scope leaves in_flight: success →
 * its own onSettled + `onClose`, rejection → its own error, unknown → unresolved mode.
 */
export function useTrackerMutation<A = undefined>(
  scope: string,
  onSettled: (result?: MutationResult, recovered?: boolean) => void,
  { preserveUnknown = false, onClose }: { preserveUnknown?: boolean; onClose?: () => void } = {},
) {
  const inFlight = React.useRef(false);
  const ownSettle = React.useRef(0);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<TrackerErrorCode | null>(null);
  useIntentsVersion();
  const held = preserveUnknown ? intents.get(scope) : undefined;
  const unresolved = held?.phase === 'unresolved' ? held.args as A : undefined;
  // Whatever is held is what was (or is being) sent: always show that, locked.
  const pending = held?.phase ? held.args as A : undefined;
  // Another form instance's request for this scope is in flight: show it locked, never resend under its key.
  const confirming = held?.phase === 'in_flight' && !busy ? held.args as A : undefined;

  const run = async (fn: (idempotencyKey: string) => Promise<MutationResult>, args?: A): Promise<MutationResult | null> => {
    if (inFlight.current) return null;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    const wasUnresolved = hasUnresolvedIntent(scope);
    try {
      const key = intentKey(scope);
      if (preserveUnknown) hold(scope, 'in_flight', args);
      const result = await fn(key);
      const recovered = preserveUnknown && result.replayed && wasUnresolved;
      if (preserveUnknown) ownSettle.current = recordSettle(scope, { result, recovered });
      clearIntent(scope);
      onSettled(result, recovered);
      return result;
    } catch (err) {
      const code = trackerErrorCode(err);
      if (preserveUnknown) ownSettle.current = recordSettle(scope, { code });
      if (isDefiniteRejection(code)) clearIntent(scope);
      else if (preserveUnknown) hold(scope, 'unresolved', args);
      if (code === 'unknown') captureException(new Error('application tracker mutation failed'), { tags: { feature: 'application_tracker' } });
      setError(code);
      // Someone else changed it: show the fresh state. A stale intent is rejected (key
      // already cleared above); the user's next save after reviewing is a new intent.
      if (reloadCodes.includes(code)) onSettled();
      return null;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  // Another instance's request for this scope settled (its callbacks may belong to an unmounted view).
  const phase = held?.phase;
  const prevPhase = React.useRef(phase);
  React.useEffect(() => {
    const was = prevPhase.current;
    prevPhase.current = phase;
    if (was !== 'in_flight' || phase === 'in_flight') return;
    const s = settles.get(scope);
    if (!s || s.id === ownSettle.current) return;
    ownSettle.current = s.id;
    if (s.code) {
      setError(s.code);
      if (reloadCodes.includes(s.code)) onSettled();
    } else {
      onSettled(s.result, s.recovered);
      onClose?.();
    }
  });

  // While held (in flight or unresolved), Cancel = Close: the request may have committed (the late result decides).
  const cancel = () => {
    if (!held?.phase) clearIntent(scope);
    setError(null);
  };

  // User confirmed: forget the unknown outcome; the next submit is a new intent.
  const abandon = () => {
    clearIntent(scope);
    setError(null);
  };

  return { run, busy, error, cancel, unresolved, confirming, pending, abandon };
}
