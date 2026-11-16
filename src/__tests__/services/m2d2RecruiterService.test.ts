import { beforeEach, describe, expect, it, vi } from 'vitest';

const update = vi.fn();
const eqs: [string, unknown][] = [];
const rpc = vi.fn();
let updatedRows: unknown[] = [{ id: 'c1' }];
vi.mock('../../lib/supabase', () => {
  const chain = {
    eq: (col: string, val: unknown) => { eqs.push([col, val]); return chain; },
    select: async () => ({ data: updatedRows, error: null }),
  };
  return {
    supabase: {
      from: () => ({ update: (fields: unknown) => { update(fields); return chain; } }),
      rpc: (...args: unknown[]) => rpc(...args),
      auth: { getSession: async () => ({ data: { session: { access_token: 't' } } }) },
    },
  };
});

import { claimCandidateAnalysis, releaseCandidateAnalysis, saveCandidateAnalysis } from '../../services/recruiterService';
import { withTimeout } from '../../lib/withTimeout';

describe('M2-D3 releaseCandidateAnalysis (M2-D2 F2 kept)', () => {
  beforeEach(() => { update.mockClear(); eqs.length = 0; updatedRows = [{ id: 'c1' }]; });
  it('writes the error to error_message, never parsed_text, fenced by attempt and status', async () => {
    await expect(releaseCandidateAnalysis('c1', 'a1', 'Lỗi phân tích')).resolves.toBe(true);
    expect(update).toHaveBeenLastCalledWith({ status: 'error', error_message: 'Lỗi phân tích' });
    expect(eqs).toEqual([['id', 'c1'], ['analysis_attempt_id', 'a1'], ['status', 'analyzing']]);
  });
  it('reports a no-op when another attempt owns the row', async () => {
    updatedRows = [];
    await expect(releaseCandidateAnalysis('c1', 'old', 'x')).resolves.toBe(false);
  });
});

describe('M2-D3 claimCandidateAnalysis', () => {
  it.each([
    [{ result: 'claimed', started_at: 's', recovered: null }, { result: 'claimed', startedAt: 's', recovered: null }],
    [{ result: 'active', started_at: 's' }, { result: 'active', startedAt: 's' }],
    [{ result: 'needs_confirm', reason: 'paid_result_lost' }, { result: 'needs_confirm', reason: 'paid_result_lost' }],
    [{ result: 'done' }, { result: 'done' }],
  ])('maps %o', async (data, expected) => {
    rpc.mockResolvedValueOnce({ data, error: null });
    await expect(claimCandidateAnalysis('c1', 'a1', true)).resolves.toEqual(expected);
    expect(rpc).toHaveBeenLastCalledWith('claim_candidate_analysis', { p_candidate_id: 'c1', p_attempt_id: 'a1', p_confirm_charge: true });
  });
  it('throws on an RPC error or unknown result (caller then skips the candidate)', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'x' } });
    await expect(claimCandidateAnalysis('c1', 'a1')).rejects.toBeTruthy();
    rpc.mockResolvedValueOnce({ data: { result: 'weird' }, error: null });
    await expect(claimCandidateAnalysis('c1', 'a1')).rejects.toThrow('Unexpected claim result');
  });
});

describe('M2-D3 saveCandidateAnalysis', () => {
  it('sends the attempt id and maps 409 to superseded', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('{}', { status: 409 }));
    await expect(saveCandidateAnalysis('c1', { a: 1 }, 70, 'a1')).resolves.toBe('superseded');
    expect(JSON.parse(String(fetchSpy.mock.calls[0][1]?.body))).toMatchObject({ candidateId: 'c1', attemptId: 'a1', matchScore: 70 });
    fetchSpy.mockResolvedValueOnce(new Response('{}', { status: 200 }));
    await expect(saveCandidateAnalysis('c1', { a: 1 }, 70, 'a1')).resolves.toBe('saved');
    fetchSpy.mockResolvedValueOnce(new Response('{"error":"boom"}', { status: 500 }));
    await expect(saveCandidateAnalysis('c1', { a: 1 }, 70, 'a1')).rejects.toThrow('boom');
    fetchSpy.mockRestore();
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
