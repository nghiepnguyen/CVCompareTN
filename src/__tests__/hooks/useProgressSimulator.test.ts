import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createProgressSimulator } from "../../hooks/useProgressSimulator";

describe("useProgressSimulator — createProgressSimulator", () => {
  let onProgress: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    onProgress = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls onProgress with starting value immediately on the first tick", () => {
    const { stop } = createProgressSimulator({
      from: 20,
      to: 80,
      durationMs: 9000,
      steps: 30,
      onProgress,
    });

    // Advance past the first interval (9_000 / 30 = 300ms)
    vi.advanceTimersByTime(300);
    expect(onProgress).toHaveBeenCalled();
  });

  it("calls onProgress with increasing values", () => {
    const { stop } = createProgressSimulator({
      from: 0,
      to: 100,
      durationMs: 5000,
      steps: 25,
      onProgress,
    });

    // Each step: 5000/25 = 200ms; advance 10 steps = 2000ms
    vi.advanceTimersByTime(2000);
    stop();

    const calls = onProgress.mock.calls.map((c) => c[0] as number);
    expect(calls.length).toBeGreaterThanOrEqual(10);
    // Values should be non-decreasing
    for (let i = 1; i < calls.length; i++) {
      expect(calls[i]).toBeGreaterThanOrEqual(calls[i - 1]);
    }
  });

  it("stops calling onProgress after stop() is invoked", () => {
    const { stop } = createProgressSimulator({
      from: 0,
      to: 100,
      durationMs: 3000,
      steps: 10,
      onProgress,
    });

    vi.advanceTimersByTime(600); // 2 steps
    stop();
    const callCountAfterStop = onProgress.mock.calls.length;

    vi.advanceTimersByTime(5000);
    // No more calls after stop
    expect(onProgress.mock.calls.length).toBe(callCountAfterStop);
  });

  it("does not exceed the target value", () => {
    const { stop } = createProgressSimulator({
      from: 80,
      to: 100,
      durationMs: 1000,
      steps: 20,
      onProgress,
    });

    // Advance well beyond completion
    vi.advanceTimersByTime(5000);
    stop();

    const maxCalled = Math.max(...onProgress.mock.calls.map((c) => c[0] as number));
    expect(maxCalled).toBeLessThanOrEqual(100);
  });

  it("eventually reaches or approaches the target value", () => {
    const { stop } = createProgressSimulator({
      from: 0,
      to: 100,
      durationMs: 2000,
      steps: 50,
      onProgress,
    });

    // Advance well past the total duration
    vi.advanceTimersByTime(5000);
    stop();

    const lastCalled = onProgress.mock.calls[onProgress.mock.calls.length - 1][0] as number;
    expect(lastCalled).toBe(100);
  });
});