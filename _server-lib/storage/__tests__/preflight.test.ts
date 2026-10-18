import { expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('dotenv/config', () => ({}));
vi.mock('../../payment/supabaseAdmin.js', () => ({ getSupabaseAdmin: () => ({ from: () => ({ select: async () => ({ error: null, count: 0, status: 200 }) }), storage: { getBucket: async () => ({ data: { public: false }, error: null }) } }) }));
vi.mock('../r2.js', () => ({ r2Client: () => ({ send: mocks.send }), bucket: (kind: string) => kind }));
it('does not report a reachable bucket as unavailable when config inspection is denied', async () => {
  for (const key of ['R2_ACCOUNT_ID','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_TEMP_BUCKET','R2_CV_BUCKET','STORAGE_CLEANUP_SECRET']) vi.stubEnv(key, 'test');
  mocks.send.mockImplementation(async (command: object) => {
    if (command.constructor.name === 'HeadBucketCommand') return {};
    throw Object.assign(new Error('Denied'), { name: 'AccessDenied' });
  });
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  try {
    await import('../../../scripts/check-r2-storage.js');
    const report = JSON.parse(log.mock.calls[0][0]);
    expect(report.r2_temp.reachable).toBe(true);
    expect(report.r2_temp.cors.error).toBe('AccessDenied');
    expect(report.r2_temp.lifecycle.error).toBe('AccessDenied');
  } finally { log.mockRestore(); vi.unstubAllEnvs(); }
});
