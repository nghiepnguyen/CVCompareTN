import { getSupabaseAdmin } from './payment/supabaseAdmin.js';
import { withTimeout } from './withTimeout.js';
import type { TokenUsage } from './ai/geminiClient.js';

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
  usage?: TokenUsage
): Promise<void> {
  try {
    const { error } = await withTimeout(
      getSupabaseAdmin().from('analysis_log').insert({
        user_id: userId,
        status,
        kind,
        error_message: errorMessage,
        input_tokens: usage?.inputTokens ?? 0,
        output_tokens: usage?.outputTokens ?? 0,
      }) as unknown as Promise<{ error: unknown }>,
      LOG_TIMEOUT_MS,
      'analysis_log insert'
    );
    if (error) console.error('logAnalysisAttempt failed:', error);
  } catch (err) {
    console.error('logAnalysisAttempt failed:', err);
  }
}
