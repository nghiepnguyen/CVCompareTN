# M3-B A3.2 — Deterministic scoring contract (design, offline)

- **Date:** 2026-11-23
- **Branch:** `audit/m3b-a32-scoring-contract` (worktree `../cv-compare-tn-m3b-a32`), cut from `2b51522` (A3.1). The chain is `5776735` → A2.2 `3b47f37`, `f6450df` → A3.1 `2b51522` → this. Production code is byte-identical to `5776735`. Local commit only.
- **Mode:** documentation and offline analysis. **0 Gemini calls**, no production code, prompt, schema, migration, deployment or infrastructure change, no PR. A2.0 not resumed.
- **Status of every policy below:** **recommended, not approved.** Only OD-7 and OD-10 were accepted earlier.
- **Citations:** plain `path:line` = current code (= `5776735`). `scripts/m3b-a1/…` = the prototype harness on this branch chain, **not on main**.
- **Verdict: READY WITH CONDITIONS** (§10).

---

## 1. Executive summary

- **Contract `fit-score-v1`** turns the requirement rows Gemini already returns (`detailedComparison`) into an integer 0–100 score:
  - weights: required ×3, preferred ×1;
  - credit: matched 1, partial ½, missing 0, unknown 0;
  - exact integer arithmetic, one half-up rounding;
  - no score (`null` + reason) when nothing valid can be scored.
  - The score is computed per normalized requirement, after merging duplicates, alias merging and excluding literal-ATS `keywords` rows.
- **It runs first as a shadow:**
  - It is computed in the existing analyze request from the existing response.
  - It writes numbers only to the existing `analysis_log.guard_metrics` JSONB.
  - It never changes the response, the stored result, quota or billing.
  - No migration and no extra Gemini call.
- **It becomes the visible score only after a separate approval** (A3.4), under a new `scoreVersion`, and historical rows are never rescored.
- **Synthetic simulation (§6) shows the rule is exact and explainable.** It also shows the expected shifts vs today's model behaviour: all-partial CVs score 50 (Low), and a partial experience row costs less than the prompt's experience penalty. Real impact on users is **unknown** until shadow data exists.
- **Branch/CI:** move the benchmark harness to main in a test-only PR whose freeze tests run in a separate, non-required, path-filtered job (§8). Then cut A3.3 from that main.

## 2. Proposed scoring formula (`fit-score-v1`)

### 2.1 Definition

For the set *R* of normalized, de-duplicated, scorable requirements:

```
w(r)      = 3 if priority(r) = required, 1 if preferred
c2(r)     = 2 matched | 1 partial | 0 missing | 0 unknown      (credit in halves → integer math)
num       = Σ w(r)·c2(r)        den = Σ w(r)·2
score     = floor((200·num + den) / (2·den))   if den > 0     (= round-half-up(100·num/den), exact)
          = null                                if den = 0     (never a fallback number)
band      = High ≥ 80 · Medium ≥ 60 · Low otherwise · null when score is null
```

This is the prototype `scoringRubric.ts:50-55, 234-273`, exercised by 58 tests (harness).

### 2.2 Rules

