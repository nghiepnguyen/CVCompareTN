import type { RewriteSuggestion } from '../../src/services/ai/types.js';

// Numbers as a CV would state them ("7", "1,2", "35%"), separators dropped so
// "1,2 triệu" and "1.2M" compare equal. MM/YYYY dates and bare years are
// chronology the pipeline normalizes from the CV's own dates, not metrics.
function metricNumbers(text: string): string[] {
  const stripped = text
    .replace(/\b\d{1,2}\/(?:19|20)\d{2}\b/g, ' ')
    .replace(/\b(?:19|20)\d{2}\b/g, ' ');
  return (stripped.match(/\d+(?:[.,]\d+)*/g) ?? []).map((n) => n.replace(/[.,]/g, ''));
}

/**
 * Last-line guard for rewrite suggestions the prompt forbids but the model
 * still produced in benchmark runs (2026-10-29): a Skills-section rewrite
 * (it can only "improve" by adding skills the CV lacks) or an "optimized"
 * text with a number the CV never states (e.g. "9 năm" for a CV saying
 * "7 năm"). Such a suggestion is dropped rather than repaired — showing
 * fewer suggestions is better than showing a fabricated candidate fact.
 * The number check needs the CV text, so it is skipped for inline PDF/image
 * input; the Skills rule always applies.
 */
export function dropUnsupportedSuggestions(
  suggestions: RewriteSuggestion[],
  cvText: string | undefined
): RewriteSuggestion[] {
  const cvNumbers = cvText ? new Set(metricNumbers(cvText)) : null;
  return suggestions.filter((s) => {
    if (/skill|kỹ năng/i.test(s.section)) return false;
    if (!cvNumbers) return true;
    return metricNumbers(s.optimized).every((n) => cvNumbers.has(n));
  });
}
