/**
 * Gemini often returns fullRewrittenCV as plain prose (no # / ##), so react-markdown only emits <p>.
 * We fix that by (1) tightening prompts and (2) promoting known section labels + first block to headings here.
 */

const SECTION_LABELS: string[] = [
  'Professional Summary',
  'Career Objective',
  'Objective',
  'Summary',
  'Profile',
  'Tóm tắt',
  'Mục tiêu nghề nghiệp',
  'Giới thiệu',
  'Work Experience',
  'Professional Experience',
  'Experience',
  'Employment History',
  'Kinh nghiệm làm việc',
  'Kinh nghiệm',
  'Education',
  'Academic Background',
  'Học vấn',
  'Skills',
  'Technical Skills',
  'Core Competencies',
  'Kỹ năng',
  'Kỹ năng chuyên môn',
  'Projects',
  'Personal Projects',
  'Selected Projects',
  'Dự án',
  'Certifications',
  'Certificates',
  'Chứng chỉ',
  'Languages',
  'Ngôn ngữ',
  'Awards',
  'Giải thưởng',
  'Publications',
  'Volunteer',
  'References',
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeSectionCandidate(line: string): string {
  return line.replace(/\*\*/g, '').replace(/^#+\s*/, '').trim();
}

function isBulletLine(trimmed: string): boolean {
  return /^[-*•]\s/.test(trimmed) || /^\d+\.\s/.test(trimmed);
}

function isSectionLine(trimmed: string): boolean {
  const n = normalizeSectionCandidate(trimmed);
  if (!n || n.length > 80) return false;
  return SECTION_LABELS.some((label) => new RegExp(`^${escapeRegExp(label)}$`, 'i').test(n));
}

/** True if string already uses markdown ATX headings */
export function cvMarkdownHasHeadings(source: string): boolean {
  return /^\s*#{1,6}\s+\S/m.test(source.trim());
}

/** Plain `#Heading` → `# Heading` for md parity */
export function fixMarkdownHeadingHashes(source: string): string {
  return source.replace(/^(#+)([^#\s])/gm, '$1 $2');
}

/**
 * When the model returns plain text CV, promote first block to `#` and known section titles to `##`.
 */
export function promotePlainTextCvToMarkdown(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;
  let sawH1 = false;

  while (i < lines.length) {
    const raw = lines[i];
    const t = raw.trim();

    if (!t) {
      out.push('');
      i++;
      continue;
    }

    if (!sawH1) {
      if (isBulletLine(t)) {
        sawH1 = true;
        out.push(raw);
        i++;
        continue;
      }
      if (isSectionLine(t)) {
        sawH1 = true;
        out.push(`## ${t}`, '');
        i++;
        continue;
      }
      sawH1 = true;
      out.push(`# ${t}`, '');
      i++;
      while (i < lines.length) {
        const t2 = lines[i].trim();
        if (!t2) break;
        if (isSectionLine(t2) || isBulletLine(t2)) break;
        out.push(lines[i]);
        i++;
      }
      out.push('');
      continue;
    }

    if (isSectionLine(t)) {
      out.push(`## ${t}`, '');
      i++;
      continue;
    }

    out.push(raw);
    i++;
  }

  return out.join('\n').trimEnd();
}

export function preprocessFullRewrittenCvMarkdown(source: string): string {
  let s = source.trim();
  if (!s) return s;
  if (!cvMarkdownHasHeadings(s)) {
    s = promotePlainTextCvToMarkdown(s);
  }
  return fixMarkdownHeadingHashes(s);
}

/** Best-effort strip for copy / plain export */
export function fullRewrittenCvToPlainText(md: string): string {
  return preprocessFullRewrittenCvMarkdown(md)
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/gs, '$1')
    .replace(/\*(.+?)\*/gs, '$1')
    .replace(/__(.+?)__/gs, '$1')
    .replace(/_(.+?)_/gs, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^[-*+]\s+/gm, '• ')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
