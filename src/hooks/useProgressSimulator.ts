export interface ProgressSimulatorOptions {
  from: number;
  to: number;
  durationMs: number;
  steps?: number;
  onProgress: (value: number) => void;
}

/**
 * Creates a smooth ease-out progress simulator.
 *
 * Calls `onProgress` at regular intervals, updating the value from `from`
 * to `to` over `durationMs`. Returns a `stop` function that cancels the
 * interval immediately.
 *
 * Extracted from AnalysisRunContext so the progress logic can be tested
 * in isolation.
 */
export function createProgressSimulator(
  options: ProgressSimulatorOptions,
): { stop: () => void } {
  const { from, to, durationMs, steps = 30, onProgress } = options;

  const stepMs = Math.round(durationMs / steps);
  let step = 0;

  const intervalId = setInterval(() => {
    step++;
    const t = step / steps;
    // ease-out quadratic
    const eased = 1 - Math.pow(1 - t, 2);
    const current = from + (to - from) * eased;
    onProgress(Math.min(to, Math.round(current)));

    if (step >= steps) {
      clearInterval(intervalId);
    }
  }, stepMs);

  return {
    stop() {
      clearInterval(intervalId);
    },
  };
}