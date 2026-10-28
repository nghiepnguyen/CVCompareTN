import type { ComparisonItem, DetailedComparison, MissingGap, RewriteSuggestion } from '../../src/services/ai/types.js';

// Numbers as a CV would state them ("7", "1,2", "35%"), separators dropped so
// "1,2 triệu" and "1.2M" compare equal. MM/YYYY dates and bare years are
// chronology the pipeline normalizes from the CV's own dates, not metrics.
function metricNumbers(text: string): string[] {
  const stripped = text
    .replace(/\b\d{1,2}\/(?:19|20)\d{2}\b/g, ' ')
    .replace(/\b(?:19|20)\d{2}\b/g, ' ');
  return (stripped.match(/\d+(?:[.,]\d+)*/g) ?? []).map((n) => n.replace(/[.,]/g, ''));
}

// ---------------------------------------------------------------------------
// JD-only concepts the analysis itself classified as unsupported.
//
// The deny list is derived per call from the model's own structured output
// (detailedComparison items with status missing/partial, and quoted terms in
// missingGaps) and the CV text — never from a static vocabulary. Extraction
// is deliberately conservative: when a concept cannot be isolated with
// confidence it is not denied (a missed leak is preferable to dropping a
// legitimate suggestion).
// ---------------------------------------------------------------------------

export type DeniedConcept = { concept: string; status: 'missing' | 'partial' };

// Words that never form a concept on their own: generic business vocabulary,
// requirement framing ("experience with", "strong"), and the action verbs JD
// requirements start with. A multi-word phrase made only of these is not a
// concept either ("stakeholder communication", "data analysis"). Kept small
// on purpose; it only prevents broad single-word blocking.
const GENERIC = new Set([
  // business vocabulary
  'leadership', 'leader', 'leaders', 'stakeholder', 'stakeholders', 'analytics', 'analysis', 'analyses',
  'metric', 'metrics', 'dashboard', 'dashboards', 'reporting', 'report', 'reports', 'communication',
  'business', 'performance', 'data', 'team', 'teams', 'strategy', 'product', 'products', 'process',
  'processes', 'system', 'systems', 'project', 'projects', 'customer', 'customers', 'user', 'users',
  'management', 'quality', 'insights', 'results', 'growth', 'skills', 'skill', 'knowledge', 'ability',
  'experience', 'years', 'year', 'tools', 'tool', 'environment', 'role', 'work', 'weekly', 'junior',
  'senior', 'strong', 'solid', 'good', 'excellent', 'advanced', 'basic', 'proven', 'relevant', 'related',
  'familiarity', 'understanding', 'background', 'plus', 'preferred', 'required',
  // requirement verbs
  'build', 'create', 'define', 'design', 'develop', 'enable', 'ensure', 'lead', 'maintain', 'manage',
  'mentor', 'own', 'drive', 'support', 'use', 'using', 'apply', 'analyze', 'deliver', 'improve',
  'collaborate', 'partner', 'present', 'track', 'monitor',
]);
// Vietnamese needs no entries: its syllables are separate words, so a phrase
// is overridden as soon as any syllable appears in a Vietnamese CV (see
// deniedConcepts). In practice only named tokens (PCI DSS, Kafka) are denied
// for Vietnamese requirements — a conservative outcome.

const STOPWORDS = new Set([
  'and', 'or', 'with', 'of', 'in', 'on', 'for', 'the', 'a', 'an', 'to', 'at', 'as', 'by', 'from', 'including',
  'e.g', 'eg', 'etc', 'such', 'like', 'is', 'be', 'về', 'và', 'hoặc', 'với', 'của', 'trong', 'các', 'cho',
  'là', 'có', 'như', 'từ', 'một', 'những',
]);

// Lowercase, hyphen/punctuation folded to spaces, whitespace collapsed:
// "Self-Serve" and "self serve" compare equal. No synonyms.
function normalizeText(text: string): string {
  return ` ${text.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}+#.]+/gu, ' ').replace(/\.(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim()} `;
}

function containsPhrase(normalizedHay: string, phrase: string): boolean {
  return normalizedHay.includes(` ${normalizeText(phrase).trim()} `);
}

// A token that names a specific thing on its own: internal capital or
// all-caps acronym (BigQuery, CQRS, PCI), hyphenated compound (north-star,
// self-serve), or digits/dots (GA4, Node.js).
function isNamedToken(raw: string, isFirstWord: boolean): boolean {
  if (/^[A-Za-z][a-z]+[A-Z]/.test(raw) || /[a-z][A-Z]/.test(raw)) return true;
  if (/^[A-Z0-9]{2,}$/.test(raw) && /[A-Z]/.test(raw)) return true;
  if (/\p{L}-\p{L}/u.test(raw)) return true;
  if (/\d/.test(raw) && /\p{L}/u.test(raw)) return true;
  if (/\p{L}\.\p{L}/u.test(raw)) return true;
  // Capitalized mid-sentence word (Looker, Airflow). Sentence-initial words
  // are skipped: "Define …", "Strong …".
  return !isFirstWord && /^\p{Lu}\p{Ll}+$/u.test(raw);
}

const isGeneric = (w: string) => GENERIC.has(w.toLowerCase());
const isStop = (w: string) => STOPWORDS.has(w.toLowerCase().replace(/\.$/, ''));