| Topic | Rule |
|---|---|
| **Rounding** | Exactly once, half-up, in integers (`pct`, `scoringRubric.ts:270-273`). Examples: 59.5→60, 79.5→80, ⅓→33, ⅔→67. No floating-point accumulation |
| **Score boundaries** | Always an integer in [0,100] by construction. Bands reuse the production thresholds `SCORE_HIGH_MIN`=80 and `SCORE_MEDIUM_MIN`=60 (`canonicalProbability.ts:8-9`) |
| **Empty requirement list** | `score = null`, `reason = "no_scorable_rows"`. Never 0 and never the Gemini score |
| **Non-array / malformed table** | `null`, `reason = "malformed_rows"` |
| **Row validation** | A row is rejected (counted `rowsRejected`) if it is not an object, if `requirement` is not a non-empty string, or if the normalized key is empty |
| **Category** | One of skills / experience / tools / education / keywords. Unknown category → `keywords` (counted `categoryDefaulted`), which is therefore not scored |
| **Keywords** | Rows in `keywords` are excluded from the score (counted `keywordsExcluded`; OD-10 accepted) |
| **Status** | matched / partial / missing / unknown. Anything else → `unknown` (counted `statusDefaulted`) |
| **Required vs preferred** | `required` → required; `preferred` or `nice-to-have` (the production enum) → preferred; missing or invalid → **required** (counted `priorityDefaulted`). This is conservative: an unlabelled gap is not discounted |
| **Evidence for matched** | `matched` gets full credit only if the existing P0 rule `deriveItemVerification` says `met`: usable, non-inferred evidence and no same-metric shortfall (`requirementVerification.ts:86-90`). Otherwise it becomes partial (counted `unverifiedMatchDowngraded`) |
| **Identity / duplicates** | Key = NFC, lower-case, collapsed whitespace, punctuation stripped, ≤300 chars, then a versioned alias table (`scoringRubric.ts:62-76`). OR groups: `or:` + sorted members. The same key in any bucket merges into **one** requirement: the lower status wins, `required` wins, the commutative merge is counted (`duplicatesMerged`, `conflictingDuplicates`) |
| **Conflicting statuses** | Lower credit wins (matched > partial > missing = unknown, and `unknown` is kept visible over `missing`). Deterministic, order-independent |
| **Maximum counts** | A table with **> 100 input rows** is ineligible (`reason = "too_many_rows"`), never truncated. That is ~10× the observed 8–10 rows (doc 16). Key length is capped at 300 chars |
| **Normalization / validation order** | (1) shape → (2) row validation → (3) category / keywords → (4) status → (5) evidence downgrade → (6) priority → (7) key + alias → (8) merge → (9) arithmetic. Each step is pure, and each counter is reported |
| **Model numbers** | `matchScore`, `categoryScores` and any extra numbers in rows are ignored as inputs |

## 3. Decision matrix (recommendations, not approved)

| # | Question | Recommended policy | Alternative | Example (synthetic, §6) | Accuracy risk | Stability impact | Owner approval |
|---|---|---|---|---|---|---|---|
| 1 | Required/preferred weights | **3:1** | 2:1 (or 1:1) | 3 req matched + 1 req missing + 2 pref matched + 1 req unknown: 3:1 → 65; 2:1 → 67; 1:1 → 71 | Uncalibrated; under 3:1 one missing required row dominates small JDs (1 of 4 missing → 75) | Neutral: any fixed weight is stable | **Required** before shadow v1 is frozen; re-tune only via a new version |
| 2 | Unknown rows | **0 credit, kept in the denominator**, counted separately | Exclude from the denominator | 2 matched + 2 unknown (all required): **50** vs 100 if excluded; mix in #1: 65 vs 79 | Conservative. **Close to a no-op in v1:** the response schema constrains `status` to `matched`/`partial`/`missing` and makes it required (`responseSchema.ts:10,15`), so `unknown` arises only from a schema violation | Stable; the model cannot raise a score by declaring rows unknown | Required (low stakes in v1; matters if a later schema adds `unknown`) |
| 3 | Keywords in the overall score | **Excluded** (ATS-literal advisory signal only) | Include with lower-credit-wins | Figma matched in tools + "Figma" missing as an ATS literal → **100** excluded (would drop under inclusion) | A JD whose only requirements are literal keywords scores `null` | Removes the largest conflict channel | Already accepted (OD-10); takes effect only at the A3.4 flip |
| 4 | Experience / seniority | **No numeric penalty formula.** A years requirement is a normal row; its status comes from the model, and the P0 same-metric shortfall downgrades a "matched" to partial | Port the prompt's −10–15 / −25–35 / cap-40 rule as a row multiplier or cap | 5+ years required, CV 3 years, model "partial" → **88 High**; model "matched" but evidence says 3 years → downgraded → **83 High**. The prompt rule would push the Experience category to ≤ 40–60 | **May over-score under-experienced candidates** vs today's model behaviour. The biggest known accuracy risk; measure in shadow on experience rows | Stable (no extra judgement) | **Required** (alters scores at the flip) |
| 5 | Evidence required for matched | **Yes**: full credit only when P0 verification is `met`; otherwise partial | Trust the model's `matched` | Kubernetes "matched" with empty evidence → partial → 75 instead of 100 | May under-score genuine matches the model described loosely. **VI/EN parity checked (synthetic):** years shortfall ("3 năm" vs "5+ years" / "Tối thiểu 5 năm"), IELTS shortfall and the "ngụ ý" inference marker are caught identically in VI and EN. Hedges such as "có thể" / "may have" are caught in **neither** language, so the gap is language-neutral | Small improvement (resists unsupported matches) | Required |
| 6 | Category scores | **Shadow: AI category scores stay as they are** (untouched, still shown). At the flip: derive the 4 scored buckets from rows with the same formula; retire the 4 keys that have no source rows (`softSkills`, `hardSkills`, `technicalSkills`, `languageSkills`) | Keep AI category scores after the flip | — | Derived buckets lose model nuance; keeping AI numbers next to a rubric total gives a contradictory chart (`categoryChartData.ts:21-36`) | Derived = stable | Required before the flip, not before shadow |
| 7 | List-only / incomplete data | **v1: list-only evidence gets full credit**, counted (`listOnlyDowngraded` measured as a zero-cost ablation in shadow). Incomplete rows follow §2.2 (reject / default + count). Never a fallback score | List-only = partial | "Skills: Python, SQL" as the only evidence for two required rows → 100 (full) vs 50 (partial) | Full credit is open to keyword stuffing; partial penalizes concise CVs | Neutral | Required (OD-12) |
| 8 | Duplicate inflation | **Merge by normalized key + alias table; lower status wins; required wins** | Keep duplicates (count twice) | React ×3 (+ "react.") + SQL missing → **50**, not 75; React.js + React → merged | Near-synonyms outside the alias table still count twice (e.g. "React framework") | Strongly positive (row splitting across buckets no longer moves the score) | Required (the alias table is versioned; each addition = new version) |

