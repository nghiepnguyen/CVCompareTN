# Analyze score variance (P2A.2 diagnostic, 02/11/2026)

Status: accepted. **MODEL_VARIANCE, severity MEDIUM, decision MONITOR, does not block P2B.**

Diagnostic only. No scoring, prompt, model or config change. Script:
`scripts/diagnose-analyze-variance.ts` (production `analyzeCV`, fetch intercepted
in the script process only to hash requests and capture the raw response).

## Historical observation (trigger, not proof)

P2A production smoke: the same synthetic CV + JD scored **88** then **72** (Δ16).
This pair alone is not definitive proof of anything: historical CV byte
identity cannot be proven.

- JD: byte-identical (application snapshot SHA-256 of both saves is the same,
  and equals the fixture JD hash).
- CV: raw text is not persisted (pasted text), so historical byte identity
  **cannot be proven**. Strong indirect evidence: identical `parse_cv` input
  tokens (494 / 494), identical parsedCV snapshot hash, and a local `parse_cv`
  of the fixture CV also reports 494 input tokens.
- `analysis_log`: exactly one successful `analyze` row per run, no error rows,
  so neither run was a retry. Its token totals (4665 / 4549) include the VI
  localization call, whose input depends on the model output, so they cannot
  prove prompt identity (the analyze prompt alone is 3829 tokens locally).
- Both runs: `gemini-3-flash-preview`, `canonical-en-v1`, `canonical-score-v1`,
  UI `vi`, one analyze call, no retry/fallback. The 72 run had Tools 60 vs 85
  and one requirement `partial` instead of `matched`.

## Authority (verified in code)

CV text + JD → `buildAnalyzePromptEn` (English for every UI language; only
`currentMonth` varies, monthly) → **one** Gemini call (`gemini-3-flash-preview`,
JSON schema, `thinkingBudget: 1024`, `maxOutputTokens: 16384`; temperature /
topP / topK / seed **not set** = provider defaults) → `matchScore` is the raw
model number (finite-number coercion only; no formula, weights, clamp or
recompute) → `passProbability = derivePassProbability(matchScore)` (≥80 High,
≥60 Medium). `categoryScores` are separate model numbers, not inputs to
`matchScore`. VI adds a second call (`localizeAnalysis`) that only rewrites
presentation strings. Analyze does **not** consume `parsedCV`. No retry or
fallback inside analyze. Client (`src/services/ai/analysisService.ts`) returns the
`/api/analyze` JSON as-is: no automatic retry, no score rewrite.

## Controlled reproduction (authority for the finding)

Fixture = the smoke JD (hash-proven) and the smoke CV as typed (equivalent
with high confidence, see above). Sequential, UI `vi`. All calls local with
the project key; production DB was read-only.

| | N | scores | range | median | mean | stdev | P25/P75 |
|---|---|---|---|---|---|---|---|
| Smoke fixture | 20 | 88×11, 85×2, 82×4, 76×1, 75×2 | 13 (75–88) | 88 | 84.6 | 4.66 | 82/88 |
| Control (`en-medium`) | 9* | 72×8, 76×1 | 4 | 72 | 72.4 | 1.33 | 72/72 |

\* 1 run excluded: transient provider 503.

- Request hash: **1 distinct** across all 20 smoke runs (identical effective
  input and generation config). One analyze call per run, no retry/fallback,
  raw model score = final score in 20/20.
- Probability band: High 17, Medium 3 (band flips in 15% of runs).
- Tools (60–90, range 30) co-varies with the score: every run ≤ 82 had
  Tools ≤ 70. Category scores are not inputs to `matchScore`, so this is
  correlation, not cause. Skills/Technical/Hard/Experience vary ±5–10.
- Requirement table: core requirements stable (React/TS, years, Figma, collaboration
  matched 20/20; Next.js missing 20/20). Unstable: "reusable UI component
  libraries" matched vs partial, and how the model splits rows across
  categories (8–10 rows per run).
- Post-model determinism: one captured raw response replayed 20× through the
  full pipeline → **1 distinct output**.
- No `Math.random` / unstable ordering in the scoring path.

## Classification

**MODEL_VARIANCE**, based on the controlled reproduction: the same effective
Analyze request ×20 (same prompt hash, same generation config, one model call,
no retry, no fallback) gave scores 75–88 (range 13) with High/Medium band
instability, while the post-model pipeline is deterministic. Fixture-sensitive: the
smoke fixture sits on a band boundary (nice-to-have tools Next.js/Jest); the
control fixture is much tighter. The historical 72 is below the controlled
minimum (75) but consistent with the same tail.

P0 comparison: P0 "max Δ≈3" compared medians between code versions. P0 did
not measure the run-to-run distribution of identical requests. Therefore this
result does not establish a regression from P0.

## Not changed

Scoring, prompts, model, temperature, thinking budget, schema, requirement and
verification authority, guards, retries, production config.

## P2B constraint

P2B may display the saved `matchScore` as historical context, labelled as the
**score at save time**. The frozen score stays: it is valid evidence of what
the user saw when saving.

P2B MUST NOT use `matchScore` / `passProbability` to:

- rank applications;
- recommend which application is better;
- sort by quality by default;
- calculate application success;
- aggregate candidate quality;
- present score changes between applications as meaningful improvement or regression.

Reason: identical Analyze requests currently show material model variance.

## Analyze stabilization gate

**ANALYZE STABILIZATION — required before P4A multi-JD ranking** (P4A ranks on
the canonical score). Investigation candidates only, none selected: explicit
temperature, seed, multi-run aggregation / median, deterministic score
derivation. Every proposal needs a calibration benchmark first, because
request/model changes may shift score distributions (P0 precedent).
