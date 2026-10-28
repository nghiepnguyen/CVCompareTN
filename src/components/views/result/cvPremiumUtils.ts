import type { AnalysisResult } from '../../../services/ai';

/** Extract candidate name from parsedCV, falling back to the H1 in markdown */
export function extractCandidateName(result: AnalysisResult): string {
  const n = result.parsedCV?.personal_information?.full_name?.trim();
  if (n) return n;
  const m = result.fullRewrittenCV?.match(/^#\s+(.+?)(?:\s*$)/m);
  return m?.[1]?.trim() ?? '';
}

// Email, phone, URL/www, or a bare domain such as linkedin.com/in/x. A line
// with one of these is the contact block. Phones must start with "+" or a
// leading 0 (or use "(area)"), so a year range like "2018 - 2022" is not one.
const CONTACT_TOKEN =
  /[\w.+-]+@[\w-]+\.[\w.-]+|(?:\+\d{1,3}[\s.-]?|\b0)\d[\d\s.-]{6,}\d|\(\d{2,4}\)\s?\d{3}[\s.-]?\d{3,4}|https?:\/\/|\bwww\.|\b[\w-]+\.(?:com|net|org|io|dev|me|vn|co)\b|\blinkedin\b/i;

function isContactLine(line: string): boolean {
  const t = line.trim();
  if (!t || t.startsWith('#')) return false;
  return CONTACT_TOKEN.test(t);
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
  // Strip contact lines (shown in the sidebar from parsedCV). Only the preamble
  // — text between the H1 and the first ## — is considered, and only lines
  // carrying a real contact token count. The old pattern matched anywhere in
  // the document (a later sentence mentioning "shop.com" vanished) and kept
  // nothing structural; a summary line the model sometimes puts in the
  // contact slot is now kept as content instead of being guessed at.
  const firstSection = md.search(/^##\s/m);
  const preambleEnd = firstSection === -1 ? md.length : firstSection;
  const preamble = md
    .slice(0, preambleEnd)
    .split('\n')
    .filter((line) => !isContactLine(line))
    .join('\n');
  md = preamble + md.slice(preambleEnd);
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
