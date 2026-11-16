import { describe, expect, it, vi } from 'vitest';

const update = vi.fn();
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({ update: (fields: unknown) => { update(fields); return { eq: async () => ({ error: null }) }; } }),
  },
}));

import { updateCandidateStatus } from '../../services/recruiterService';
import { withTimeout } from '../../lib/withTimeout';

describe('M2-D2 F2: updateCandidateStatus', () => {
  it('writes the error to error_message and never touches parsed_text', async () => {
    await updateCandidateStatus('c1', 'error', 'Lỗi phân tích');
    expect(update).toHaveBeenLastCalledWith({ status: 'error', error_message: 'Lỗi phân tích' });
  });
  it('clears a stale error when the candidate starts analyzing', async () => {
    await updateCandidateStatus('c1', 'analyzing');
    expect(update).toHaveBeenLastCalledWith({ status: 'analyzing', error_message: null });
  });
});

describe('withTimeout', () => {
  it('rejects a hung promise after the bound', async () => {
    vi.useFakeTimers();
    const p = withTimeout(new Promise(() => {}), 6_000, 'Session lookup');
    const assertion = expect(p).rejects.toThrow('Session lookup timed out');
    await vi.advanceTimersByTimeAsync(6_000);
    await assertion;
    vi.useRealTimers();
  });
  it('passes a settled value through', async () => {
    await expect(withTimeout(Promise.resolve(1), 10, 'x')).resolves.toBe(1);
  });
});
