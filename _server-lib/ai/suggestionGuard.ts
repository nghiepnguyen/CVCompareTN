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

export type DeniedConcept = {
  concept: string;
  source: 'analysis' | 'raw-jd';
  // Only for analysis-derived concepts: the status of the requirement it came from.
  status?: 'missing' | 'partial';
  // Set when the concept is the single distinctive word of a longer phrase.
  derivedFrom?: string;
};

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

// Regular English plural → singular, for lexical evidence matching only (no
// stemming, lemmatization or fuzzy matching). Applied identically to the CV,
// the concept and the rewrite, so blocking is never looser than CV override.
// Conservative by design — when unsure the token is left as is:
//   - only pure-letter tokens of 4+ characters ("aws", "node.js" untouched)
//   - "-ies" → "-y"                         (policies → policy)
//   - "-sses/-shes/-ches/-xes/-zes" → drop "es" (boxes → box)
//   - other "-s" → drop "s", except "-ss", "-us", "-is"
//     (guardrails → guardrail, analysts → analyst; but business, process,
//      status, analysis stay intact)
// A missed irregular form is only a false negative.
export function canonicalToken(token: string): string {
  if (token.length < 4 || !/^\p{L}+$/u.test(token)) return token;
  if (token.endsWith('ies') && token.length > 4) return `${token.slice(0, -3)}y`;
  if (/(?:sses|shes|ches|xes|zes)$/.test(token)) return token.slice(0, -2);
  if (token.endsWith('s') && !/(?:ss|us|is)$/.test(token)) return token.slice(0, -1);
  return token;
}

// normalizeText with each token in canonical (singular) form.
function canonicalText(text: string): string {
  return ` ${normalizeText(text).trim().split(' ').map(canonicalToken).join(' ')} `;
}

function containsPhrase(canonicalHay: string, phrase: string): boolean {
  return canonicalHay.includes(canonicalText(phrase));
}

