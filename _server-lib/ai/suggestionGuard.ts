import type { RewriteSuggestion } from '../../src/services/ai/types.js';

// Numbers as a CV would state them ("7", "1,2", "35%"), separators dropped so
// "1,2 triệu" and "1.2M" compare equal. MM/YYYY dates and bare years are
// chronology the pipeline normalizes from the CV's own dates, not metrics.
// stripLeadingZeros (Full CV only): "05" and "5" are the same value — the
// rewrite zero-pads counts ("05 thương hiệu"). Zeros are stripped from the raw
// match before separators are dropped, so "0.5"/"0,5" stay distinct from "5".
function metricNumbers(text: string, stripLeadingZeros = false): string[] {
  const stripped = text
    .replace(/\b\d{1,2}\/(?:19|20)\d{2}\b/g, ' ')
    .replace(/\b(?:19|20)\d{2}\b/g, ' ');
  return (stripped.match(/\d+(?:[.,]\d+)*/g) ?? []).map((n) =>
    (stripLeadingZeros ? n.replace(/^0+(?=\d)/, '') : n).replace(/[.,]/g, '')
  );
}

// Translation check: both texts state the same numeric facts (same Stage 3.3
// normalization, leading zeros ignored) and the same years. Stricter than the
// rewrite guard, which ignores years — a translation must not change them.
export function sameNumericFacts(source: string, translated: string): boolean {
  const years = (t: string) => new Set(t.match(/\b(?:19|20)\d{2}\b/g) ?? []);
  const same = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));
  return (
    same(new Set(metricNumbers(source, true)), new Set(metricNumbers(translated, true))) &&
    same(years(source), years(translated))
  );
}

// A JD term that must not enter "optimized" unless the CV states it. Only
// the raw-JD extractor below produces these. (Concepts derived from the
// analysis — detailedComparison / missingGaps — were tried and dropped
// truthful suggestions in benchmarks, e.g. "Nội" from "Hà Nội" blocking
// "nội dung"; the analysis never decides what is filtered.)
export type DeniedConcept = { concept: string; source: 'raw-jd' };

// Generic vocabulary: a hyphenated JD compound made only of these words (and
// stopwords) is not a distinctive term. Kept small on purpose.
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

/** `phrase` occurs in `text` under the same normalization the guards use. */
export function textContainsPhrase(text: string, phrase: string): boolean {
  return containsPhrase(canonicalText(text), phrase);
}

// Requirement wording that is not a concept: thresholds, proficiency words,
// "building … applications". Compared lowercased, after GENERIC/STOPWORDS.
const REQUIREMENT_FILLER = new Set([
  'experience', 'experienced', 'proficiency', 'proficient', 'familiar', 'hands-on', 'working', 'ability',
  'degree', 'field', 'nice', 'have', 'must', 'present', 'month', 'months', 'application', 'applications',
  'app', 'apps', 'development', 'developing', 'building', 'modern', 'web', 'writing', 'write',
  'kinh', 'nghiệm', 'năm', 'tháng', 'kỹ', 'năng', 'thành', 'thạo', 'hiểu', 'biết', 'khả', 'tốt', 'vững',
]);
const isRequirementFiller = (w: string) => isGeneric(w) || isStop(w) || REQUIREMENT_FILLER.has(w.toLowerCase());
const isNumeric = (w: string) => /^\d+(?:[.,]\d+)?[+%]?$/.test(w);

