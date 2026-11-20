import type { AnalysisResult } from '../services/ai/types.js';

/**
 * The one column list for a `public.history` row (M3-A), shared by the browser
 * upsert and the /api/analyze personal save so both write the same row.
 * `userId` must come from the authenticated session or verified token, never
 * from the result. No `id` (primary key): conflicts resolve only on the unique
 * (user_id, analysis_id).
 */
export function toHistoryRow(userId: string, h: AnalysisResult) {
  return {
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
    ...(h.probabilityVersion ? { probability_version: h.probabilityVersion } : {}),
    ats_keywords: h.atsKeywords,
    rewrite_suggestions: h.rewriteSuggestions,
    full_rewritten_cv: h.fullRewrittenCV,
    cv_url: h.cvUrl,
    detailed_comparison: h.detailedComparison,
    rating: h.rating,
    feedback: h.feedback,
    // Canonical analyses store the language the prose was delivered in.
    language: h.presentationLanguage || h.language || 'vi',
    parsed_cv: h.parsedCV,
    ...(h.scoreVersion ? { score_version: h.scoreVersion } : {}),
  };
}
