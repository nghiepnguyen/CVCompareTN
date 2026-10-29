import type { ParsedWorkExperience } from './types.js';
import { vnDateParts } from '../../lib/vnTime.js';
import { normalizeTextualMonthYear } from '../../lib/cvDates.js';

type Range = [number, number];
type Completeness = 'COMPLETE' | 'PARTIAL' | 'UNAVAILABLE';
export interface ExperienceContext {
  sourceText?: string;
  asOf?: Date;
}
export interface WorkTimeline {
  completeness: Completeness;
  sourceSupport: 'verified' | 'unknown';
  years: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function parseMonthYear(value: unknown): { index: number; exact: boolean } | null {
  if (typeof value !== 'string') return null;
  const text = normalizeTextualMonthYear(value.trim());
  const monthYear = text.match(/^(\d{1,2})\/(\d{4})$/);
  const yearMonth = text.match(/^(\d{4})-(\d{1,2})$/);
  const yearOnly = text.match(/^(\d{4})$/);
  const year = Number(monthYear?.[2] ?? yearMonth?.[1] ?? yearOnly?.[1]);
  const month = Number(monthYear?.[1] ?? yearMonth?.[2] ?? (yearOnly ? 1 : NaN));
  if (!Number.isInteger(year) || year < 1 || month < 1 || month > 12 || !Number.isInteger(month)) return null;
  return { index: year * 12 + month - 1, exact: !yearOnly };
}

function inspectRange(entry: unknown, asOf: Date) {
  if (!isRecord(entry) || !isRecord(entry.duration)) return null;
  const duration = entry.duration;
  if (duration.is_current !== undefined && typeof duration.is_current !== 'boolean') return null;
  const start = parseMonthYear(duration.start);
  const { y, m } = vnDateParts(asOf);
  const now = y * 12 + m;
  const current = duration.is_current === true;
  const end = current ? { index: now, exact: true } : parseMonthYear(duration.end);
  if (!start || !end || start.index > now || end.index < start.index) return null;
  return {
    range: [start.index, Math.min(end.index, now)] as Range,
    exact: start.exact && end.exact,
    futureEnd: end.index > now,
    current,
    start: String(duration.start),
    end: String(duration.end ?? ''),
  };
}

function mergedYears(ranges: Range[]): number | null {
  if (!ranges.length) return null;
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  let totalMonths = 0;
  let [start, end] = sorted[0];
  for (const [nextStart, nextEnd] of sorted.slice(1)) {
    if (nextStart <= end + 1) end = Math.max(end, nextEnd);
    else {
      totalMonths += end - start + 1;
      [start, end] = [nextStart, nextEnd];
    }
  }
  totalMonths += end - start + 1;
  return Math.round(totalMonths / 12 * 10) / 10;
}

/** Arithmetic only; source support and completeness are checked separately before authority selection. */
export function computeYearsOfExperience(work: ParsedWorkExperience[], asOf = new Date()): number | null {
  return mergedYears(work.flatMap(entry => {
    const inspected = inspectRange(entry, asOf);
    return inspected ? [inspected.range] : [];
  }));
}

function canonicalEvidence(text: string): string {
  return normalizeTextualMonthYear(text.normalize('NFKC'))
    .replace(/\b(\d{4})-(\d{1,2})\b/g, (_, year: string, month: string) => `${month}/${year}`)
    .replace(/\b(\d{1,2})\/(\d{4})\b/g, (_, month: string, year: string) => `${month.padStart(2, '0')}/${year}`)
    .toLowerCase().replace(/\s+/g, ' ').trim();
}
const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const token = (text: string) => `(?<![\\p{L}\\p{N}])${escapeRegex(text)}(?![\\p{L}\\p{N}])`;

function hasSourceRange(entry: Record<string, unknown>, range: NonNullable<ReturnType<typeof inspectRange>>, lines: string[]): boolean {
  const company = typeof entry.company === 'string' ? canonicalEvidence(entry.company) : '';
  const title = typeof entry.job_title === 'string' ? canonicalEvidence(entry.job_title) : '';
  if (!company || !title) return false;
  const separator = '\\s*(?:[|,:–—-]|at|tại)?\\s*';
  const identity = new RegExp(`^(?:${token(company)}${separator}${token(title)}|${token(title)}${separator}${token(company)})[|,:–—()\\s-]*$`, 'u');
  const end = range.current ? '(?:present|current|now|nay|hiện tại)' : escapeRegex(canonicalEvidence(range.end));
  const dates = new RegExp(`${token(canonicalEvidence(range.start))}\\s*(?:[-–—]|to|đến)\\s*(?<![\\p{L}\\p{N}])${end}(?![\\p{L}\\p{N}])`, 'u');
  // shortcut: require a simple role header immediately before one date pair; multiline/OCR layouts stay unknown until a reliable role-local parser exists.
  return lines.some(line => {
    const match = dates.exec(line);
    return match !== null && identity.test(line.slice(0, match.index).trim())
      && (line.match(/\b(?:\d{1,2}\/\d{4}|\d{4})\b/g) ?? []).length === (range.current ? 1 : 2);
  });
}

export function inspectWorkTimeline(raw: unknown, { sourceText, asOf = new Date() }: ExperienceContext = {}): WorkTimeline {
  const entries = Array.isArray(raw) ? raw : [];
  const lines = sourceText ? sourceText.split(/\r?\n/).map(canonicalEvidence) : [];
  const ranges: Range[] = [];
  let complete = entries.length > 0;
  let verified = entries.length > 0;
  for (const entry of entries) {
    const inspected = inspectRange(entry, asOf);
    if (!inspected || !isRecord(entry) || !hasSourceRange(entry, inspected, lines)) {
      complete = false;
      verified = false;
      continue;
    }
    ranges.push(inspected.range);
    if (!inspected.exact || inspected.futureEnd) complete = false;
  }
  return {
    completeness: !ranges.length ? 'UNAVAILABLE' : complete ? 'COMPLETE' : 'PARTIAL',
    sourceSupport: verified ? 'verified' : 'unknown',
    years: mergedYears(ranges),
  };
}

export function validExperience(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value
    : typeof value === 'string' && /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim()) ? Number(value) : NaN;
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

export function selectExperience(rawModel: unknown, timeline: WorkTimeline): number {
  const model = validExperience(rawModel);
  if (timeline.completeness === 'COMPLETE' && timeline.sourceSupport === 'verified' && timeline.years !== null) return timeline.years;
  // A source-backed positive subtotal disproves model zero, even when the rest of the timeline is incomplete.
  if (model === 0 && timeline.years !== null && timeline.years > 0) return timeline.years;
  return model ?? timeline.years ?? 0;
}
