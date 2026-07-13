import { getUserFromBearerToken } from '../payment/supabaseAdmin.js';
import { generateFullRewrite } from '../ai/rewriteService.js';
import { withTimeout } from '../withTimeout.js';
import { logAnalysisAttempt } from '../analysisLog.js';
import { resolveStorageRef } from '../storage/tempFile.js';

export type HandlerResult = { status: number; body: Record<string, unknown> };

const AUTH_TIMEOUT_MS = 4_000;
// Wall-clock budget from the first line of the handler — mirrors _server-lib/analyze/handler.ts
// so auth + rewrite can never together exceed Vercel's 60s maxDuration.
const TOTAL_BUDGET_MS = 50_000;
const MIN_REWRITE_BUDGET_MS = 10_000;

export async function handleRewriteCv(
  authHeader: string | undefined,
  body: unknown
): Promise<HandlerResult> {
  const requestStart = Date.now();
  const b = (body ?? {}) as {
    jd?: string;
    cvData?: string;
    cvMimeType?: string;
    language?: string;
    cvDataStoragePath?: string;
  };

  const jd = b.jd?.trim();
  let cvData = b.cvData?.trim();
  const cvMimeType = b.cvMimeType?.trim() || 'text/plain';
  const language: 'vi' | 'en' = b.language === 'en' ? 'en' : 'vi';
  const cvDataStoragePath = b.cvDataStoragePath?.trim() || undefined;

  if (!jd) return { status: 400, body: { error: 'Missing jd' } };
  if (!cvData && !cvDataStoragePath) return { status: 400, body: { error: 'Missing cvData' } };

  const user = await withTimeout(
    getUserFromBearerToken(authHeader),
    AUTH_TIMEOUT_MS,
    'Auth verification'
  ).catch((err) => {
    console.warn('Auth verification failed:', err.message);
    return null;
  });

  if (!user) {
    return { status: 401, body: { error: 'Authentication required' } };
  }

  // Same path is reused by the client's other calls (analyze/parse-cv) for
  // this CV, so cleanup is the client's job after all of them settle.
  try {
    if (cvDataStoragePath) {
      cvData = await resolveStorageRef(cvDataStoragePath, user.id);
    }
  } catch (err) {
    return {
      status: 400,
      body: { error: err instanceof Error ? err.message : 'Failed to load uploaded file' },
    };
  }

  const remainingBudgetMs = TOTAL_BUDGET_MS - (Date.now() - requestStart);
  if (remainingBudgetMs < MIN_REWRITE_BUDGET_MS) {
    return {
      status: 504,
      body: {
        error: 'CV rewrite is taking too long. Please try again. (Timeout)',
        retryable: true,
      },
    };
  }

  try {
    const { fullRewrittenCV, usage } = await generateFullRewrite(
      jd,
      cvData as string,
      cvMimeType,
      language,
      remainingBudgetMs
    );
    await logAnalysisAttempt(user?.id ?? null, 'success', 'rewrite', undefined, usage);
    return { status: 200, body: { fullRewrittenCV } };
  } catch (err) {
    console.error('CV rewrite failed:', err);
    const message = err instanceof Error ? err.message : 'Server error';
    const isTimeout = message.includes('(Timeout)');
    return { status: isTimeout ? 504 : 500, body: { error: message, retryable: isTimeout } };
  }
}
