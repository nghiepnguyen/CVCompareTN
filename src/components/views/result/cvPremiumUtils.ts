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
  // Strip Education (sidebar)
  md = md.replace(/^##\s+(?:Học vấn|Education)\b[\s\S]*?(?=\n##\s|\n*$)/im, '');
  // Strip Skills — all common variants (sidebar)
  md = md.replace(/^##\s+(?:Kỹ năng(?:\s+\w+)*|Technical\s+Skills?|Skills?)\b[\s\S]*?(?=\n##\s|\n*$)/im, '');
  // Strip Languages (sidebar)
  md = md.replace(/^##\s+(?:Ngôn\s+ngữ|Languages?)\b[\s\S]*?(?=\n##\s|\n*$)/im, '');
  return md.trim();
}
