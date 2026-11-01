# Factual guard telemetry (`analysis_log.guard_metrics`)

Stage 3.4 (2026-10-29). Aggregate production telemetry for the factual guards
added in PR #7–#9. Migration: `supabase/migrations/20261029000000_analysis_log_guard_metrics.sql`.

> **Deploy order — required.** Apply the migration and verify the column exists
> (`select column_name from information_schema.columns where table_name='analysis_log' and column_name='guard_metrics';`)
> **before** deploying the code that writes it. An insert naming an unknown
> column fails and `logAnalysisAttempt` swallows the error, so every successful
> analyze/rewrite row — tokens and cost included — would be silently lost.

## What it measures — and what it does not

It measures **guard interventions**: suggestions dropped by the guard, Full CV
validation failures, retries, fallbacks and skipped validation.

It does **not** measure unsafe output or leakage. The deterministic guard
only sees numbers and narrow raw-JD markers (hyphenated compounds,
acronyms, mixed-case identifiers). Lowercase JD-only phrases ("data
modeling", "automated reporting") are invisible to it, so:

**low rawJd guard activity ≠ low lowercase JD leakage.**

Measuring leakage directly would need a separate, privacy-safe output
sampling/audit.

## Shape (v1)

One nullable `jsonb` column, written in the same single insert as the rest of
the row (no extra DB write). Values are counts, booleans and one enum only.

`kind='analyze'`, `status='success'`:

```json
{ "v": 1, "suggestionGuard": {
    "suggestionsIn": 6,      // rewriteSuggestions from Gemini, before the guard
    "droppedTotal": 2,
    "skills": 1, "numeric": 1, "rawJd": 0,
    "factualChecks": true } }
```

P0 (2026-11-01) adds, on the same analyze row, `requirementVerification`
(absent on older rows):

```json
"requirementVerification": { "rows": 14, "met": 6, "unmet": 1, "unknown": 7 }
```

Counts of the deterministic verification derived after the canonical response
(`deriveRequirementVerification`, see `docs/12_canonical_scoring.md`). Counts
only — never requirement, JD or CV text.

- Each dropped suggestion counts once, under the first rule that hit it
  (order: Skills → number → raw-JD). The split is "first reason", not every
  reason that applied.
- `factualChecks: true` = trustworthy CV text was available, so the numeric
  and raw-JD checks ran. `false` = inline image / scanned PDF: those checks
  could not run, but the Skills rule still did — `numeric: 0, rawJd: 0` there
  does **not** mean "clean".

`kind='rewrite'`, `status='success'`:

```json
{ "v": 1, "fullCv": {
    "validationAttempted": true, "validationSkipped": false,
    "firstPassValid": false,
    "firstPassViolations": { "unsupportedNumber": 1, "rawJd": 0 },
    "retryOutcome": "recovered",
    "retryViolations": { "unsupportedNumber": 0, "rawJd": 1 },
    "fidelityFallback": false,
    "geminiCalls": 2 } }
```

- `validationSkipped: true` (no trustworthy CV text) → `firstPassValid: null`,
  never `true`.
- Violation counts are **distinct** unsupported numbers / raw-JD concepts
  (the validator dedupes them), not occurrences.
- `firstPassViolations` only when the first pass failed; `retryViolations`
  only when the retry produced output that failed (`invalid`).
- `retryOutcome`: `not_needed` (first pass valid or validation skipped),
  `skipped_budget` (less than `REWRITE_RETRY_MIN_BUDGET_MS` left → fallback),
  `error` (retry call threw / timed out → fallback), `invalid` (retry output
  failed → fallback), `recovered` (retry output valid, returned).
- `geminiCalls: 2` once the retry call was started, even if it errored. Token
  totals (`input_tokens`/`output_tokens`) only contain usage Gemini returned, so
  `geminiCalls` may be 2 while tokens cover one call.
- `latency_ms` on rewrite rows is the summed Gemini time of both calls.

`kind='rewrite'`, P1A cover letter (`action: 'cover_letter'`, 2026-11-01) —
**every** row, success or error, carries the `coverLetter` key (the `kind`
CHECK has no `cover_letter`, so this key is what tells the rows apart and what
the cover-letter hourly cap counts):

```json
{ "v": 1, "coverLetter": {
    "language": "en",
    "outcome": "recovered",
    "firstPassViolations": { "unsupportedNumber": 0, "spelledNumber": 0, "rawJd": 0,
                             "unsupportedTerm": 1, "jdCopy": 0, "strengthClaim": 1 },
    "retryOutcome": "recovered",
    "geminiCalls": 2 } }
```

- `outcome`: `valid` (first draft passed), `recovered` (retry passed),
  `fallback` (no draft passed → empty letter + `fidelityFallback`), `error`
  (Gemini/timeout/budget; also `category`, and `error_message` is
  `[cover_letter:<category>]`).
- Counts are distinct violations per reason, never the terms/numbers.
- Full CV queries must filter `guard_metrics ? 'fullCv'` (or `f IS NOT NULL`
  as below); a bare `guard_metrics IS NOT NULL` on `kind='rewrite'` now also
  matches cover-letter rows.

## NULL vs 0 / false

- `guard_metrics IS NULL`: telemetry unavailable or not applicable — rows
  before 2026-10-29, `parse_cv` rows, error rows (including the categorical
  rewrite/parse failure rows added in Stage 3.5). Never read as zero.
- Zero counters / `false`: the request was measured and nothing happened.

## Denominator limits

- Full CV rates are computed over **successful** `/api/rewrite-cv` executions
  (`status='success'`). Since Stage 3.5 (2026-10-29) a rewrite or parse that
  fails through a controlled path also writes a `status='error'` row whose
  `error_message` is only a category (`[storage_timeout]`, `[storage_error]`,
  `[gemini_timeout]`, `[gemini_error]`, `[request_budget_exhausted]`); before
  that, failed rewrites/parses had no row at all. A request killed by the
  platform or with an unreachable log insert still leaves no row.
- A fidelity fallback is a successful execution (`status='success'`) with
  `fidelityFallback: true`.

## Privacy

Never stored: CV/JD/suggestion/rewrite text, guard concepts, unsupported
number values, candidate name/email/phone/address/companies, prompts, Gemini
responses. Read access follows the table's admin-only RLS.

Production console logs carry the drop reason and violation counts only.
Suggestion `section` (model free text that may name an employer), concepts,
`matchedForm`, numbers and suggestion bodies are printed only with
`NODE_ENV=development` and `SUGGESTION_GUARD_DEBUG=1` (local benchmark/debug).
Production ignores the debug flag. Sentry event and structured log payloads
redact sensitive keys recursively, including arrays and serialized JSON.
Free-form text without a sensitive key is not a general-purpose PII filter.

## Example queries

Add a `created_at` range as needed.

```sql
-- 1. Suggestion guard rate: analyses with >=1 drop / analyses measured
--    (factual checks ran; drop factualChecks filter to include Skills-only rows)
SELECT count(*) FILTER (WHERE (g->>'droppedTotal')::int > 0)::float / nullif(count(*), 0) AS guard_rate,
       sum((g->>'droppedTotal')::int)::float / nullif(sum((g->>'suggestionsIn')::int), 0) AS per_suggestion_drop_rate
FROM analysis_log, LATERAL (SELECT guard_metrics->'suggestionGuard' AS g) x
WHERE kind = 'analyze' AND status = 'success' AND g IS NOT NULL
  AND (g->>'factualChecks')::boolean;

-- 2. Drop reason distribution (first reason per dropped suggestion)
SELECT sum((g->>'skills')::int) AS skills,
       sum((g->>'numeric')::int) AS numeric,
       sum((g->>'rawJd')::int) AS raw_jd,
       count(*) FILTER (WHERE NOT (g->>'factualChecks')::boolean) AS analyses_without_factual_checks
FROM analysis_log, LATERAL (SELECT guard_metrics->'suggestionGuard' AS g) x
WHERE kind = 'analyze' AND status = 'success' AND g IS NOT NULL;

-- 3–6 and 10. Full CV: first-pass failure, retry recovery, fallback, skip, calls/latency
SELECT count(*) AS rewrites,
       count(*) FILTER (WHERE f->>'firstPassValid' = 'false')::float
         / nullif(count(*) FILTER (WHERE (f->>'validationAttempted')::boolean), 0) AS first_pass_failure_rate,
       sum((f->'firstPassViolations'->>'unsupportedNumber')::int) AS first_pass_number_violations,
       sum((f->'firstPassViolations'->>'rawJd')::int) AS first_pass_rawjd_violations,
       count(*) FILTER (WHERE f->>'retryOutcome' = 'recovered')::float
         / nullif(count(*) FILTER (WHERE f->>'retryOutcome' IN ('recovered', 'invalid', 'error')), 0) AS retry_recovery_rate,
       count(*) FILTER (WHERE f->>'retryOutcome' = 'skipped_budget') AS retry_skipped_budget,
       avg((f->>'fidelityFallback')::boolean::int) AS fallback_rate,
       avg((f->>'validationSkipped')::boolean::int) AS validation_skip_rate,
       avg((f->>'geminiCalls')::int) AS avg_gemini_calls,
       avg(latency_ms) FILTER (WHERE (f->>'geminiCalls')::int = 1) AS avg_latency_1_call,
       avg(latency_ms) FILTER (WHERE (f->>'geminiCalls')::int = 2) AS avg_latency_2_calls
FROM analysis_log, LATERAL (SELECT guard_metrics->'fullCv' AS f) x
WHERE kind = 'rewrite' AND status = 'success' AND f IS NOT NULL;

-- Retry outcome breakdown
SELECT guard_metrics->'fullCv'->>'retryOutcome' AS outcome, count(*)
FROM analysis_log
WHERE kind = 'rewrite' AND status = 'success' AND guard_metrics ? 'fullCv'
GROUP BY 1 ORDER BY 2 DESC;

-- Cover letter (P1A) outcomes
SELECT guard_metrics->'coverLetter'->>'outcome' AS outcome, status, count(*)
FROM analysis_log
WHERE kind = 'rewrite' AND guard_metrics ? 'coverLetter'
GROUP BY 1, 2 ORDER BY 3 DESC;
```