Additional contract decisions:

| # | Question | Recommendation | Owner approval |
|---|---|---|---|
| 9 | Shadow input: raw model rows or normalized rows? | **Normalized rows**: the same `detailedComparison` users see (`analysisService.ts:232-234`), so the shadow scores exactly the displayed table. Plus one counter `schemaViolations`: raw rows whose `status` is outside the schema enum. Production maps those to `missing` (`resultPayloadNormalize.ts:82-88`), and the schema constrains the enum (`responseSchema.ts:10,13,15`), so they occur only on a schema violation. `priority` is optional in the schema, so `priorityDefaulted` is reachable normally. The shadow never writes back | Required |
| 10 | Row cap | 100 rows → ineligible | Required |
| 11 | Hard / eligibility requirements | Not in v1 (the schema has no `hard` field); report-only later | Informational |

## 4. Input / output contract (shadow)

### 4.1 Input

| Field | Source (existing, no schema change) | Notes |
|---|---|---|
| `rows` | the normalized `detailedComparison` (`analysisService.ts:232-234`), flattened with the bucket as `category` | read-only; buckets skills / experience / tools / education / keywords; the same rows the user sees |
| `schemaViolations` | count of raw `parsedResult.detailedComparison` rows whose `status` is outside the enum | integer only |
| `canonicalScore` | the validated integer from `normalizeMatchScore` (`analysisService.ts:225-227`) | for comparison only |
| `inputMode` | `text` / `pdf_text` / `inline_pdf` / `image`, derived from the existing branch in `analysisService.ts:130-177` | enum only |

### 4.2 Output (`FitShadow`, versioned)

