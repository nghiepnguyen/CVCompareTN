import { supabase } from "../lib/supabase";
import { AnalysisResult, normalizeAnalysisPayload, normalizeParsedCV } from "./ai";
import type { UserPlan } from "./userService";
import { HISTORY_DAYS_BY_PLAN } from "../lib/planLimits";

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
    parsedCV: normalizeParsedCV(data.parsed_cv),
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
  
  const historyData = resultsArray.map(h => ({
    user_id: userId,
    analysis_id: h.id,
    timestamp: new Date(h.timestamp).toISOString(),
    jd_title: h.jdTitle,
    job_title: h.jobTitle,
    cv_name: h.cvName,
    match_score: h.matchScore,
    category_scores: h.categoryScores,
    matching_points: h.matchingPoints,
    missing_gaps: h.missingGaps,
    success_probability: h.successProbability,
    pass_probability: h.passProbability,
    pass_explanation: h.passExplanation,
    main_factor: h.mainFactor,
    ats_keywords: h.atsKeywords,
    rewrite_suggestions: h.rewriteSuggestions,
    full_rewritten_cv: h.fullRewrittenCV,
    cv_url: h.cvUrl,
    detailed_comparison: h.detailedComparison,
    rating: h.rating,
    feedback: h.feedback,
    language: h.language || 'vi',
    parsed_cv: h.parsedCV
  }));

  try {
    const { error } = await supabase
      .from('history')
      .upsert(historyData);
    
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

    const { data, error } = await query.limit(plan === 'pro' ? 500 : 50);

    if (error) throw error;
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