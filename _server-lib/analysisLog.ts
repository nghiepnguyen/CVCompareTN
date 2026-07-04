import { getSupabaseAdmin } from './payment/supabaseAdmin.js';
import type { TokenUsage } from './ai/geminiClient.js';

export type AnalysisLogKind = 'analyze' | 'parse_cv' | 'rewrite';

// Fire-and-forget log of a completed AI call, for the Admin > Report tab.
// Shared by the analyze/parse-cv/rewrite handlers — one row per Gemini call.
export function logAnalysisAttempt(
  userId: string | null,
  status: 'success' | 'error',
  kind: AnalysisLogKind,
  errorMessage?: string,
  usage?: TokenUsage
) {
  void (async () => {
    try {
      await getSupabaseAdmin().from('analysis_log').insert({
        user_id: userId,
        status,
        kind,
        error_message: errorMessage,
        input_tokens: usage?.inputTokens ?? 0,
        output_tokens: usage?.outputTokens ?? 0,
      });
    } catch (err) {
      console.error('logAnalysisAttempt failed:', err);
    }
  })();
}