```ts
type FitShadow = {
  v: 'fit-score-v1';
  eligible: boolean;
  reason?: 'no_scorable_rows' | 'malformed_rows' | 'too_many_rows' | 'error';
  canonical: number;            // existing Gemini score (integer, R0)
  shadow: number | null;        // fit-score-v1, null when ineligible
  absDiff: number | null;       // |canonical − shadow|
  bandCanonical: 'High' | 'Medium' | 'Low';
  bandShadow: 'High' | 'Medium' | 'Low' | null;
  counts: { matched: number; partial: number; missing: number; unknown: number };
  required: number; preferred: number;
  diag: { rowsIn: number; rowsRejected: number; keywordsExcluded: number; duplicatesMerged: number;
          conflictingDuplicates: number; aliasMerged: number; unverifiedMatchDowngraded: number;
          listOnlyEvidence: number; statusDefaulted: number; priorityDefaulted: number; categoryDefaulted: number; schemaViolations: number };
  inputMode: 'text' | 'pdf_text' | 'inline_pdf' | 'image';
};
```

### 4.3 Eligibility, failure and missing data

- **Computed only on** a successful canonical analyze, i.e. after the finishReason gate and `normalizeMatchScore` succeeded. Invalid outputs (502) have no shadow, and their rows are not trusted. Both personal and recruiter paths are covered (same `analyzeCV`).
- **Pure and synchronous:** no I/O, no network, no awaits. Wrapped in `try/catch`. On any exception: `{ v, eligible: false, reason: 'error' }` with no message text.
- **Never affects:**
  - the API response body;
  - `history` / `candidate_cvs` rows;
  - quota reserve/commit/release;
  - `analysis_log` status or tokens;
  - localization (the shadow uses the canonical English rows before localization).
- **Missing data:** handled by §2.2. `null` + reason, never a fallback number.
- **Comparison:** `absDiff` and both bands. The signed difference is derivable offline (`shadow − canonical`) and is not stored separately.
- **Score version:** the shadow contract version is `fit-score-v1`. The production `scoreVersion` stays `canonical-en-v2` throughout the shadow phase.

## 5. Shadow metrics contract (privacy-safe)

### 5.1 Placement

- The new key **`fitShadow`** goes inside the existing `guard_metrics` v1 object of the `kind='analyze'`, `status='success'` row: `{ v: 1, suggestionGuard, requirementVerification, fitShadow }` (`suggestionGuard.ts:593-598`).
- It is written in the same single insert (`handler.ts:289`): no extra DB write and **no migration** (the column is `jsonb`, `20261029000000_analysis_log_guard_metrics.sql:19`).
- No SQL function reads `guard_metrics` today (grep). Admin reports use ad-hoc SQL from `docs/11_guard_metrics.md`, so the addition is backward-compatible.

### 5.2 What is logged and what never is

| Logged | Never logged |
|---|---|
| contract version, eligibility, reason enum | CV text, JD text |
| canonical score, shadow score, absDiff, two bands | requirement descriptions, evidence snippets, improvement text |
| counts by status, required/preferred counts | raw Gemini response |
| diagnostic counters (integers) | names, emails, file names, job titles |
| input-mode enum | any hash of requirement keys (`findingsHash` stays offline-only: low-entropy keys such as "react" could be recovered by dictionary) |

### 5.3 Storage, access and retention

| Property | Current state | Assessment |
|---|---|---|
| Write | service role only, server-side (`20260703030000_admin_analysis_log.sql:1-4`) | adequate |
| Read | RLS policy `is_admin()` for SELECT (`:20-23`) | adequate; admin-only |
| User linkage | `user_id` FK with `ON DELETE SET NULL` (`:8`) | rows become pseudonymous on account deletion; **deleting a history row does not delete the log row** |
| Retention | **No retention job found** for `analysis_log` (no cron / delete in migrations) | **Gap.** The new data is a user-linked evaluation number, a new kind of data in this table (today it holds tokens, latency and guard counts, not a CV fit score). Recommendation: an owner decision on a retention window for `fitShadow` (e.g. drop the key or the rows older than 90 days after the observation window), and check the privacy policy text covers this telemetry. Neither is implemented here |
| Volume | ~1 small JSON object per successful analyze | negligible |

Conclusion: existing storage can support the metrics safely **if** the owner accepts the retention/privacy point (OD-M2).

## 6. Synthetic impact analysis

**All rows below are synthetic.** They were computed offline with the prototype `scripts/m3b-a1/scoringRubric.ts` (`rubric-proto-v1-candidate`, = §2) through a scratch script. **No saved production or Gemini responses exist** (A1 search: none), so **no row shows an observed production outcome.** The "today" column describes the prompt's rules, not measured model output.

