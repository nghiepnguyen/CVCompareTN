import { supabase, withAuthRetry } from "../lib/supabase";
import { AnalysisResult, normalizeAnalysisPayload, normalizeParsedCV } from "./ai";
import type { UserPlan } from "./userService";
import { HISTORY_DAYS_BY_PLAN } from "../lib/planLimits";
import { toHistoryRow } from "../lib/historyRow";

export type { SavedJD } from "./jdService";

// Map database fields to AnalysisResult interface (JSON columns may arrive as strings from PostgREST)
function mapHistory(data: Record<string, unknown>): AnalysisResult {
  const normalized = normalizeAnalysisPayload(data);
  const ms = data.match_score;
  const matchScore =
    typeof ms === "number" && Number.isFinite(ms)
      ? ms
      : typeof ms === "string"
        ? parseFloat(ms) || 0
        : Number(ms) || 0;

  return {
    id: String(data.analysis_id ?? data.id ?? ""),
    timestamp: new Date(data.timestamp as string).getTime(),
    jdTitle: data.jd_title != null ? String(data.jd_title) : undefined,
    jobTitle: data.job_title != null ? String(data.job_title) : undefined,
    cvName: data.cv_name != null ? String(data.cv_name) : undefined,
    matchScore,
    categoryScores: normalized.categoryScores,
    matchingPoints: normalized.matchingPoints,
    missingGaps: normalized.missingGaps,
    successProbability:
      data.success_probability != null ? String(data.success_probability) : "",
    passProbability: data.pass_probability != null ? String(data.pass_probability) : "",
    passExplanation: data.pass_explanation != null ? String(data.pass_explanation) : "",
    mainFactor: data.main_factor != null ? String(data.main_factor) : "",
    ...(typeof data.probability_version === "string" && data.probability_version
      ? { probabilityVersion: data.probability_version }
      : {}),
    atsKeywords: normalized.atsKeywords,
    rewriteSuggestions: normalized.rewriteSuggestions,
    fullRewrittenCV:
      data.full_rewritten_cv != null ? String(data.full_rewritten_cv) : undefined,
    cvUrl: data.cv_url != null ? String(data.cv_url) : undefined,
    detailedComparison: normalized.detailedComparison,
    userId: data.user_id != null ? String(data.user_id) : undefined,
    rating: typeof data.rating === "number" ? data.rating : undefined,
    feedback: data.feedback != null ? String(data.feedback) : undefined,
    language: data.language === "en" ? "en" : "vi",
    parsedCV: normalizeParsedCV(data.parsed_cv, { mode: "history" }),
    // Legacy rows (no score_version) keep their old meaning: language = UI language.
    ...(typeof data.score_version === "string" && data.score_version
      ? { scoreVersion: data.score_version, presentationLanguage: data.language === "en" ? "en" as const : "vi" as const }
      : {}),
  };
}

export async function rateAnalysis(userId: string, analysisId: string, rating: number, feedback: string, recaptchaToken?: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('history')
    .update({ 
      rating, 
      feedback 
    })
    .eq('user_id', userId)
    .eq('analysis_id', analysisId);
  
  if (error) throw error;

  // Gửi email thông báo feedback cho Admin (qua API có reCAPTCHA)
  if (feedback || rating > 0) {
    fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'feedback',
        token: recaptchaToken,
        rating,
        title: `Đánh giá ${rating} sao cho analysis ${analysisId.substring(0, 8)}`,
        content: feedback,
        userEmail: user?.email || '',
      }),
    }).catch(e => console.error("Lỗi gửi email feedback:", e));
  }
}

