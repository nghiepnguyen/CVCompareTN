# Canonical scoring + narrow localization (Stage 3.7)

Since 2026-10-30 `/api/analyze` scores every CV with **one canonical judge**,
whatever the UI language. Stage 3.6 showed that the UI language used to swap
the whole scoring prompt (VI ↔ EN) and that both the instruction language and
the output language moved MatchScore by roughly 4–10 points on identical
documents, with the evidence classification unchanged (calibration, not
extraction).

## Flow

```
CV + JD
→ scoring pass: production EN prompt + "Job Description (JD):" header + EN prose
   (identical request for UI en and vi)
→ suggestion guard (dropUnsupportedSuggestions, unchanged; guard_metrics unchanged)
→ canonical AnalysisResult (scoreVersion = canonical-en-v1)
→ UI en: done (1 Gemini call)
→ UI vi: localizeAnalysis — 0 or 1 extra call, presentation strings only
→ validated merge by id
```

Code: `_server-lib/ai/analysisService.ts`, `_server-lib/ai/localizeAnalysis.ts`.

## Immutable vs localized fields

Localization can replace **only**: `passExplanation` (legacy results only; empty
on canonical rows since Stage 3.13C), `mainFactor`,
`matchingPoints[].content`, `missingGaps[].content`,
`detailedComparison.*[].improvement`, `rewriteSuggestions[].explanation`,
`formatAssessment.formatIssues[]`.

Everything else is never sent to or taken from the localization call: scores,
category scores, every enum, `jobTitle`, `atsKeywords`, `requirement`,
`cvEvidence`, `rewriteSuggestions[].section/original/optimized`, array order and
length. `machineProjection()` is the test helper for this boundary.

## Canonical probability (Stage 3.13C)

`passProbability` is no longer authored by the model. After `matchScore` is
finalized, the server derives it with `derivePassProbability()`
(`src/services/ai/canonicalProbability.ts`): `>= 80` High, `>= 60` Medium,
otherwise Low; `probabilityVersion = 'canonical-score-v1'`.
`successProbability` is only a compatibility mirror and `passExplanation` is
empty on canonical rows. `probabilityVersion` (`history.probability_version`,
`candidate_cvs.probability_version`) is the canonical/legacy boundary: NULL rows
keep their stored values and are never recomputed. Displays go through
`resolveProbability(result, surface)`. Contract:
`docs/audits/stage-3.13b-canonical-probability-contract.md`.

The localization prompt receives only `[{id, text}]` presentation strings (no
CV, JD, evidence or scores), treats them as untrusted data, and must keep
meaning, certainty and every number; Vietnamese wording for missing evidence
is "CV chưa thể hiện / chưa cho thấy …". A translated string is accepted only if
its id is allowed, appears once, is non-empty and states the same numeric facts
(Stage 3.3 normalization incl. leading zeros, plus identical years) — otherwise
that string stays English.

## Metadata

- `scoreVersion`: `canonical-en-v1` for new analyses. Absent / `NULL` =
  **legacy** analysis scored with the UI-language prompt. Legacy scores are
  never rescored and are not 1:1 comparable with canonical ones.
- `presentationLanguage`: language the prose was actually delivered in. A VI
  request is `en` when localization was skipped or failed; the analysis tab then
  shows a short note (`analysisShownInEnglish`). `language` mirrors it.

