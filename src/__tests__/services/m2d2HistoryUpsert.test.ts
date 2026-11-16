import { describe, expect, it, vi } from 'vitest';

const upsert = vi.fn(async () => ({ error: null }));
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      upsert,
      select: () => ({ eq: () => ({ order: async () => ({ data: [] }) }) }),
    }),
  },
}));

import { saveToHistory } from '../../services/historyService';

describe('M2-D2 F4: history save is idempotent per analysis', () => {
  it('upserts on (user_id, analysis_id) so a retried save updates instead of duplicating', async () => {
    await saveToHistory([{ id: 'a1', userId: 'u1', timestamp: 1, matchScore: 80 } as never], 'pro');
    expect(upsert).toHaveBeenCalledWith(
      [expect.objectContaining({ user_id: 'u1', analysis_id: 'a1' })],
      { onConflict: 'user_id,analysis_id' },
    );
  });
});