export async function saveToHistory(results: AnalysisResult | AnalysisResult[], plan: UserPlan = 'free'): Promise<void> {
  const resultsArray = Array.isArray(results) ? results : [results];
  if (resultsArray.length === 0 || !resultsArray[0].userId) return;

  const userId = resultsArray[0].userId;
  const maxItems = plan === 'free' ? 50 : 500;
  
  const historyData = resultsArray.map((h) => toHistoryRow(userId, h));

  try {
    const { error } = await supabase
      .from('history')
      // Conflict on the unique (user_id, analysis_id): re-saving the same
      // analysis (retry after a lost response) updates it, never duplicates.
      .upsert(historyData, { onConflict: 'user_id,analysis_id' });
    
    if (error) throw error;

    // Trim DB to plan-based limit
    const { data: currentHistory } = await supabase
      .from('history')
      .select('id')
      .eq('user_id', userId)
      .order('timestamp', { ascending: false });

    if (currentHistory && currentHistory.length > maxItems) {
      const idsToDelete = currentHistory.slice(maxItems).map(item => item.id);
      await supabase
        .from('history')
        .delete()
        .in('id', idsToDelete);
    }
  } catch (error) {
    console.error('Error saving to history:', error);
    throw error;
  }
}

export async function updateHistoryField(
  userId: string,
  resultId: string,
  fields: Partial<{ full_rewritten_cv: string; parsed_cv: unknown }>
): Promise<void> {
  const { error } = await supabase
    .from('history')
    .update(fields)
    .eq('user_id', userId)
    .eq('analysis_id', resultId);

  if (error) throw error;
}

/** One own history row by analysis_id (RLS-scoped), or undefined. */
export async function findHistoryByAnalysisId(userId: string, analysisId: string): Promise<AnalysisResult | undefined> {
  const { data, error } = await supabase
    .from('history')
    .select('*')
    .eq('user_id', userId)
    .eq('analysis_id', analysisId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapHistory(data) : undefined;
}

// M3-A: the server answers within its 65 s request deadline; +10 s margin for
// the history upsert that follows the commit. Poll every 10 s inside that window.
export const RECOVERY_WINDOW_MS = 75_000;
export const RECOVERY_POLL_MS = 10_000;

/**
 * After an analyze request got no HTTP answer, wait for the row the server
 * saves under analysis_id = request key. At least one lookup; stops at the
 * first hit or when the window since dispatch closes. Never re-sends analyze.
 */
export async function waitForSavedAnalysis(
  userId: string,
  analysisId: string,
  dispatchedAt: number,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))
): Promise<AnalysisResult | undefined> {
  const until = dispatchedAt + RECOVERY_WINDOW_MS;
  for (;;) {
    const found = await findHistoryByAnalysisId(userId, analysisId).catch(() => undefined);
    if (found) return found;
    const wait = Math.min(RECOVERY_POLL_MS, until - Date.now());
    if (wait <= 0) return undefined;
    await sleep(wait);
  }
}

export async function getUserHistory(uid: string, plan: UserPlan = 'free'): Promise<AnalysisResult[]> {
  try {
    const historyDays = HISTORY_DAYS_BY_PLAN[plan] ?? 7;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - historyDays);

    let query = supabase
      .from('history')
      .select('*')
      .eq('user_id', uid)
      .order('timestamp', { ascending: false });

    if (plan === 'free') {
      query = query.gte('timestamp', cutoff.toISOString());
    }
    const finalQuery = query.limit(plan === 'pro' ? 500 : 50);

    const { data, error } = await withAuthRetry(() => finalQuery);

    if (error) throw error;
    if (!data) return [];
    return data.map(mapHistory);
  } catch (error) {
    console.error('Error fetching user history:', error);
  }
  return [];
}

export async function deleteFromHistory(uid: string, resultId: string): Promise<void> {
  const { error } = await supabase
    .from('history')
    .delete()
    .eq('user_id', uid)
    .eq('analysis_id', resultId);
  
  if (error) throw error;
}

export async function clearUserHistory(uid: string): Promise<void> {
  const { error } = await supabase
    .from('history')
    .delete()
    .eq('user_id', uid);
  
  if (error) throw error;
}