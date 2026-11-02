# Analyze score variance (P2A.2 diagnostic, 02/11/2026)

Diagnostic only. No scoring, prompt, model or config change. Script:
`scripts/diagnose-analyze-variance.ts` (production `analyzeCV`, fetch intercepted
in the script process only to hash requests and capture the raw response).

## Trigger

P2A production smoke: the same synthetic CV + JD scored **88** then **72**.

- JD: byte-identical (application snapshot SHA-256 of both saves is the same,
  and equals the fixture JD hash).
- CV: raw text is not persisted (pasted text), so historical byte identity
  **cannot be proven**. Strong indirect evidence: identical `parse_cv` input
  tokens (494 / 494) and identical parsedCV snapshot hash.
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
fallback inside analyze.

## Controlled runs

Fixture = the exact smoke CV/JD. Sequential, UI `vi`.

| | N | scores | range | median | mean | stdev | P25/P75 |
|---|---|---|---|---|---|---|---|
| Smoke fixture | 20 | 88×11, 85×2, 82×4, 76×1, 75×2 | 13 (75–88) | 88 | 84.6 | 4.66 | 82/88 |
| Control (`en-medium`) | 9* | 72×8, 76×1 | 4 | 72 | 72.4 | 1.33 | 72/72 |

\* 1 run excluded: transient provider 503.

- Request hash: **1 distinct** across all 20 smoke runs (identical effective
  input and generation config). One analyze call per run, no retry/fallback,
  raw model score = final score in 20/20.
- Probability band: High 17, Medium 3 (band flips in 15% of runs).
- Category driving the range: Tools 60–90 (range 30); every run ≤ 82 had
  Tools ≤ 70. Skills/Technical/Hard/Experience vary ±5–10.
- Requirement table: core requirements stable (React/TS, years, Figma, collaboration
  matched 20/20; Next.js missing 20/20). Unstable: "reusable UI component
  libraries" matched vs partial, and how the model splits rows across
  categories (8–10 rows per run).
- Post-model determinism: one captured raw response replayed 20× through the
  full pipeline → **1 distinct output**.
- No `Math.random` / unstable ordering in the scoring path.

## Classification

**MODEL_VARIANCE**: identical inputs and config, deterministic post-model
pipeline, materially different model responses. Fixture-sensitive: the
smoke fixture sits on a band boundary (nice-to-have tools Next.js/Jest); the
control fixture is much tighter. The historical 72 is below the controlled
minimum (75) but consistent with the same tail.

P0 "max Δ 3" is **not comparable**: it compared medians of 3 runs between two
code versions per fixture, not run-to-run spread.

## Not changed

Scoring, prompts, model, temperature, thinking budget, schema, requirement and
verification authority, guards, retries, production config.