// Segments of a requirement: list separators and parentheses split it, so
// "SQL and BigQuery" → ["SQL", "BigQuery"] and "Python (pandas, statsmodels)"
// → ["Python", "pandas", "statsmodels"].
function segments(requirement: string): string[] {
  return requirement
    .split(/[,;/()\[\]|]|\s+(?:and|or|&|và|hoặc)\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

function conceptsFromRequirement(requirement: string, status: 'missing' | 'partial'): string[] {
  const out: string[] = [];
  const firstWordOfRequirement = requirement.trim().split(/\s+/)[0];
  for (const seg of segments(requirement)) {
    const words = seg.split(/\s+/).map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}+#]+$/gu, '')).filter(Boolean);
    if (words.length === 0) continue;
    // Named tokens are specific on their own, for missing and partial alike.
    words.forEach((w, i) => {
      const firstWord = i === 0 && (w === firstWordOfRequirement || words.length > 2);
      if (!isStop(w) && !isGeneric(w) && isNamedToken(w, firstWord)) out.push(w);
    });
    // A one-word list item (e.g. "statsmodels" from "Python (pandas, statsmodels)").
    if (words.length === 1 && !isStop(words[0]) && !isGeneric(words[0]) && words[0].length >= 3) out.push(words[0]);
    // Missing only: 2–3 word phrases of content words with at least one
    // non-generic word ("guardrail metrics", "causal inference", "core banking").
    // Partial requirements mix supported and unsupported parts, so phrases
    // are not isolated from them.
    if (status !== 'missing') continue;
    for (let n = 3; n >= 2; n--) {
      for (let i = 0; i + n <= words.length; i++) {
        const gram = words.slice(i, i + n);
        if (gram.some(isStop)) continue;
        if (gram.every(isGeneric)) continue;
        if (isGeneric(gram[0]) && GENERIC_VERB.has(gram[0].toLowerCase())) continue;
        out.push(gram.join(' '));
      }
    }
  }
  return out;
}

const GENERIC_VERB = new Set([
  'build', 'create', 'define', 'design', 'develop', 'enable', 'ensure', 'lead', 'maintain', 'manage', 'mentor',
  'own', 'drive', 'support', 'use', 'using', 'apply', 'analyze', 'deliver', 'improve', 'collaborate', 'partner',
  'present', 'track', 'monitor',
]);

/**
 * Concepts the analysis marked missing/partial that the CV never mentions.
 * A concept is dropped from the list when the CV contains it, or (for
 * phrases) any of its non-generic words — the CV evidence wins over the
 * model's classification.
 */
export function deniedConcepts(
  detailedComparison: DetailedComparison | undefined,
  missingGaps: MissingGap[],
  cvText: string
): DeniedConcept[] {
  const cv = normalizeText(cvText);
  const found = new Map<string, DeniedConcept>();
  const add = (concept: string, status: 'missing' | 'partial') => {
    const words = normalizeText(concept).trim().split(' ');
    if (containsPhrase(cv, concept)) return;
    if (words.length > 1 && words.some((w) => !isGeneric(w) && !isStop(w) && containsPhrase(cv, w))) return;
    const key = normalizeText(concept).trim();
    if (!found.has(key) || status === 'missing') found.set(key, { concept, status });
  };
  const items: ComparisonItem[] = detailedComparison
    ? [...detailedComparison.skills, ...detailedComparison.tools, ...detailedComparison.experience, ...detailedComparison.education, ...detailedComparison.keywords]
    : [];
  for (const item of items) {
    if (item.status === 'matched') continue;
    for (const c of conceptsFromRequirement(item.requirement, item.status)) add(c, item.status);
  }
  // Gap prose is too loose to mine; only explicitly quoted terms count.
  for (const gap of missingGaps) {
    for (const m of gap.content.matchAll(/['"‘“]([^'"’”]{2,40})['"’”]/g)) {
      for (const c of conceptsFromRequirement(m[1], 'missing')) add(c, 'missing');
    }
  }
  return [...found.values()];
}

export type DroppedSuggestion = {
  section: string;
  reason: 'skills-section' | 'unsupported-number' | 'jd-only-concept';
  concept?: string;
  status?: 'missing' | 'partial';
};

/**
 * Last-line guard for rewrite suggestions the prompt forbids but the model
 * still produced in benchmark runs (2026-10-29): a Skills-section rewrite
 * (it can only "improve" by adding skills the CV lacks) or an "optimized"
 * text with a number the CV never states (e.g. "9 năm" for a CV saying
 * "7 năm"). Such a suggestion is dropped rather than repaired — showing
 * fewer suggestions is better than showing a fabricated candidate fact.
 * A suggestion whose "optimized" text contains a concept from
 * deniedConcepts() — something the analysis itself marked missing/partial
 * and the CV never mentions — is dropped too.
 * The number and concept checks need the CV text, so they are skipped for
 * inline PDF/image input; the Skills rule always applies.
 */
export function dropUnsupportedSuggestions(
  suggestions: RewriteSuggestion[],
  cvText: string | undefined,
  denied: DeniedConcept[] = [],
  onDrop?: (d: DroppedSuggestion) => void
): RewriteSuggestion[] {
  const cvNumbers = cvText ? new Set(metricNumbers(cvText)) : null;
  return suggestions.filter((s) => {
    if (/skill|kỹ năng/i.test(s.section)) {
      onDrop?.({ section: s.section, reason: 'skills-section' });
      return false;
    }
    if (!cvNumbers) return true;
    if (!metricNumbers(s.optimized).every((n) => cvNumbers.has(n))) {
      onDrop?.({ section: s.section, reason: 'unsupported-number' });
      return false;
    }
    const optimized = normalizeText(s.optimized);
    const hit = denied.find((d) => containsPhrase(optimized, d.concept));
    if (hit) {
      onDrop?.({ section: s.section, reason: 'jd-only-concept', concept: hit.concept, status: hit.status });
      return false;
    }
    return true;
  });
}
