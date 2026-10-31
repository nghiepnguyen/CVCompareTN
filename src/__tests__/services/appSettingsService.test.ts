import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: { getSession: () => Promise.resolve({ data: { session: { access_token: 'tok' } } }) },
  },
}));

import { updateDefaultMonthlyAnalyticsLimit } from '../../services/appSettingsService';

describe('updateDefaultMonthlyAnalyticsLimit', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('writes through the admin API, not a direct app_settings upsert', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    await updateDefaultMonthlyAnalyticsLimit(12);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/update-global-limit',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer tok' }),
        body: JSON.stringify({
          p_key: 'default_monthly_analytics_limit',
          p_value: 12,
        }),
      })
    );
  });

  it('rejects invalid values before calling the API', async () => {
    await expect(updateDefaultMonthlyAnalyticsLimit(-1)).rejects.toThrow(
      'Invalid default monthly analytics limit'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
