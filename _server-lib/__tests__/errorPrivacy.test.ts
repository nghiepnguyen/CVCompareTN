import { beforeEach, describe, expect, it, vi } from 'vitest';

const fail = vi.hoisted(() => vi.fn());
vi.mock('../ai/analysisService.js', () => ({ analyzeCV: fail }));
vi.mock('../ai/parseCvService.js', () => ({ generateParsedCV: fail }));
vi.mock('../ai/rewriteService.js', () => ({ generateFullRewrite: fail }));
vi.mock('../storage/tempFile.js', () => ({ resolveStorageRef: fail }));
vi.mock('../accountLock.js', () => ({ getAccountProfile: async () => ({ plan: 'free', role: 'user', has_permission: true }), checkAiAccess: async () => 'ok', checkHourlyAiLimit: async () => 'ok', isLockedProfile: () => false, getEffectivePlan: () => 'free' }));
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