| Case | fit-score | Band | m/p/x/u | Diagnostics | Prompt guidance (per-category band; **not** the overall score, which has no formula; not measured) |
|---|---|---|---|---|---|
| All matched (4 req + 2 pref) | 100 | High | 6/0/0/0 | — | band 90–100 |
| All missing | 0 | Low | 0/0/5/0 | — | 0–19 |
| All partial | **50** | **Low** | 0/5/0/0 | — | likely 40–74 per category bands → possible band shift |
| Required missing (2), preferred matched (2) | 25 | Low | 2/0/2/0 | — | 40–59 ("missing critical required") |
| 1 of 4 required missing, rest matched | 75 | Medium | 3/0/1/0 | — | 60–74 |
| 2 of 4 required unknown *(reachable only on schema violation)* | 50 | Low | 2/0/0/2 | — | no rule (unknown is not a model state) |
| Invalid status "unsure" *(schema violation only; with normalized input it arrives as `missing` → 50)* | 75 | Medium | 3/0/0/1 | statusDefaulted 1 | production maps it to `missing` |
| Duplicate ×3 ("React", tools "React", "react.") + SQL missing | **50** | Low | 1/0/1/0 | duplicatesMerged 2 | duplicates could count 3× in a naive sum (75) |
| Conflicting duplicate (React matched + missing) | 50 | Low | 1/0/1/0 | conflicting 1 | undefined |
| Alias "React.js" + "React" | 50 | Low | 1/0/1/0 | aliasMerged 1 | — |
| Keyword-only conflict (Figma tools matched + keywords missing) | 100 | High | 2/0/0/0 | keywordsExcluded 1 | the prompt also lists a missing ATS literal in `missingGaps` |
| Experience 5+ required, CV 3 years, status partial | **88** | **High** | 3/1/0/0 | — | the prompt penalizes the Experience category by 25–35 points (60%) → **possible over-score vs today** |
| Experience "matched" but evidence states 3 years | 83 | High | 2/1/0/0 | unverifiedMatchDowngraded 1 | the model may score high |
| Mixed VI/EN rows (Thành thạo SQL, Kinh nghiệm Power BI partial, Tiếng Anh pref, Python missing) | 55 | Low | 2/1/1/0 | — | — (diacritics preserved; no VI aliases yet) |
| Near-empty CV (all missing) | 0 | Low | 0/0/4/0 | — | 0–19 |
| Empty table | **null** | null | — | reason no_scorable_rows | the model still writes a number |
| Malformed table | **null** | null | — | reason malformed_rows | — |
| Matched with empty evidence | 75 | Medium | 1/1/0/0 | unverifiedMatchDowngraded 1 | the model may count it as matched |
| Missing priority *(reachable: `priority` is optional in the schema)* | 25 | Low | 1/0/1/0 | priorityDefaulted 1 | — |

**Semantic sensitivity (synthetic reconstruction of the P2A.2 pattern):** base rows → 90; one required row flipped matched→partial → 83; merged "React and TypeScript" row → 89. The observed model scores for that real fixture were 75–88 (doc 16, N=20, **observed**), but the rows here are a reconstruction, not captured output. So this is not evidence of a live stability gain.

**VI/EN evidence-downgrade parity (synthetic, P0 functions on this branch):**

| Case | `compareMetric` | Verification | fit-score (this row + 1 other matched) |
|---|---|---|---|
| EN req "5+ years …" / EN evidence "3 years …" | shortfall | unknown → partial | 75 |
| EN req / VI evidence "3 năm kinh nghiệm backend" | shortfall | unknown → partial | 75 |
| VI req "Tối thiểu 5 năm …" / VI evidence | shortfall | unknown → partial | 75 |
| VI req / EN evidence | shortfall | unknown → partial | 75 |
| IELTS 6.5 vs 6.0 (EN and VI wording) | shortfall | unknown → partial | 75 |
| Inference "implies" (EN) / "ngụ ý" (VI) | — | unknown → partial | 75 |
| Hedge "Có thể đã dùng …" (VI; EN "may have" is equally uncaught) | — | met | 100 |

