// One wall-clock deadline per request, shared by every step (storage, Gemini,
// quota, telemetry) so they can never together outlive the request budget.
// Vercel's maxDuration (300s) is only a safety ceiling above this budget.

export const TOTAL_BUDGET_MS = 65_000;
// Kept free after the AI work for quota increment, telemetry and the response.
export const POST_RESERVE_MS = 6_000;
// Gemini is not started with less than this left on the AI deadline.
export const MIN_GEMINI_BUDGET_MS = 10_000;
// Whole budget for resolving one storage reference (DB lookup + HEAD + GET + body).
export const STORAGE_REF_TIMEOUT_MS = 15_000;

export type FailureCategory =
  | 'storage_timeout'
  | 'storage_error'
  | 'gemini_timeout'
  | 'gemini_error'
  | 'request_budget_exhausted';

// A failure with a stable category; `message` is safe to persist ("[category]").
export class ControlledError extends Error {
  constructor(readonly category: FailureCategory) {
    super(`[${category}]`);
  }
}

export type Deadline = {
  remainingMs(): number;
  isExpired(): boolean;
  // AbortSignal that fires when this deadline (or the shorter capMs) runs out.
  signal(capMs?: number): AbortSignal;
  // A deadline ending at min(this deadline, now + capMs).
  child(capMs: number): Deadline;
  // A deadline ending reserveMs before this one.
  reserve(reserveMs: number): Deadline;
};

function deadlineAt(end: number): Deadline {
  const remainingMs = () => Math.max(0, end - Date.now());
  return {
    remainingMs,
    isExpired: () => remainingMs() === 0,
    signal(capMs = Infinity) {
      const ms = Math.min(capMs, remainingMs());
      if (ms <= 0) return AbortSignal.abort(new DOMException('Deadline exceeded', 'TimeoutError'));
      // setTimeout (not AbortSignal.timeout) so fake timers can drive it in tests.
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException('Deadline exceeded', 'TimeoutError')), ms).unref?.();
      return controller.signal;
    },
    child: (capMs) => deadlineAt(Math.min(end, Date.now() + Math.max(0, capMs))),
    reserve: (reserveMs) => deadlineAt(end - reserveMs),
  };
}

export function createDeadline(totalMs: number): Deadline {
  return deadlineAt(Date.now() + Math.max(0, totalMs));
}

// Category for a failed AI call: the deadline/budget errors keep theirs.
export function aiFailureCategory(err: unknown): FailureCategory {
  if (err instanceof ControlledError) return err.category;
  return err instanceof Error && err.message.includes('(Timeout)') ? 'gemini_timeout' : 'gemini_error';
}

// Throws request_budget_exhausted when less than minMs is left.
export function assertBudget(deadline: Deadline, minMs: number): void {
  if (deadline.remainingMs() < minMs) throw new ControlledError('request_budget_exhausted');
}
