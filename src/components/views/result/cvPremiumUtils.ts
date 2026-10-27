import type { AnalysisResult } from '../../../services/ai';

/** Extract candidate name from parsedCV, falling back to the H1 in markdown */
export function extractCandidateName(result: AnalysisResult): string {
  const n = result.parsedCV?.personal_information?.full_name?.trim();
  if (n) return n;
  const m = result.fullRewrittenCV?.match(/^#\s+(.+?)(?:\s*$)/m);
  return m?.[1]?.trim() ?? '';
}

/**
 * Strip sections that live in the sidebar (H1 name, contact lines,
 * Education, Skills, Languages) so the main column has no duplicates.
 */
export function cleanMarkdownForPremium(fullRewrittenCV: string | undefined): string {
  if (!fullRewrittenCV) return '';
  let md = fullRewrittenCV;
  // Strip H1 name — displayed in the card header instead
  md = md.replace(/^#\s+[^\n]+\n?/m, '');
  // Strip contact lines right after H1 (email @, phone 0x, linkedin, .com, · separator)
  md = md.replace(/(^[^\n#\-*`>].*(?:·|@|linkedin|\.com)[^\n]*\n)+/m, '');
  // Section ends use a Unicode-aware boundary: ASCII \b never matches after a
  // Vietnamese letter such as the final "ữ" in "Ngoại ngữ". A section runs to
  // the next ## or the true end of text (`$` under /m would stop at its first line).
  // Strip Education (sidebar)
  md = md.replace(/^##\s+(?:Học vấn|Education)(?![\p{L}\p{N}_])[\s\S]*?(?=\n##\s|\s*(?![\s\S]))/imu, '');
  // Strip Skills — all common variants (sidebar)
  md = md.replace(/^##\s+(?:Kỹ năng(?:\s+\w+)*|Technical\s+Skills?|Skills?)(?![\p{L}\p{N}_])[\s\S]*?(?=\n##\s|\s*(?![\s\S]))/imu, '');
  // Strip Languages (sidebar)
  md = md.replace(/^##\s+(?:Ngôn\s+ngữ|Ngoại\s+ngữ|Languages?)(?![\p{L}\p{N}_])[\s\S]*?(?=\n##\s|\s*(?![\s\S]))/imu, '');
  return md.trim();
}
