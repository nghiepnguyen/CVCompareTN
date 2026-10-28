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

Localization can replace **only**: `passExplanation`, `mainFactor`,
`matchingPoints[].content`, `missingGaps[].content`,
`detailedComparison.*[].improvement`, `rewriteSuggestions[].explanation`,
`formatAssessment.formatIssues[]`.

Everything else is never sent to or taken from the localization call: scores,
category scores, every enum, `jobTitle`, `atsKeywords`, `requirement`,
`cvEvidence`, `rewriteSuggestions[].section/original/optimized`, array order and
length. `machineProjection()` is the test helper for this boundary.

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

## Known debt

- Recruiter campaigns can mix legacy and canonical `match_score` until
  candidates are re-analyzed; they are identifiable by `score_version` but the
  UI does not show or filter it yet.
- `/api/parse-cv` still receives `jd` and its prompt still branches VI/EN,
  though it no longer generates any CV↔JD judgment; whether it needs the JD at
  all is a separate audit.
- Document language (VI vs EN CV/JD) still shifts calibration by ~3.5 points
  under the fixed judge, plus normal Gemini variance (sd 1–3).
- `rewriteSuggestions[].section` stays as the model wrote it (often English).
- `/api/rewrite-cv` (Full CV) is unchanged and keeps its own language-keyed prompts.
