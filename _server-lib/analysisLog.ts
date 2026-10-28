import { getSupabaseAdmin } from './payment/supabaseAdmin.js';
import { withTimeout } from './withTimeout.js';
import { createDeadline, type Deadline } from './deadline.js';
import type { AiCallUsage } from './ai/geminiClient.js';
import type { GuardMetrics } from './ai/suggestionGuard.js';

export type AnalysisLogKind = 'analyze' | 'parse_cv' | 'rewrite';

const LOG_TIMEOUT_MS = 5_000;

// Log of a completed AI call, for the Admin > Report tab. Shared by the
// analyze/parse-cv/rewrite handlers — one row per Gemini call. Callers must
// await this: a serverless container can freeze the instant the HTTP
// response is sent, silently dropping any fire-and-forget work still in
// flight (this previously ran un-awaited and rows went missing).
export async function logAnalysisAttempt(
  userId: string | null,
  status: 'success' | 'error',
  kind: AnalysisLogKind,
  errorMessage?: string,
  // Full usage on success; only `model` when the Gemini call itself failed;
  // omitted for preflight failures (no model ran).
  usage?: Partial<AiCallUsage>,
  // Aggregate guard telemetry (successful analyze/rewrite only). The column is
  // named only when set, so other rows never depend on it.
  guardMetrics?: GuardMetrics,
  // The request deadline: the insert never runs past it (a valid response
  // beats a telemetry row). Without it, LOG_TIMEOUT_MS alone applies.
  deadline: Deadline = createDeadline(LOG_TIMEOUT_MS)
): Promise<void> {
  const timeoutMs = Math.min(LOG_TIMEOUT_MS, deadline.remainingMs());
  if (timeoutMs <= 0) {
    console.warn('logAnalysisAttempt skipped: request deadline reached');
    return;
  }
  try {
    const { error } = await withTimeout(
      getSupabaseAdmin().from('analysis_log').insert({
        user_id: userId,
        status,
        kind,
        error_message: errorMessage,
        input_tokens: usage?.inputTokens ?? 0,
        output_tokens: usage?.outputTokens ?? 0,
        model: usage?.model ?? null,
        latency_ms: usage?.latencyMs ?? null,
        ...(guardMetrics && { guard_metrics: guardMetrics }),
      }).abortSignal(deadline.signal(LOG_TIMEOUT_MS)) as unknown as Promise<{ error: unknown }>,
      timeoutMs,
      'analysis_log insert'
    );
    if (error) console.error('logAnalysisAttempt failed:', error);
  } catch (err) {
    console.error('logAnalysisAttempt failed:', err);
  }
}