// The surface form in `text` that matched `phrase` (debug provenance only).
function matchedForm(text: string, phrase: string): string | undefined {
  const tokens = normalizeText(text).trim().split(' ');
  const target = canonicalText(phrase).trim().split(' ');
  for (let i = 0; i + target.length <= tokens.length; i++) {
    if (target.every((t, j) => canonicalToken(tokens[i + j]) === t)) return tokens.slice(i, i + target.length).join(' ');
  }
  return undefined;
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

type ExtractedConcept = { concept: string; derivedFrom?: string };

function conceptsFromRequirement(requirement: string, status: 'missing' | 'partial'): ExtractedConcept[] {
  const out: ExtractedConcept[] = [];
  const firstWordOfRequirement = requirement.trim().split(/\s+/)[0];
  for (const seg of segments(requirement)) {
    const words = seg.split(/\s+/).map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}+#]+$/gu, '')).filter(Boolean);
    if (words.length === 0) continue;
    // Named tokens are specific on their own, for missing and partial alike.
    words.forEach((w, i) => {
      const firstWord = i === 0 && (w === firstWordOfRequirement || words.length > 2);
      if (!isStop(w) && !isGeneric(w) && isNamedToken(w, firstWord)) out.push({ concept: w });
    });
    // A one-word list item (e.g. "statsmodels" from "Python (pandas, statsmodels)").
    if (words.length === 1 && !isStop(words[0]) && !isGeneric(words[0]) && words[0].length >= 3) out.push({ concept: words[0] });
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
        out.push({ concept: gram.join(' ') });
        // Exactly one distinctive word among generic ones ("guardrail metrics")
        // carries the concept alone, so it is denied too ("…operational
        // guardrails"). Phrases with 2+ distinctive words ("causal inference")
        // stay whole — splitting them would turn the guard into a bag of words.
        const distinctive = gram.filter((w) => !isGeneric(w) && !isStop(w));
        if (distinctive.length === 1 && distinctive[0].length >= 4) {
          out.push({ concept: distinctive[0], derivedFrom: gram.join(' ') });
        }
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
  const cv = canonicalText(cvText);
  const found = new Map<string, DeniedConcept>();
  const add = ({ concept, derivedFrom }: ExtractedConcept, status: 'missing' | 'partial') => {
    const words = normalizeText(concept).trim().split(' ');
    if (containsPhrase(cv, concept)) return;
    if (words.length > 1 && words.some((w) => !isGeneric(w) && !isStop(w) && containsPhrase(cv, w))) return;
    const key = normalizeText(concept).trim();
    if (!found.has(key) || status === 'missing') {
      found.set(key, { concept, source: 'analysis', status, ...(derivedFrom ? { derivedFrom } : {}) });
    }
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

// ---------------------------------------------------------------------------
// Distinctive terms taken straight from the raw JD.
//
// The analysis sometimes folds a JD concept into a broader row ("self-serve
// dashboards" into "Looker"), leaving the guard above nothing to deny. The raw
// JD is used here only to answer "did this distinctive term originate in the
// JD?"; the CV answers "did the candidate state it?". A term that is in the JD
// but not the CV and that a rewrite introduces is unsafe as candidate history.
// This never implies the candidate lacks the capability.
//
// Only high-confidence lexical markers are taken — never generic words,
// arbitrary phrases, or plain Capitalized words (headings, sentence starts,
// company names):
//   1. hyphenated compounds (self-serve, north-star, cross-functional)
//   2. acronyms / identifiers with 3+ characters or a digit (GA4, PCI, CQRS, ETL)
//   3. mixed-case identifiers (BigQuery, OpenTelemetry, NestJS)
// ---------------------------------------------------------------------------

// Hyphenated style/employment words a grounded rewrite may use as a plain
// paraphrase of the CV ("data-driven" for "turning data into decisions"), or
// that describe the job rather than the candidate's history.
const STYLE_HYPHENATED = new Set([
  'data-driven', 'results-driven', 'detail-oriented', 'self-motivated', 'fast-paced', 'high-quality',
  'well-known', 'world-class', 'full-time', 'part-time', 'long-term', 'short-term', 'day-to-day',
  'up-to-date', 'hands-on', 'follow-up', 'one-on-one', 'on-site', 'in-house', 'well-being', 'e-mail',
]);

// Acronyms that name a place, role or document rather than a skill/practice.
const NON_CONCEPT_ACRONYMS = new Set([
  'APAC', 'EMEA', 'USA', 'HCM', 'CEO', 'CTO', 'CFO', 'COO', 'EEO', 'FAQ', 'ASAP', 'JD', 'CV', 'NB',
]);

export function rawJdConcepts(jd: string, cvText: string): DeniedConcept[] {
  const cv = canonicalText(cvText);
  const out = new Map<string, DeniedConcept>();
  const add = (term: string) => {
    if (containsPhrase(cv, term)) return; // CV evidence wins
    const key = normalizeText(term).trim();
    if (key && !out.has(key)) out.set(key, { concept: term, source: 'raw-jd' });
  };
  for (const line of jd.split(/\n/)) {
    // All-caps lines are headings ("REQUIREMENTS"), not content.
    const letters = line.replace(/[^\p{L}]/gu, '');
    if (letters.length > 3 && letters === letters.toUpperCase()) continue;
    for (const m of line.matchAll(/\p{L}+(?:-\p{L}+)+/gu)) {
      const term = m[0];
      const parts = term.toLowerCase().split('-');
      if (STYLE_HYPHENATED.has(term.toLowerCase())) continue;
      if (parts.every((p) => isGeneric(p) || isStop(p))) continue;
      add(term);
    }
    for (const m of line.matchAll(/\b[A-Z][A-Z0-9]{1,5}\b/g)) {
      const term = m[0];
      if (NON_CONCEPT_ACRONYMS.has(term)) continue;
      if (term.length < 3 && !/\d/.test(term)) continue; // AI, BI, UX… too ambiguous
      add(term);
    }
    for (const m of line.matchAll(/\b[A-Za-z]*[a-z][A-Z][A-Za-z0-9]*\b/g)) add(m[0]);
  }
  return [...out.values()];
}

export type DroppedSuggestion = {
  section: string;
  reason: 'skills-section' | 'unsupported-number' | 'unsupported-jd-concept';
  concept?: string;
  source?: 'analysis' | 'raw-jd';
  status?: 'missing' | 'partial';
  derivedFrom?: string;
  matchedForm?: string;
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
  onDrop?: (d: DroppedSuggestion, suggestion: RewriteSuggestion) => void
): RewriteSuggestion[] {
  const cvNumbers = cvText ? new Set(metricNumbers(cvText)) : null;
  return suggestions.filter((s) => {
    if (/skill|kỹ năng/i.test(s.section)) {
      onDrop?.({ section: s.section, reason: 'skills-section' }, s);
      return false;
    }
    if (!cvNumbers) return true;
    if (!metricNumbers(s.optimized).every((n) => cvNumbers.has(n))) {
      onDrop?.({ section: s.section, reason: 'unsupported-number' }, s);
      return false;
    }
    const optimized = canonicalText(s.optimized);
    const hit = denied.find((d) => containsPhrase(optimized, d.concept));
    if (hit) {
      onDrop?.(
        {
          section: s.section,
          reason: 'unsupported-jd-concept',
          concept: hit.concept,
          source: hit.source,
          status: hit.status,
          ...(hit.derivedFrom ? { derivedFrom: hit.derivedFrom } : {}),
          matchedForm: matchedForm(s.optimized, hit.concept),
        },
        s
      );
      return false;
    }
    return true;
  });
}
