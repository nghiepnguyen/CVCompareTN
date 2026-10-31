import { describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/react', () => ({ init: vi.fn() }));

import { isFastRefreshArtifact } from '../sentry';

type Frame = { filename?: string; abs_path?: string };
type Event = Parameters<typeof isFastRefreshArtifact>[0];

const eventWith = (frames: Frame[] | undefined) =>
  ({ exception: frames ? { values: [{ stacktrace: { frames } }] } : undefined }) as unknown as Event;

describe('isFastRefreshArtifact', () => {
  it('drops a dev error whose stack goes through the HMR runtime', () => {
    const event = eventWith([
      { filename: 'http://localhost:3000/src/context/UIContext.tsx' },
      { filename: 'http://localhost:3000/@react-refresh' },
    ]);
    expect(isFastRefreshArtifact(event, true)).toBe(true);
  });

  it('matches the abs_path fallback used by some frames', () => {
    const event = eventWith([{ abs_path: 'http://localhost:3000/@react-refresh' }]);
    expect(isFastRefreshArtifact(event, true)).toBe(true);
  });

  it('keeps the same event outside dev, where HMR does not exist', () => {
    const event = eventWith([{ filename: 'http://localhost:3000/@react-refresh' }]);
    expect(isFastRefreshArtifact(event, false)).toBe(false);
  });

  it('keeps ordinary app errors', () => {
    const event = eventWith([{ filename: 'https://cvfit.pro/assets/index-abc123.js' }]);
    expect(isFastRefreshArtifact(event, true)).toBe(false);
  });

  it('keeps events without a stack trace', () => {
    expect(isFastRefreshArtifact(eventWith(undefined), true)).toBe(false);
  });
});