Persistence: `history.score_version` (+ `history.language` = presentation
language for canonical rows) and `candidate_cvs.score_version` (set by
`save_candidate_analysis` from the result's `scoreVersion`). Migration
`supabase/migrations/20261030000000_score_version.sql` — **apply and verify it
before deploying the app**, otherwise new history inserts fail.

## Deadline and fallback

Both calls share the analyze AI deadline (65s request − 6s reserve,
`_server-lib/deadline.ts`). Localization runs only with ≥ 15s left
(`MIN_LOCALIZATION_BUDGET_MS`) and is capped at 20s (`LOCALIZATION_CAP_MS`) with
a real AbortSignal. Skip, timeout, error or malformed output → the canonical
English analysis is returned with HTTP 200; a presentation failure never fails
the analysis. Thresholds are provisional (benchmark 2026-10-30: localization
p50 4.5s, p95 5.7s, max 6.5s over 20 calls).

Telemetry: still one `analysis_log` row; tokens of both calls are summed under
the scoring model (`gemini-3-flash-preview`). Localization uses the same model
on purpose — a different model would make per-row pricing ambiguous.

## Single score authority (Stage 3.8B)

`matchScore` is the only CV↔JD score. `/api/parse-cv` used to ask its own
model (`gemini-3.5-flash-lite`, UI-language prompt) for
`ats_evaluation.relevant_score`, a second judgment of the same fit; Stage 3.8B
removed it from the parse prompts and `PARSED_CV_SCHEMA`, and the Parsed CV tab
no longer shows it or a discrepancy badge. `relevant_score` survives only in
legacy `history.parsed_cv` JSON (optional field, read safely by
`normalizeParsedCV`, never displayed, never rewritten). No new score version.

## Single semantic authority (Stage 3.9B)

Canonical analyze is also the only authority on *what* matches or is missing.
Stage 3.9A found the parse model's `key_match_highlights` / `missing_keywords`
re-judged the same facts, drifted with UI language, and listed literal
keywords as missing even when canonical analyze had matched the requirement
through an alternative ("BigQuery, Snowflake or Redshift" met via Snowflake).

Stage 3.9B removed both fields from the parse prompts and `PARSED_CV_SCHEMA`.
The Parsed CV quick-scan blocks are derived by `deriveParsedCvInsights()`
(`src/services/ai/resultPayloadNormalize.ts`) from the canonical
`detailedComparison`:

- highlights: `status === "matched"`, required first, canonical order, max 3;
- missing requirements ("Yêu cầu còn thiếu" / "Missing requirements"):
  `status === "missing"` only (never `partial`), required first, canonical order.

Chips use the canonical `requirement` text as-is (JD language; not part of the
Stage 3.7 localization allowlist) — no extra Gemini call. When a result has no
usable `detailedComparison` (old history), the stored legacy
`key_match_highlights` / `missing_keywords` from `history.parsed_cv` are shown
under the old "Missing Keywords" label; canonical and legacy values are never
mixed. No migration.

## CV-only extraction (Stage 3.10B)

`/api/parse-cv` receives CV content/file references and language, without JD
in new application calls. The shared Vercel/Express handler ignores an extra
legacy `jd` property; it never reaches the Gemini extraction request. Parse
prompts have their own language-only parameters and no JD/cross-reference
instructions. Analyze remains the only CV↔JD semantic authority.

The response schema and legacy history readers are unchanged.
`ats_evaluation.years_of_experience` retains Gemini's fallback when no usable
work-date range exists; deterministic merged-range calculation overrides it
when ranges are available. ATS wrapper cleanup is deferred. No migration,
score-version change, or additional Gemini call.

## Experience authority (Stage 3.11B)

`ats_evaluation.years_of_experience` is total elapsed professional work
experience represented by the CV, not JD relevance, role-years or FTE-years.
It remains display/persistence data and never feeds canonical scores.

New parse normalization inspects raw entries before structural filtering.
Only a COMPLETE, source-backed timeline may override the valid model estimate.
Partial/unavailable evidence preserves the model value; invalid models use a
trusted subtotal or zero. A source-backed positive subtotal overrides a
conflicting model zero. Validation accepts finite nonnegative numbers and
strict decimal legacy strings, not numeric prefixes, negatives or nonfinite
values. Inclusive-month union still handles overlap, duplicates, adjacency and
gaps; future-only roles are excluded, future ends capped at ICT `asOf`, and
year-only precision cannot establish COMPLETE authority.

Source verification is intentionally narrow: a simple company/title header immediately followed by one matching
date pair on the same CV text line. Existing English month/numeric date
normalization is accepted; inferred calendar dates without source support are
not. Multiline layouts, absent text, scan/image input, ambiguous associations
and unsupported formats remain unknown. PDF text already available to the
parse service is reused; no OCR or AI call is added. This is literal evidence
support, not proof that every real job was extracted or that CV facts are true.

History uses explicit `mode: "history"` to preserve a valid saved selected
value, including zero. It never recomputes experience at today's date, rewrites
rows, or reconstructs discarded model estimates. Invalid saved values become
zero. New parses default `asOf` to current time in ICT; tests inject it.
No schema/migration/score-version change. ATS wrapper cleanup remains deferred.

## Requirement-status authority (Stage 3.12B)

`detailedComparison` is the single requirement-status authority for new
canonical results. The canonical prompt now treats alternatives joined by
"or"/"/" (e.g. "BigQuery or Snowflake", "AWS/Azure/GCP", "Vietnamese or
Bahasa") as ONE logical requirement: one row with the JD's wording, `matched`
when any alternative has CV evidence, `partial` when the evidence only partly
satisfies it, `missing` when none is supported. An unsatisfied alternative is
not emitted as a separate required row. Requirements joined by "and" stay
separate rows, and evidence for one must not satisfy the other. This is a
one-line instruction in step 9 of the EN analyze prompt; the scoring rubric,
schema and call count are unchanged.

All active matched/partial/missing surfaces use
`deriveRequirementInsights(detailedComparison, legacy?)`
(`src/services/ai/resultPayloadNormalize.ts`):

- Analysis tab accordions (matched, partial, missing);
- Parsed CV chips via `deriveParsedCvInsights()` (same derivation, max 3
  highlights);
- recruiter CandidatePanel matched/missing lists;
- recruiter Excel "Điểm mạnh"/"Điểm yếu" columns.

The helper only groups/filters/sorts: required → nice-to-have → unknown
priority, canonical bucket/order preserved inside each group; `partial` stays
separate and is never promoted to missing. It does not reinterpret requirement
meaning. `matchingPoints` / `missingGaps` remain in the schema, persistence,
localization allow-list and history readers for compatibility, but are no
longer an authority for canonical requirement lists; they are read only as the
legacy fallback when a stored result has no usable `detailedComparison`. A
`missingGaps` invention with no canonical row cannot appear as a missing
requirement. No schema change, migration, new AI call, score/rubric,
probability, category-score, rewrite or parse/experience change.

## Requirement verification + trust boundary (P0, 2026-11-01)

Each `detailedComparison` row may carry two optional fields, produced by the
same canonical analyze call (no extra Gemini round trip):

- `verification?: 'met' | 'unmet' | 'unknown'` — does the CV *prove* the
  requirement is satisfied? `met` = explicit proof; `unmet` = an explicit CV
  fact contradicts or falls short (JD "IELTS 6.5", CV "IELTS 6.0"; JD "10+
  years", CV 8 years); `unknown` = the CV lacks the information. A requirement
  the CV does not mention is `unknown`, never `unmet`.
- `jdEvidence?: string` — short verbatim JD excerpt (requested for `required`
  rows only).

```
match status (matched | partial | missing)  ≠  requirement verification
```

`status` stays the requirement-status authority (Stage 3.12B) and its union is
unchanged. **Verification does not independently modify canonical
`matchScore`**, category scores or `passProbability`; the scoring rubric is
untouched and `scoreVersion` stays `canonical-en-v1`. The prompt forbids
inferring degree, certification, language, years, work authorization,
location, availability, domain or management experience from name,
nationality, address, CV language, job location, company, title, age or
missing data.

Deterministic bounds (`normalizeComparisonItems`): code can only weaken a
model claim to `unknown`, never create `met`/`unmet` — `met` requires
`status: matched` + non-empty `cvEvidence`; `unmet` requires a non-matched
status + non-empty `cvEvidence` (the contradicting CV fact). Invalid values →
field absent. On new analyses `groundRequirementVerification()`
(`analysisService.ts`) also keeps `unmet` only when its `cvEvidence` is a
case/whitespace/quote-insensitive substring of the CV text the model saw —
placeholders like "Not mentioned in the CV" and image/scanned CVs become
`unknown` — and drops a `jdEvidence` that is not a substring of the JD.
`met` is not text-grounded (paraphrased matches would flip to unverified).
Missing/partial rows may now quote the shortfall fact in `cvEvidence`.
Absent fields stay absent: pre-P0 history/recruiter rows render exactly as
before (no "Chưa xác minh"). `deriveRequirementInsights` ignores both fields,
so Candidate accordions, Parsed CV chips, CandidatePanel and recruiter Excel
are unchanged. UI: `DetailedComparisonTab` shows "Xác minh: Đạt / Không đạt /
Chưa xác minh" and the JD excerpt when present. Persistence is JSONB
(`history.detailed_comparison`, `candidate_cvs.analysis_result`) — no
migration. Localization never sees or edits them.

Trust boundary: JD and CV text are fenced as `<job_description>` / `<cv>`
(markers inside the content are removed) and the analyze EN + rewrite VI/EN
prompts state that fenced content is untrusted data, never instructions.
`stripInvisibleControls()` (`_server-lib/untrustedText.ts`) removes
zero-width (U+200B–200D, 2060, FEFF), bidi controls (U+061C, 200E/200F,
202A–202E, 2066–2069) and Unicode tag characters (U+E0000–E007F) from the JD
at the analyze/rewrite handler entry (before the empty check, so guards,
`jdTitle` and logs share it) and from CV *text* before prompting and guards.
No NFC/NFKC or combining-mark changes — Vietnamese is byte-identical. This
reduces risk; it is not a sandbox. Inline PDF/image CVs and visible
instruction-like text rely on the prompt rule, schema and existing guards.

Telemetry: `analysis_log.guard_metrics.requirementVerification` (counts only,
see `docs/11_guard_metrics.md`).

## Known debt

- Recruiter campaigns can mix legacy and canonical `match_score` until
  candidates are re-analyzed; they are identifiable by `score_version` but the
  UI does not show or filter it yet.
- The parsed-CV ATS wrapper naming and model experience fallback remain; any
  cleanup must preserve undated-CV behavior and legacy history compatibility.
- Document language (VI vs EN CV/JD) still shifts calibration by ~3.5 points
  under the fixed judge, plus normal Gemini variance (sd 1–3).
- `rewriteSuggestions[].section` stays as the model wrote it (often English).
- `/api/rewrite-cv` (Full CV) is unchanged and keeps its own language-keyed prompts.
- `matchingPoints` / `missingGaps` are still generated, persisted and localized
  but are non-authoritative for canonical requirement lists; their prose can
  disagree with `detailedComparison` (and may invent gaps that are not in the
  JD). They remain for history compatibility and possible future "AI notes"
  use; removing them is a separate cleanup.
- P0: the instruction text is still a user-turn prompt (rules + fenced data),
  not `config.systemInstruction`. Moving it would change the scoring request
  and needs a pre/post benchmark (Stage 3.6: prompt moves shifted MatchScore
  4–10 points). The P0 additions themselves (verification rules + two schema
  fields + untrusted-input rule) also need `scripts/benchmark-gemini-analyze.ts`
  before deploy to confirm no score drift and model compliance.
- `matchScore` is not clamped to 0–100 server-side (probability derivation
  clamps); unchanged by P0.
