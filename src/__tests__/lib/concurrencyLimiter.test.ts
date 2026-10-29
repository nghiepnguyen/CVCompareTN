import { describe, expect, it } from 'vitest';
import { createConcurrencyLimiter } from '../../lib/concurrencyLimiter';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => (resolve = res));
  return { promise, resolve };
}

describe('createConcurrencyLimiter', () => {
  it('starts immediately, caps active work, and drains the queue', async () => {
    const limit = createConcurrencyLimiter(2);
    const gates = [deferred(), deferred(), deferred(), deferred()];
    let active = 0;
    let maxActive = 0;

    const runs = gates.map((gate) =>
      limit(async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await gate.promise;
        active--;
      })
    );

    expect(maxActive).toBe(2);
    gates[0].resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(maxActive).toBe(2);

    gates.slice(1).forEach((gate) => gate.resolve());
    await Promise.all(runs);
    expect(active).toBe(0);
  });

  it('releases the slot when a task rejects and continues the queue', async () => {
    const limit = createConcurrencyLimiter(1);
    const failed = limit(async () => {
      throw new Error('boom');
    });
    const after = limit(async () => 'ok');

    await expect(failed).rejects.toThrow('boom');
    await expect(after).resolves.toBe('ok');
  });

  it('rejects an invalid limit', () => {
    expect(() => createConcurrencyLimiter(0)).toThrow('limit must be >= 1');
  });
});
