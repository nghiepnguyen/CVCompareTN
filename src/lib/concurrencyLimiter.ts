/**
 * Minimal async concurrency limiter for background work.
 *
 * The first `limit` tasks start immediately; the rest queue FIFO. A task's
 * slot is released even when it throws, so one failure cannot stall the queue.
 */
export function createConcurrencyLimiter(limit: number) {
  if (!Number.isFinite(limit) || limit < 1) throw new Error('limit must be >= 1');
  let active = 0;
  const queue: Array<() => void> = [];

  const pump = () => {
    while (active < limit && queue.length > 0) {
      const start = queue.shift()!;
      active++;
      start();
    }
  };

  return function run<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push(() => {
        let taskPromise: Promise<T>;
        try {
          // Start immediately when a slot is available. The try/catch only
          // protects the slot from a synchronous throw.
          taskPromise = task();
        } catch (err) {
          active--;
          reject(err);
          pump();
          return;
        }
        taskPromise
          .then(resolve, reject)
          .finally(() => {
            active--;
            pump();
          });
      });
      pump();
    });
  };
}
