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

## Requirement verification (P0, 2026-11-01)

Each `detailedComparison` row of a new analysis carries
`verification?: 'met' | 'unmet' | 'unknown'`: does the CV *prove* the
requirement is satisfied?

```
match status (matched | partial | missing)  ≠  requirement verification
```

**Gemini never authors it.** It is derived after the canonical response by the
pure `deriveRequirementVerification()` (`src/services/ai/requirementVerification.ts`),
called in `analyzeCV` right after `normalizeDetailedComparison`:

- `met`: `status === "matched"` with usable `cvEvidence` (non-empty, not a
  placeholder such as "N/A" / "not mentioned" / "không đề cập", and not
  evidence that calls itself an inference — "implies", "suggests", "hàm ý").
  The canonical match is not re-judged.
- `unmet`: only a deterministic same-metric shortfall on a non-matched row —
  IELTS band bound to the word "IELTS", or years of experience whose domain
  words are identical on both sides (JD "10+ years of product design
  experience" vs CV "8 years of product design experience"; words that only
  say where the CV states it — "stated in Summary" — are ignored). One value per
  side; ranges, maxima, open-ended CV values ("8+", "over 8"), conflicting
  figures, or an IELTS requirement/evidence that also names another language
  test ("IELTS 6.5 or TOEFL 90", "TOEIC 850") are not compared.
- `unknown`: everything else. Absence of evidence is not failure: `partial` or
  `missing` alone never means `unmet`; a tool, degree, certification, language
  test or work authorization the CV does not mention stays `unknown`, even when
  the CV lists other ones. A `matched` row whose own evidence shows a shortfall
  becomes `unknown` (status untouched).

**Verification never modifies `status`, `matchScore`, category scores,
`passProbability` or `successProbability`** — the function only receives the
comparison table and returns a copy with one extra field. No `scoreVersion`
change. `jdEvidence` was prototyped and removed; the UI explains a row with
`requirement` + `cvEvidence` + `verification`.

Persistence is JSONB (`history.detailed_comparison`,
`candidate_cvs.analysis_result`) — no migration. Absent stays absent: rows saved
before P0 render without a verification line (never "Chưa xác minh");
`normalizeComparisonItems` reads a stored value back only when it is
consistent with `status`, otherwise it is weakened to `unknown`.
`deriveRequirementInsights` ignores the field, so Candidate accordions, Parsed
CV chips, recruiter CandidatePanel and Excel export are unchanged. UI:
`DetailedComparisonTab` shows "Xác minh: Đạt / Không đạt / Chưa xác minh".
Localization never sees or edits it. Telemetry:
`analysis_log.guard_metrics.requirementVerification` (counts only).

### Why not in the Gemini call (benchmark, 2026-11-01)

`scripts/benchmark-gemini-analyze.ts`, fixtures in
`scripts/benchmark-gemini-fixtures.ts` (incl. P0 cases), PRE = `8590a6f`:

- Model-authored `verification`/`jdEvidence` (P0, P0.1) moved `matchScore`
  even with identical status (IELTS 6.0 vs 6.5: +7), credited date-derived
  durations over the stated figure, dropped JD requirements and inferred
  `unmet` from absent tools.
- An `UNTRUSTED INPUT` prose rule alone shifted calibration (+3 to +7 on
  several samples).
- A `<job_description>`/`<cv>` fence alone kept pooled drift near noise but
  shifted one sample family systematically (en-jd-concept below PRE's 72 in
  10/20 fenced runs vs 1/30 PRE; back to 72 in 16/16 runs once removed). A
  coverage signal seen alongside it was within the noise of two identical
  requests.

Final request = PRE request byte-for-byte for clean input; only the
deterministic sanitizer below runs before it.

### Input sanitizer

`stripInvisibleControls()` (`_server-lib/untrustedText.ts`) removes zero-width
(U+200B–200D, 2060, FEFF), bidi controls (U+061C, 200E/200F, 202A–202E,
2066–2069) and Unicode tag characters (U+E0000–E007F) from the JD at the
analyze/rewrite handler entry (before the empty check, so guards, `jdTitle` and
logs share it) and from CV *text* before prompting and guards. No NFC/NFKC or
combining-mark changes — Vietnamese is byte-identical; a no-op on all
benchmark fixtures. Input hardening only, not a sandbox: inline PDF/image CVs
and visible instruction-like text are not filtered.

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
- P0 trust boundary: the canonical analyze (and rewrite) prompt has **no**
  prose "untrusted input" instruction and no JD/CV fence, because both shifted
  score calibration in benchmarks. JD/CV still sit in the user turn next to the
  rules. A `systemInstruction` variant is a separate experiment that needs its
  own PRE-vs-variant calibration benchmark. The injection fixture
  (`p0-injection`) stays as a regression check (PRE and final both resisted it).
- P0 `met` mirrors the canonical status. An audit of 889 final `met` rows found
  a few matches the model reached by inference (location from a university,
  a JD-only "automated reporting" from SQL reports) and requirement rows the
  model invented ("degree … implied by role"); these are pre-existing
  canonical-analysis behaviours that "Xác minh: Đạt" now repeats.
- In Vietnamese, "Đạt" is both the `matched` status label and the `met`
  verification label (shown after "Xác minh:").
- P0 verification covers only IELTS and same-domain years; TOEIC/TOEFL/GPA and
  other thresholds stay `unknown` until a same-metric parser is added. Some real
  shortfalls phrased loosely by the model ("CV states 8 years of experience"
  vs a domain-specific requirement) also stay `unknown` by design.
- `matchScore` is not clamped to 0–100 server-side (probability derivation
  clamps); unchanged by P0.