No language asymmetry was found in the tested shortfall and inference rules. Hedged evidence is a language-neutral gap (known debt; candidate for a later `fit-score-v2` marker list).

**Expected direction of change at a flip (hypotheses for shadow to test):**
- Partial-heavy CVs drop (½ credit is stricter than the 60–74 band).
- Under-experienced candidates may rise (policy #4).
- Inference-based matches drop (#5).
- Keyword-heavy JDs rise (#3).

## 7. Score versioning and rollout

| Item | Specification |
|---|---|
| Contract version | `fit-score-v1` (shadow). Any change to weights, credits, alias table, status rules or eligibility → `fit-score-v2`. Never edit v1 in place |
| `scoreVersion` while in shadow | unchanged: `canonical-en-v2` |
| `scoreVersion` after the flip | `fit-v1` (new value; text column, no migration). The probability band keeps the same thresholds; if the label changes (OD-6), a new `probabilityVersion` value |
| Shadow flag | server env `FIT_SCORE_SHADOW` = `off` (default) / `on`. Off = code path not executed |
| Authority flag | server env `FIT_SCORE_AUTHORITY` = `off` (default) / `on`; requires shadow `on`. Both are server-only (never `VITE_*`). A Vercel env change takes effect on redeploy |
| Historical results | **Never rescored, never backfilled.** Rows keep their stored score and `scoreVersion`; display reads the stored value |
| Recruiter sorting across versions | Before the flip, `ORDER BY match_score` (`recruiterService.ts:168`) and the client sorts (`ComparisonOverview.tsx:22`, `ResultSwitcherStrip.tsx:13`) must become version-aware: sort within one `scoreVersion`, show a version marker on mixed sets, fall back to time order across versions |
| Rollback | Authority `off` → new analyses return to the Gemini score. Rows written as `fit-v1` keep their version and score (no rewrite). Shadow `off` → telemetry stops. No data migration either way |
| Minimum evidence before switching (proposal) | (a) ≥ 200 eligible shadow rows over ≥ 14 days, with ≥ 30 from each UI language and from each input mode that occurs; (b) eligibility ≥ 95% of successful analyses; (c) a band-agreement table, the absDiff distribution and the experience-row subset reviewed by the owner; (d) the OD-17 labelled fixtures scored offline within their intervals; (e) no contradictory explanation copy (§9). Production volume is **unknown** (low traffic noted in R11); the OD-C SQL gives the real rate, and the window may need to be longer |

Shadow data measures **model-vs-rubric agreement and distribution only, not run-to-run stability** (one run per analysis). There is also no link from an `analysis_log` row to its result, so disagreement cases can be inspected only on the owner's own test analyses.

## 8. CI and branch strategy

**Current branches (all local, none pushed):**

- `audit/m3b-a21-benchmark-readiness` (`faaed46`, `7bbb2db`): docs, from `5776735`.
- `audit/m3b-a22-runner-alignment` (`3b47f37`, `f6450df`): `scripts/m3b-a1/**`, protocol v3, A2.2 report, from `5776735`.
- `audit/m3b-a31-deterministic-scoring` (`2b51522`): doc, on top of A2.2.
- this branch (A3.2): doc, on top of A3.1.

None touches production files, so merge conflicts with main are limited to future edits of the same docs.

**Recommended integration (each step is an owner-approved PR; none opened here):**

1. **PR-1, docs only.** The A2.1, A3.1 and A3.2 reports cherry-picked onto a fresh branch from main. Zero CI risk.
2. **PR-2, benchmark harness, test-only.** `scripts/m3b-a1/**`, protocol v3 and the A2.2 report, plus CI decoupling:
   - `vitest.config.ts`: exclude **only the two freeze tests** (`scripts/m3b-a1/__tests__/a2Manifest.test.ts`, `scripts/m3b-a1/__tests__/rubricFreeze.test.ts`) from normal `npm test`. Keep `isolation.test.ts`, the request/response parity tests and the characterization tests in the required "Lint, Test & Build" job: they are production safety checks, and they *should* run on every `analysisService.ts` edit;
   - `package.json`: `test:benchmark` = `vitest run --config scripts/m3b-a1/vitest.offline.config.ts scripts/m3b-a1` (a separate config that includes the freeze tests);
   - a new workflow `benchmark-freeze.yml`: runs `npm run test:benchmark`, **path-filtered** to the frozen scoring files (`src/services/ai/prompts.ts`, `_server-lib/ai/responseSchema.ts`, `_server-lib/ai/geminiClient.ts`, `_server-lib/ai/analysisService.ts`, `src/services/ai/scoreNormalization.ts`, `src/services/ai/requirementVerification.ts`, later `src/services/ai/fitScore.ts`, `scripts/m3b-a1/**`). **Not a required check**, so unrelated development is never blocked. A red run on a scoring PR means "re-freeze needed", enforced by a PR-template checkbox and review.
   - The offline guard still blocks the SEC-2 loopback tests, which is harmless because the benchmark job runs only `scripts/m3b-a1`.
3. **A3.3 branch** from main after PR-2 (so `fitScore.ts` can join the freeze manifest in the same change). If the owner declines PR-2, cut A3.3 from main without the harness, and drop the freeze step from A3.3.

This preserves R0 and SEC-2 (no production file is touched by PR-1/PR-2) and keeps freeze verification separate from normal CI. Scoring-contract changes require a re-freeze (manifest + the new module hash).

## 9. A3.3 implementation plan (offline; not started)

| Item | Content |
|---|---|
| Scope | Pure module `src/services/ai/fitScore.ts` implementing §2 (ported from the prototype, renamed: `isolation.test.ts` rejects `scoringRubric`/`m3b-a1` in production files) with `FIT_SCORE_VERSION = 'fit-score-v1'`; shadow call in `analyzeCV` behind `FIT_SCORE_SHADOW`; `fitShadow` passed to the handler's existing success log |
| Files | new `src/services/ai/fitScore.ts`; `_server-lib/ai/analysisService.ts` (shadow compute + return field); `_server-lib/ai/suggestionGuard.ts` (`GuardMetrics` type gains optional `fitShadow`); `_server-lib/analyze/handler.ts` (pass it into `guard_metrics`); `docs/11_guard_metrics.md`; new tests; harness manifest re-freeze (if PR-2 merged) |
| Tests | contract table tests (every §2.2 rule); property tests (permutation, bucket reassignment, duplicates, monotonicity, range, rounding boundaries 59.5/79.5); EN/VI/mixed rows; experience boundary rows; null/ineligible reasons; row cap; **response body byte-identical with shadow on vs off**; quota/settlement call sequence unchanged; shadow exception → `eligible:false, reason:'error'` and a 200 result; `guard_metrics` contains no string outside the enums (a privacy test); request hash unchanged |
| Risk | Low–medium: touches the analyze path; the output contract is unchanged |
| Acceptance | All tests + `lint` + `lint:api` + `build` green; zero Gemini calls; the benchmark freeze is re-frozen; the flag defaults to off |
| Rollback | Revert the commit (nothing deployed) |

The A3.4 shadow deploy, observation and flip remain separate owner approvals (A3.1 §9).

## 10. Owner decisions required

| ID | Decision | Recommendation | Needed before |
|---|---|---|---|
| OD-8 | Weights | 3:1 | A3.3 freeze of `fit-score-v1` |
| OD-2 | Unknown credit | 0, kept in the denominator | A3.3 |
| OD-5 | Experience/seniority | no numeric penalty; row status + P0 downgrade (measure in shadow) | A3.3 |
| OD-E1 | Evidence required for full credit | yes (P0 `met`) | A3.3 |
| OD-12 | List-only evidence | full credit in v1, measured | A3.3 |
| OD-D1 | Duplicate merge + versioned alias table (incl. a VI list later) | approve | A3.3 |
| OD-I1 | Shadow reads the normalized (displayed) rows + a `schemaViolations` counter | approve | A3.3 |
| OD-I2 | Row cap 100 → ineligible | approve | A3.3 |
| OD-M1 | `fitShadow` telemetry shape (§4.2, §5.2) | approve | A3.3 |
| OD-M2 | Retention window for shadow data + privacy-policy check | e.g. 90 days after the window | A3.4 shadow deploy |
| OD-B1 | Branch/CI plan: PR-1 docs, PR-2 harness with a non-required path-filtered freeze job | approve | A3.3 start |
| OD-3 | Category scores at the flip | derive 4 buckets, retire 4 sourceless keys | A3.4 flip |
| OD-V1 | Version names `fit-score-v1` / `fit-v1`, flags `FIT_SCORE_SHADOW` / `FIT_SCORE_AUTHORITY` | approve | A3.3 |
| OD-O1 | Minimum observation evidence (§7) | approve or amend | A3.4 flip |
| OD-17 | Fixture labels | sign | A3.4 flip |
| OD-6 | Band label wording | fit level, not probability | A3.4 flip |
| OD-C | Read-only production volume/token SQL | optional, informs the window | A3.4 |

Already accepted: OD-7, OD-10.

**Verdict: READY WITH CONDITIONS.** The contract is fully specified and testable offline. A3.3 may start once:
1. the shadow-v1 policy values (OD-8, OD-2, OD-5, OD-E1, OD-12, OD-D1, OD-I1, OD-I2, OD-V1) are approved, even provisionally (they affect no user while in shadow);
2. the telemetry shape (OD-M1) is approved;
3. the branch/CI plan (OD-B1) is chosen.

Retention (OD-M2) gates the shadow deploy; OD-3, OD-O1, OD-17 and OD-6 gate the flip.

---

## Tóm tắt cho chủ dự án (tiếng Việt)

- **Hợp đồng chấm điểm `fit-score-v1`:**
  - Server tính điểm 0–100 từ chính các dòng yêu cầu Gemini đã trả về: bắt buộc ×3, ưu tiên ×1; đạt 1, một phần ½, thiếu hoặc không rõ 0.
  - Làm tròn một lần. Không có dòng hợp lệ thì **không có điểm** (không tự bịa điểm).
  - Gộp yêu cầu trùng, loại từ khoá ATS khỏi điểm, và chỉ cho "đạt" trọn điểm khi CV có bằng chứng rõ.
- **Chạy ngầm trước:**
  - Không thêm lần gọi Gemini, không đổi prompt, schema hay cơ sở dữ liệu.
  - Không đổi điểm người dùng thấy, không ảnh hưởng lượt dùng hay thanh toán.
  - Chỉ ghi số liệu (điểm cũ, điểm mới, chênh lệch, số dòng theo trạng thái) vào `guard_metrics`. Không ghi CV, JD hay nội dung yêu cầu.
- **Kết quả mô phỏng (dữ liệu giả lập, không phải số liệu thật):**
  - Công thức chính xác và giải thích được.
  - CV toàn "một phần" chỉ còn 50 điểm (Low).
  - Ứng viên thiếu số năm kinh nghiệm có thể được điểm **cao hơn** cách chấm hiện tại. Đây là rủi ro chính cần đo khi chạy ngầm.
- **Chuyển sang điểm mới** cần anh/chị duyệt riêng, dùng phiên bản điểm mới `fit-v1`, không chấm lại dữ liệu cũ, và có thể tắt bằng cờ để quay lại.
- **Anh/chị cần quyết định:**
  - trọng số 3:1;
  - "không rõ" = 0 điểm;
  - không trừ điểm kinh nghiệm theo công thức;
  - "đạt" phải có bằng chứng;
  - CV chỉ liệt kê kỹ năng vẫn được trọn điểm ở v1;
  - gộp trùng và bảng đồng nghĩa;
  - dạng số liệu ghi ngầm và thời gian lưu;
  - kế hoạch nhánh/CI (PR tài liệu riêng, PR bộ benchmark với job kiểm tra đóng băng không bắt buộc).
- **Kết luận: READY WITH CONDITIONS.** A3.3 bắt đầu được sau khi anh/chị duyệt các giá trị cho bản chạy ngầm, dạng số liệu ghi và kế hoạch nhánh/CI.
