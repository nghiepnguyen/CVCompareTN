import { afterEach, expect, it, vi } from 'vitest';

const rows = vi.hoisted(() => [{
  id: 'row-1', analysis_id: 'analysis-1', timestamp: '2026-10-15T00:00:00Z',
  parsed_cv: {
    work_experience: [{ company: 'Acme', job_title: 'Engineer', duration: { start: '01/2020', end: 'Present', is_current: true } }],
    ats_evaluation: { years_of_experience: 6.8, relevant_score: 70, key_match_highlights: ['Legacy'] },
  },
}]);

vi.mock('../../lib/supabase', () => ({
  withAuthRetry: (fn: () => Promise<unknown>) => fn(),
  supabase: { from: () => {
    const query = {
      select: () => query, eq: () => query, order: () => query,
      limit: async () => ({ data: rows, error: null }),
    };
    return query;
  } },
}));

import { getUserHistory } from '../../services/historyService';
afterEach(() => vi.useRealTimers());

it.each(['2026-10-15T00:00:00Z', '2027-04-15T00:00:00Z'])('preserves experience through the history loading path at %s', async instant => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(instant));
  const [result] = await getUserHistory('user-1', 'pro');
  expect(result.parsedCV!.ats_evaluation).toEqual(rows[0].parsed_cv.ats_evaluation);
});