// Named concepts (React, TypeScript, WCAG, Next.js, Google Analytics):
// tokens with an uppercase letter. GENERIC words stay inside a requirement's
// names ("Analytics" in "Google Analytics") but are dropped from evidence
// quotes ("Listed in Skills: Figma"). A plain Capitalized word opening a
// sentence is a name only when a list follows it ("React and TypeScript",
// "Google Analytics"); "Deep understanding of React" or "Am hiểu React" is not.
// Case-sensitive on purpose: with the i flag \p{Lu} also matches lowercase.
const LIST_CONNECTOR = /^\s*(?:,|&|\/|[Aa]nd\b|[Vv]à(?![\p{L}])|\p{Lu})/u;
function namedTerms(text: string, dropGeneric = false): { terms: string[]; firstWord?: string } {
  const terms: string[] = [];
  let firstWord: string | undefined;
  const skip = (w: string) => isNumeric(w) || isStop(w) || REQUIREMENT_FILLER.has(w.toLowerCase()) || (dropGeneric && isGeneric(w));
  // A period only ends a sentence before whitespace ("Next.js" stays one token).
  const sentences = text.split(/(?<=[.!?:;])\s+|(?<=\()|\n+/);
  sentences.forEach((sentence, s) => {
    // After a label ("Skills: Figma") the first word is a list item, not a sentence start.
    const afterLabel = s > 0 && /:\s*$/.test(sentences[s - 1]);
    for (const m of sentence.matchAll(/[\p{L}\p{N}][\p{L}\p{N}+#.&'’/-]*/gu)) {
      const w = m[0].replace(/['’]s$/i, '').replace(/[.'’-]+$/, '');
      if (!/\p{Lu}/u.test(w) || w.length < 2 || skip(w)) continue;
      if (!afterLabel && m.index === sentence.search(/[\p{L}\p{N}]/u) && /^\p{Lu}[\p{Ll}'’-]*$/u.test(w)) {
        if (s === 0 && LIST_CONNECTOR.test(sentence.slice(m.index + m[0].length))) firstWord = w;
        continue;
      }
      if (!terms.includes(w)) terms.push(w);
    }
  });
  return { terms, firstWord };
}

function alternativeCovered(alt: string, letter: string): boolean | 'unnamed' {
  const { terms, firstWord } = namedTerms(alt);
  const has = (w: string) => containsPhrase(letter, w);
  // Named concepts decide; a capitalized first word in a list of names
  // ("React and TypeScript") is required with them.
  if (terms.length) return [...terms, ...(firstWord ? [firstWord] : [])].every(has);
  const words = normalizeText(alt).trim().split(' ').filter((w) => w.length > 1 && !isNumeric(w));
  let required = words.filter((w) => !isRequirementFiller(w));
  // Only generic words ("design systems"): the phrase itself must be there.
  if (!required.length) required = words.filter((w) => !isStop(w) && !REQUIREMENT_FILLER.has(w));
  if (!required.length) return false;
  return required.every(has) || 'unnamed';
}

/**
 * P1B: does the cover letter address this (matched/partial) requirement?
 * Coverage, not satisfaction: "React" covers "3+ years of React" (the letter
 * need not restate the threshold). Deterministic and conservative:
 *   - "or" alternatives: one is enough;
 *   - named concepts (capitalized/acronym/mixed-case) must ALL be in the letter;
 *   - otherwise every non-generic content word must be; generic overlap
 *     ("application development", "design") never counts;
 *   - only when the requirement names no concept, the canonical cvEvidence's
 *     named concepts may bridge ("Component tests" ← evidence "tests with
 *     Jest" ← letter "testing with Jest"). Evidence alone never covers.
 * Whole tokens under the guard normalization; no translation.
 */
export function requirementCoveredByLetter(req: { requirement: string; cvEvidence?: string }, letter: string): boolean {
  const body = canonicalText(letter);
  const alternatives = req.requirement.split(/\s+(?:or|hoặc)\s+|\s*,\s*or\s+/i);
  const results = alternatives.map((alt) => alternativeCovered(alt, body));
  if (results.includes(true)) return true;
  // Evidence bridge only for requirements that name no concept at all.
  if (!req.cvEvidence || !alternatives.every((alt) => !namedTerms(alt).terms.length)) return false;
  const evidence = namedTerms(req.cvEvidence, true).terms;
  return evidence.length > 0 && evidence.every((t) => containsPhrase(body, t));
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

const isGeneric = (w: string) => GENERIC.has(w.toLowerCase());
const isStop = (w: string) => STOPWORDS.has(w.toLowerCase().replace(/\.$/, ''));

// ---------------------------------------------------------------------------
// Distinctive terms taken straight from the raw JD.
//
// The model sometimes writes a JD term into "optimized" ("…self-serve Tableau
// dashboards") even when its own analysis never listed it. The raw JD is used
// here only to answer "did this distinctive term originate in the
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
    // Mixed-case identifiers: take each word, then test for a lower→upper
    // transition. A single pattern with overlapping quantifiers backtracks
    // polynomially on long JD input (CodeQL js/polynomial-redos).
    for (const m of line.matchAll(/\b[A-Za-z][A-Za-z0-9]*\b/g)) if (/[a-z][A-Z]/.test(m[0])) add(m[0]);
  }
  return [...out.values()];
}

export type FullRewriteViolation = { reason: 'unsupported-number' | 'raw-jd'; concept: string };
export type FullRewriteValidation = { valid: boolean; violations: FullRewriteViolation[] };

/**
 * Same numeric + raw-JD policy as dropUnsupportedSuggestions, applied to the
 * whole rewritten CV. Detect only: the caller decides what to do (retry or
 * withhold the CV); nothing is deleted from the Markdown here.
 * The contact preamble (everything before the first "##" section) is not
 * checked: the prompt reserves it for "# Name" + contact lines, where the
 * same phone number re-spaced ("0912 345 678" → "0912345678") or a "LinkedIn"
 * label for a CV that only has "linkedin.com/in/…" is truthful CV data, not
 * a fabricated fact. `originalCvText` must be the exact text the model was
 * given; without it there is no evidence and the caller must skip validation.
 */
export function validateFullRewrite({
  originalCvText,
  jd,
  rewrittenCv,
}: {
  originalCvText: string;
  jd: string;
  rewrittenCv: string;
}): FullRewriteValidation {
  const firstSection = rewrittenCv.search(/^##\s/m);
  const body = firstSection > 0 ? rewrittenCv.slice(firstSection) : rewrittenCv;
  const cvNumbers = new Set(metricNumbers(originalCvText, true));
  const violations: FullRewriteViolation[] = [];
  for (const n of new Set(metricNumbers(body, true))) {
    if (!cvNumbers.has(n)) violations.push({ reason: 'unsupported-number', concept: n });
  }
  const canonicalBody = canonicalText(body);
  for (const d of rawJdConcepts(jd, originalCvText)) {
    if (containsPhrase(canonicalBody, d.concept)) violations.push({ reason: 'raw-jd', concept: d.concept });
  }
  return { valid: violations.length === 0, violations };
}

// ---------------------------------------------------------------------------
// Cover letter (P1A). Stricter than the Full CV guard because a letter is
// prose: rawJdConcepts skips plain Capitalized words (Kubernetes, Docker,
// Python), so any Capitalized term outside the CV is checked here, wherever
// it came from (JD or neither). The whole text is scanned — a letter has no
// contact preamble. Lexical only: a term the CV contains passes even when the
// CV text itself was an injected instruction ("I worked at Google").
// ---------------------------------------------------------------------------
export type CoverLetterViolation = {
  reason: 'unsupported-number' | 'spelled-number' | 'raw-jd' | 'unsupported-term' | 'jd-copy' | 'strength-claim';
  concept: string;
};

// Letter vocabulary that is capitalized by convention (greeting, sign-off,
// Vietnamese forms of address), compared lowercased. "Manager" is not here:
// only the greeting phrase is exempt, so "Marketing Manager" is still checked.
const LETTER_WORDS = new Set([
  'dear', 'hiring', 'team', 'recruitment', 'recruiting', 'talent', 'acquisition',
  'human', 'resources', 'hr', 'sincerely', 'regards', 'best', 'kind', 'yours', 'faithfully', 'respectfully',
  'sir', 'madam', 'mr', 'mrs', 'ms',
  'kính', 'gửi', 'bộ', 'phận', 'tuyển', 'dụng', 'phòng', 'nhân', 'sự', 'ban', 'lãnh', 'đạo', 'quản', 'lý',
  'nhà', 'quý', 'công', 'ty', 'anh', 'chị', 'ông', 'bà', 'trân', 'trọng', 'thân', 'ái',
  // calendar words (a CV "06/2022" written as "June 2022"), currency codes,
  // generic UI/UX and the country name
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october',
  'november', 'december', 'vnd', 'usd', 'ui', 'ux', 'vietnam',
]);
const GREETING = /\b(?:hiring|recruiting|recruitment|talent acquisition)\s+(?:managers?|team)\b/giu;

// Cross-language equivalents (VI CV ↔ EN letter and back): a letter phrase
// passes when the CV states any phrase of its group. Seniority (Senior, Lead,
// Manager, Head) and degree level stay distinct on purpose — no group maps
// Bachelor to Master or Specialist to Manager. School/company names have no
// group: translating them is not allowed.
const EQUIVALENTS: string[][] = [
  ['english', 'tiếng anh'],
  ['vietnamese', 'tiếng việt'],
  ['japanese', 'tiếng nhật'],
  ['korean', 'tiếng hàn'],
  ['chinese', 'mandarin', 'tiếng trung', 'tiếng hoa'],
  ['french', 'tiếng pháp'],
  ['german', 'tiếng đức'],
  ['bachelor', 'cử nhân'],
  ['master', 'thạc sĩ'],
  ['engineer', 'engineering', 'kỹ sư', 'kỹ thuật'],
  ['software', 'phần mềm'],
  ['university', 'đại học'],
  ['specialist', 'chuyên viên'],
  ['intern', 'internship', 'thực tập sinh', 'thực tập'],
  ['developer', 'lập trình viên'],
];
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const NUMBER_WORDS: Record<string, string> = {
  two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10',
  eleven: '11', twelve: '12', fifteen: '15', twenty: '20', thirty: '30', fifty: '50', hundred: '100',
  hai: '2', ba: '3', bốn: '4', năm: '5', sáu: '6', bảy: '7', tám: '8', chín: '9', mười: '10',
};
// A number word stating a candidate quantity: "eight years", "tám năm".
// "one"/"một" are left out: mostly an article ("một người cầu tiến").
const SPELLED_QUANTITY =
  /(?<![\p{L}])(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|fifty|hundred)\+?\s+(?:years?|months?|percent|projects?|products?|clients?|people|members?)\b|(?<![\p{L}])(hai|ba|bốn|năm|sáu|bảy|tám|chín|mười)\s+(?:năm|tháng|dự án|sản phẩm|khách hàng)(?![\p{L}])/giu;

// Scale/domain/leadership qualifiers the model added to roughly 30% of
// letters (benchmark 2026-11-01: "large-scale", "e-commerce", "led" for a CV
// saying "built", "thương mại điện tử lớn"). Each group passes only when the
// CV states one of its phrases. A bounded list, not a classifier: other
// embellishment is left to the P1B reviewer.
const STRENGTH_CLAIMS: string[][] = [
  ['large-scale', 'large scale', 'quy mô lớn'],
  ['high-impact', 'high-traffic', 'mission-critical', 'enterprise-grade'],
  ['e-commerce', 'ecommerce', 'thương mại điện tử'],
  ['fintech'],
  ['millions of', 'hàng triệu'],
  ['led', 'lead', 'leading', 'spearheaded', 'chủ trì', 'dẫn dắt'],
  ['extensive', 'extensively'],
  ['proven track record'],
];

const JD_COPY_WINDOW = 8;

function ngrams(text: string, n: number): string[] {
  const tokens = normalizeText(text).trim().split(' ').filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i + n <= tokens.length; i++) out.push(tokens.slice(i, i + n).join(' '));
  return out;
}

/**
 * Detect only; the caller retries or withholds the letter. `allowedPhrases`
 * are the employer/role names the caller verified verbatim in the JD; their
 * exact occurrences are removed before any check, so naming the employer is
 * allowed but a JD skill inside the role title is not whitelisted elsewhere.
 * `cvText` must be the exact CV text the model was given.
 */
export function validateCoverLetter({
  cvText,
  jd,
  letter,
  allowedPhrases = [],
}: {
  cvText: string;
  jd: string;
  letter: string;
  allowedPhrases?: string[];
}): { valid: boolean; violations: CoverLetterViolation[] } {
  let text = letter.normalize('NFC');
  for (const p of allowedPhrases) {
    if (p.trim()) text = text.split(p.normalize('NFC')).join(' ');
  }
  const cv = canonicalText(cvText);
  // Greeting and cross-language equivalents only exempt the term check below.
  let termText = text.replace(GREETING, ' ');
  for (const group of EQUIVALENTS) {
    if (!group.some((phrase) => containsPhrase(cv, phrase))) continue;
    for (const phrase of group) {
      termText = termText.replace(new RegExp(`(?<![\\p{L}])${escapeRe(phrase)}(?:['’]s)?(?![\\p{L}])`, 'giu'), ' ');
    }
  }
  const violations: CoverLetterViolation[] = [];
  const add = (reason: CoverLetterViolation['reason'], concept: string) => {
    if (!violations.some((v) => v.reason === reason && v.concept === concept)) violations.push({ reason, concept });
  };

  const cvNumbers = new Set(metricNumbers(cvText, true));
  for (const n of metricNumbers(text, true)) if (!cvNumbers.has(n)) add('unsupported-number', n);
  for (const m of text.matchAll(SPELLED_QUANTITY)) {
    const digit = NUMBER_WORDS[(m[1] ?? m[2]).toLowerCase()];
    if (!cvNumbers.has(digit)) add('spelled-number', m[0]);
  }

  const body = canonicalText(text);
  for (const d of rawJdConcepts(jd, cvText)) if (containsPhrase(body, d.concept)) add('raw-jd', d.concept);

  // Capitalized terms: every token with an uppercase letter except a plain
  // Capitalized word opening a sentence/line (the language's own rule);
  // acronyms and mixed-case identifiers are checked even there.
  // shortcut: a fabricated plain proper noun that opens a sentence is missed;
  // upgrade to a reviewer (P1B) if benchmarks show it.
  for (const sentence of termText.split(/(?<=[.!?:;])\s+|\n+/)) {
    const words = sentence.match(/[\p{L}\p{N}][\p{L}\p{N}+#.&'’-]*/gu) ?? [];
    words.forEach((raw, i) => {
      const w = raw.replace(/['’]s$/i, '').replace(/[.'’-]+$/, '');
      if (!/\p{Lu}/u.test(w) || w.length < 2 || /^i['’]/i.test(w)) return;
      const plainCapitalized = /^\p{Lu}[\p{Ll}'’-]*$/u.test(w);
      if (i === 0 && plainCapitalized) return;
      // "React-based", "SEO-friendly": only the capitalized parts are terms.
      for (const part of w.includes('-') ? w.split('-').filter((x) => /\p{Lu}/u.test(x)) : [w]) {
        if (LETTER_WORDS.has(part.toLowerCase()) || containsPhrase(cv, part)) continue;
        add('unsupported-term', part);
      }
    });
  }

  const termBody = canonicalText(termText);
  for (const group of STRENGTH_CLAIMS) {
    if (group.some((phrase) => containsPhrase(cv, phrase))) continue;
    const hit = group.find((phrase) => containsPhrase(termBody, phrase));
    if (hit) add('strength-claim', hit);
  }

  // Long verbatim JD passages (requirements copied as candidate prose, or an
  // echoed instruction) unless the CV states the same words.
  const jdGrams = new Set(ngrams(jd, JD_COPY_WINDOW));
  const cvGrams = new Set(ngrams(cvText, JD_COPY_WINDOW));
  for (const g of ngrams(text, JD_COPY_WINDOW)) {
    if (jdGrams.has(g) && !cvGrams.has(g)) {
      add('jd-copy', g);
      break;
    }
  }

  return { valid: violations.length === 0, violations };
}

export type CoverLetterViolationCounts = {
  unsupportedNumber: number;
  spelledNumber: number;
  rawJd: number;
  unsupportedTerm: number;
  jdCopy: number;
  strengthClaim: number;
};

export function countCoverLetterViolations(violations: CoverLetterViolation[]): CoverLetterViolationCounts {
  const n = (r: CoverLetterViolation['reason']) => violations.filter((v) => v.reason === r).length;
  return {
    unsupportedNumber: n('unsupported-number'),
    spelledNumber: n('spelled-number'),
    rawJd: n('raw-jd'),
    unsupportedTerm: n('unsupported-term'),
    jdCopy: n('jd-copy'),
    strengthClaim: n('strength-claim'),
  };
}

// ---------------------------------------------------------------------------
// Guard telemetry (analysis_log.guard_metrics, v1). Aggregate counters and
// state only — never a concept, number, CV/JD/suggestion/rewrite text or PII.
// See docs/11_guard_metrics.md.
// ---------------------------------------------------------------------------
export type ViolationCounts = { unsupportedNumber: number; rawJd: number };

export type SuggestionGuardMetrics = {
  suggestionsIn: number;
  droppedTotal: number;
  skills: number;
  numeric: number;
  rawJd: number;
  // CV text was available, so the numeric/raw-JD checks could run. false
  // (inline PDF/image) does not mean no guard ran: the Skills rule still does.
  factualChecks: boolean;
};

export type FullCvRetryOutcome = 'not_needed' | 'skipped_budget' | 'error' | 'invalid' | 'recovered';

export type FullCvGuardMetrics = {
  validationAttempted: boolean;
  validationSkipped: boolean;
  firstPassValid: boolean | null;
  firstPassViolations?: ViolationCounts;
  retryOutcome: FullCvRetryOutcome;
  retryViolations?: ViolationCounts;
  fidelityFallback: boolean;
  // 2 once the retry call was started, even if it errored (its usage is then
  // missing from the token totals).
  geminiCalls: 1 | 2;
};

/** P0 requirement verification counts (analyze only; absent on older rows). */
export type RequirementVerificationMetrics = { rows: number; met: number; unmet: number; unknown: number };

/**
 * P1A cover letter (kind='rewrite' rows; the kind CHECK has no cover_letter).
 * Present on every cover-letter row, success or error, so they can be told
 * apart from Full CV rows and counted for their own hourly cap.
 */
export type CoverLetterGuardMetrics = {
  language: 'vi' | 'en';
  outcome: 'valid' | 'recovered' | 'fallback' | 'error';
  // Failure category on error rows ("gemini_timeout", ...).
  category?: string;
  firstPassViolations?: CoverLetterViolationCounts;
  retryViolations?: CoverLetterViolationCounts;
  retryOutcome?: FullCvRetryOutcome;
  geminiCalls: 0 | 1 | 2;
};

export type ReviewSeverityCounts = { high: number; medium: number; low: number };
export type ReviewCategoryCounts = {
  unsupportedClaim: number;
  numericClaim: number;
  consistency: number;
  requirementGap: number;
  relevance: number;
  tone: number;
};

/**
 * P1B application review (kind='rewrite' rows, one per request). Counts and
 * states only. `droppedFindings` = reviewer findings the server rejected
 * (quote not in the letter, unknown requirement, verbatim-supported claim).
 */
export type ApplicationReviewGuardMetrics = {
  language: 'vi' | 'en';
  outcome: 'ready' | 'review' | 'error';
  category?: string;
  deterministic?: CoverLetterViolationCounts;
  severity?: ReviewSeverityCounts;
  categories?: ReviewCategoryCounts;
  droppedFindings?: number;
  revision?: 'not_needed' | 'skipped_budget' | 'error' | 'invalid' | 'shipped';
  geminiCalls: 0 | 1 | 2;
};

export type GuardMetrics =
  | { v: 1; suggestionGuard: SuggestionGuardMetrics; requirementVerification?: RequirementVerificationMetrics }
  | { v: 1; fullCv: FullCvGuardMetrics }
  | { v: 1; coverLetter: CoverLetterGuardMetrics }
  | { v: 1; applicationReview: ApplicationReviewGuardMetrics };

export function countViolations(violations: FullRewriteViolation[]): ViolationCounts {
  return {
    unsupportedNumber: violations.filter((v) => v.reason === 'unsupported-number').length,
    rawJd: violations.filter((v) => v.reason === 'raw-jd').length,
  };
}

export type DroppedSuggestion = {
  section: string;
  reason: 'skills-section' | 'unsupported-number' | 'unsupported-jd-concept';
  concept?: string;
  source?: 'raw-jd';
  matchedForm?: string;
};

/**
 * Last-line guard for rewrite suggestions the prompt forbids but the model
 * still produced in benchmark runs (2026-10-29): a Skills-section rewrite
 * (it can only "improve" by adding skills the CV lacks) or an "optimized"
 * text with a number the CV never states (e.g. "9 năm" for a CV saying
 * "7 năm"). Such a suggestion is dropped rather than repaired — showing
 * fewer suggestions is better than showing a fabricated candidate fact.
 * A suggestion whose "optimized" text contains a distinctive JD term from
 * rawJdConcepts() that the CV never states is dropped too. Lowercase JD
 * concepts ("guardrail metrics") are deliberately not caught: a missed
 * leak is preferred over deleting truthful CV content.
 * The number and JD-term checks need the CV text, so they are skipped for
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
          matchedForm: matchedForm(s.optimized, hit.concept),
        },
        s
      );
      return false;
    }
    return true;
  });
}
