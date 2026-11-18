import { beforeEach, describe, expect, it, vi } from 'vitest';

const fail = vi.hoisted(() => vi.fn());
// The atomic AI slot (M2-B) is covered by m2bStabilization.test.ts; this suite
// is about other behavior, so the reservation always succeeds here.
// The M2-C2 monthly quota ledger is covered by m2c2MonthlyQuota.test.ts and the
// real-DB suite; here every reservation succeeds and settles.
vi.mock('../quota/monthlyQuota.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../quota/monthlyQuota.js')>()),
  reserveMonthlyQuota: async () => ({ status: 'reserved', reservationId: 'res-1' }),
  commitMonthlyQuota: async () => 'committed',
  releaseMonthlyQuota: async () => true,
}));
vi.mock('../rateLimit.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../rateLimit.js')>()),
  reserveAiCall: async () => 'ok',
}));
vi.mock('../ai/analysisService.js', () => ({ analyzeCV: fail }));
vi.mock('../ai/parseCvService.js', () => ({ generateParsedCV: fail }));
vi.mock('../ai/rewriteService.js', () => ({ generateFullRewrite: fail }));
vi.mock('../storage/tempFile.js', () => ({ resolveStorageRef: fail }));
vi.mock('../accountLock.js', () => ({ getAccountProfile: async () => ({ plan: 'free', role: 'user', has_permission: true }), checkAiAccess: async () => 'ok', getAiAccess: async () => ({ access: 'ok', plan: 'free' }), checkHourlyAiLimit: async () => 'ok', isLockedProfile: () => false, getEffectivePlan: () => 'free' }));
vi.mock('../analysisLog.js', () => ({ logAnalysisAttempt: async () => {} }));
vi.mock('../payment/supabaseAdmin.js', () => ({
  getUserFromBearerToken: async () => ({ id: 'u1' }),
  getSupabaseAdmin: () => ({
    from: () => {
      const query = { select: () => query, eq: () => query, abortSignal: () => query, maybeSingle: async () => ({ data: { plan: 'free', role: 'user' } }) };
      return query;
    },
    rpc: () => ({ abortSignal: async () => ({ data: { allowed: true }, error: null }) }),
  }),
}));

import { handleAnalyze } from '../analyze/handler.js';
import { handleParseCv } from '../parseCv/handler.js';
import { handleRewriteCv } from '../rewriteCv/handler.js';

const PRIVATE_ERROR = 'upstream-secret CV-private@example.test';
const body = { jd: 'JD fixture', cvData: 'CV fixture', cvMimeType: 'text/plain' };

beforeEach(() => {
  fail.mockReset().mockRejectedValue(new Error(PRIVATE_ERROR));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('AI error response privacy', () => {
  for (const [kind, handler] of [['analyze', handleAnalyze], ['parse', handleParseCv], ['rewrite', handleRewriteCv]] as const) {
    it(`${kind}: hides provider errors`, async () => {
      const result = await handler('Bearer fixture', body);
      expect(result.status).toBe(500);
      expect(result.body.retryable).toBe(false);
      expect(JSON.stringify(result.body)).not.toContain(PRIVATE_ERROR);
    });
    it(`${kind}: hides storage errors`, async () => {
      const result = await handler('Bearer fixture', { ...body, cvData: undefined, cvDataStoragePath: 'u1/fixture.pdf' });
      expect(result.status).toBe(400);
      expect(JSON.stringify(result.body)).not.toContain(PRIVATE_ERROR);
    });
    it(`${kind}: preserves timeout status without returning provider text`, async () => {
      fail.mockRejectedValue(new Error(`${PRIVATE_ERROR} (Timeout)`));
      const result = await handler('Bearer fixture', body);
      expect(result.status).toBe(504);
      expect(result.body.retryable).toBe(true);
      expect(JSON.stringify(result.body)).not.toContain(PRIVATE_ERROR);
    });
  }
});
