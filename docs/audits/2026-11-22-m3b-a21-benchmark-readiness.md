# M3-B A2.1 — Gemini benchmark readiness (offline audit)

- **Date:** 2026-11-23 (filename keeps the requested 2026-11-22 milestone date)
- **Branch:** `audit/m3b-a21-benchmark-readiness`, cut from `origin/main` = `5776735` (worktree `../cv-compare-tn-m3b-a21`). Local commit only. Not pushed.
- **Mode:** offline. **0 Gemini API calls**, 0 production or Preview traffic, 0 DB access (local or remote), no migration, no deploy, no secret read, no PR touched. SEC-1 and SEC-2 were not reopened. No production or test code changed; this document is the only file added.
- **Name disambiguation:** this document is the **"A2.1 readiness"** milestone requested on 2026-11-22. It is **not** the "A2.1 held-out expanded stage" defined in protocol v2 (`audit/m3b-a1-score-stability@3fd9b74:docs/audits/2026-11-22-m3b-a2-benchmark-protocol.md` §3). That stage still follows A2.0 and needs its own approval.
- **Citation convention:** plain `path:line` means **main @ 5776735**. Paths prefixed `A1@3fd9b74:` are on the local, never-pushed branch `audit/m3b-a1-score-stability` (worktree `../cv-compare-tn-m3b-a1`, base `67867d3`). That branch holds the A2 runner, transport, fixtures and manifest. **None of it is on main.**

## 0. Verdict

**NO-GO for A2.0 live execution.** The offline readiness work is complete. Four blockers remain, and each needs an owner decision or new offline work:

| # | Blocker | Section |
|---|---|---|
| B1 | **No provider-documented upper bound on billable thinking + output tokens per call.** OD-16 (use the 65,536 model output limit as the bound) was **rejected** by the owner in R0.1. So the unconditional worst case is **UNKNOWN**. | §3 |
| B2 | **The gated harness is not on main.** The runner, live transport, ledger, A2/A2.1 fixtures and freeze manifest exist only at `A1@3fd9b74`, based on `67867d3`, which predates R0 (`5610d74`). | §5.1 |
| B3 | **The runner does not reproduce production canonical-en-v2 response handling.** It has no `finishReason` gate and no `normalizeMatchScore`. Its characterization tests assert the pre-R0 "no clamp/round" behaviour, so it must be ported and re-frozen. | §5.2 |
| B4 | No isolated host, dedicated restricted key, billing alert or reviewed execution commit exists. This is carried over unchanged from A2-P §7. | §5.4 |

The path to **CONDITIONAL GO** is the owner decision list in §8. A2.0 also still needs its own separate, explicit, SHA-locked execution approval.

## 1. Verified Gemini configuration (code at 5776735)

### 1.1 Models, endpoints, generation config

| Workload | Model | `maxOutputTokens` | Thinking | Evidence |
|---|---|---|---|---|
| **analyze (scoring)** | `gemini-3-flash-preview` | 16,384 | `{ thinkingBudget: 1024 }` | `_server-lib/ai/geminiClient.ts:7`, `:16`; `_server-lib/ai/analysisService.ts:184-194` |
| analyze localization (UI=vi only) | `gemini-3-flash-preview` | 16,384 | same | `_server-lib/ai/localizeAnalysis.ts:130-139` |
| parse_cv | `gemini-3.5-flash-lite` | 16,384 | `{ thinkingLevel: LOW }` | `geminiClient.ts:8`, `:17`; `parseCvService.ts:187-193` |
| Full CV rewrite | `gemini-3-flash-preview` | 16,384 | `thinkingBudget: 1024` | `geminiClient.ts:9`; `rewriteService.ts:213-219` |
| cover letter / application review | `gemini-3-flash-preview` | 4,096 | same | `coverLetterService.ts:242-249`; `applicationReviewService.ts:308-315` |
| follow-up | `gemini-3-flash-preview` | 2,048 | same | `followUpService.ts:193-200` |

- **Request (scoring):** `responseMimeType: application/json`, `responseSchema: ANALYSIS_RESPONSE_SCHEMA`, one user turn = the English canonical prompt (`buildAnalyzePromptEn`) plus `CV Content:` text, or the CV as `inlineData` (PDF/image) (`analysisService.ts:94-177`). There is no `systemInstruction`, `temperature`, `topP`, `topK`, `seed` or `candidateCount`. Provider defaults apply, and their values are **UNKNOWN**.
- **Endpoint:** the `@google/genai` 1.48.0 SDK (`package-lock.json:970-972`) with an API key → Gemini Developer API `generativelanguage.googleapis.com` (SDK default). No Vertex AI.
- **Frozen request contract is unchanged since A2-P.** SHA-256 of `src/services/ai/prompts.ts` (`a0078773…`), `_server-lib/ai/responseSchema.ts` (`5fb1daa4…`), `_server-lib/ai/geminiClient.ts` (`0c268a42…`) and `src/services/ai/requirementVerification.ts` (`f97fc4cf…`) are byte-identical on main and on `A1@3fd9b74`, and match `A1@3fd9b74:scripts/m3b-a1/A2_FIXTURES_MANIFEST.json` `files`. The `analysisService.ts` diff `67867d3..5776735` is **response-side only** (finishReason gate, `normalizeMatchScore`, error redaction). So `requestConfigHash 0892cba0…` and the per-fixture rendered-request hashes stay valid. The parity test must still be re-run on main (§5.2).

### 1.2 `thinkingBudget` / `thinkingConfigFor` — effective behaviour

- `thinkingConfigFor(model)` is a static lookup (`geminiClient.ts:15-22`). It gives `thinkingBudget: 1024` for `gemini-3-flash-preview` and `thinkingLevel: LOW` for `gemini-3.5-flash-lite`.
- The code's own comment (`geminiClient.ts:11-14`) says "Newer models only document thinkingLevel". **Whether Gemini 3 Flash honours `thinkingBudget` as a cap, maps it to a level, or ignores it is UNKNOWN.** Nothing in the code or the logs can show this, because `extractTokenUsage` merges `thoughtsTokenCount` into `outputTokens` (`geminiClient.ts:42-51`). `analysis_log` has no thoughts column (`supabase/migrations/20260704000000_analysis_log_token_usage.sql:10-14`).
- **Whether thinking tokens count against `maxOutputTokens` for `generateContent` is UNKNOWN.** A2-P §2.3 (official docs, retrieved 2026-11-22) found "including thought tokens" stated only for the Interactions API. The `generateContent` reference defines `maxOutputTokens` as tokens "in a response candidate".

### 1.3 Timeouts, deadlines, body and input limits

| Item | Value | Evidence |
|---|---|---|
| Request wall-clock budget | `TOTAL_BUDGET_MS = 65_000` | `_server-lib/deadline.ts:5` |
| Post-AI reserve | `POST_RESERVE_MS = 6_000` → AI deadline ≤ 59 s minus auth/plan/quota/storage | `deadline.ts:7`; `_server-lib/analyze/handler.ts:57-58` |
| Minimum budget to start Gemini | `MIN_GEMINI_BUDGET_MS = 10_000` (checked before and after PDF extraction) | `deadline.ts:9`; `analysisService.ts:129`, `:181` |
| Gemini cancellation | `abortSignal` from the same deadline + `Promise.race` timeout. No SDK timeout | `analysisService.ts:110-126`, `:196`; `geminiClient.ts:27-31` |
| Localization (vi) | only if ≥ 15 s left, cap 20 s, on the same AI deadline | `localizeAnalysis.ts:16-17`, `:122-126` |
| `analyzeCV` default `timeoutMs` | 45 s. Applies **only to direct callers** (scripts); the handler always passes the remaining AI budget | `analysisService.ts:73`; `handler.ts:256-259` |
| Vercel `maxDuration` (analyze/rewrite/parse) | 300 s | `vercel.json:53-61` |
| Browser timeout | 75 s | `src/services/ai/analysisService.ts:78` |
| Body limit (AI endpoints) | 16 MiB | `_server-lib/http/guard.ts:16-23`; `api/analyze.ts:16` |
| JD / CV text ceilings | `MAX_JD_CHARS = 50_000`, `MAX_CV_TEXT_CHARS = 100_000` → 413, never truncated | `src/lib/inputLimits.ts:4-5`; `_server-lib/inputLimits.ts:21-29` |
| Inline PDF | ≤ 15 MiB decoded (`MAX_INLINE_PDF_BYTES`) | `analysisService.ts:65`, `:171-176` |

### 1.4 Retry policy

- **SDK:** no retries. In `@google/genai` 1.48.0, `apiCall` only retries when `httpOptions.retryOptions` is set (`node_modules/@google/genai/dist/node/index.mjs:13159-13163`). The client sets no `httpOptions` (`geminiClient.ts:29-31`).
- **Server:** no automatic retry for scoring (`handler.ts:349` "No automatic retry"). Rewrite, cover letter and follow-up have one *validation* retry (a second generateContent) when the first output fails fidelity checks (`rewriteService.ts:297-314`; `coverLetterService.ts:281-296`; `followUpService.ts:240-253`). This is not relevant to scoring.
- **Client:** no automatic re-send. A failed run is retried only when the user clicks retry-failed-only (`src/context/analysis/AnalysisRunContext.tsx:368-379`).

### 1.5 Token accounting

- `extractTokenUsage` returns `input = promptTokenCount` and `output = candidatesTokenCount + thoughtsTokenCount` (`geminiClient.ts:42-51`). It ignores `toolUsePromptTokenCount` and `cachedContentTokenCount`; neither is used in production today.
- **UI=vi analyze = 2 generateContent calls, 1 log row.** Localization usage is **summed** into the canonical usage (`analysisService.ts:301-312`) and logged once (`handler.ts:289`). The comment "one row per Gemini call" (`_server-lib/analysisLog.ts:11-12`) is therefore wrong for vi. Production averages per log row (for example the 3,829 in / 1,775 out mix) are **per request, not per call**.
- **Failure paths log 0 tokens.** On timeout, abort or provider error the handler logs only `{ model }` (`handler.ts:310-311`), so a call the provider may still bill appears with 0 tokens. `InvalidAiOutputError` paths *do* log real usage (`handler.ts:359`; `analysisService.ts:197-209`). `admin_report_stats` sums success rows only (existing debt, R0.1).

## 2. Token caps vs fixtures and pipeline

### 2.1 Sizes (measured offline, this audit)

| Item | Size |
|---|---|
| Canonical prompt template (JD empty, month 11/2026) | 15,976 chars / 16,052 bytes |
| `ANALYSIS_RESPONSE_SCHEMA` JSON | 4,170 bytes (sent with every request; whether it counts in `promptTokenCount` is **UNKNOWN**) |
| A2.0 rendered request bodies | 21,325–21,470 bytes (`A2_FIXTURES_MANIFEST.json` `a20[].requestBytes`) |
| A2.1 held-out request bodies | 21,207–23,731 bytes |
| Largest fixture text, A2 sets | JD 953 chars, CV 1,972 chars (`a21-long`) |
| Largest fixture text, main `SAMPLES` | JD 935 chars (`vi-long`), CV 2,168 chars (`vi-long`) |
| Production observations | 3,911 in / 1,612 out (R0.3-B EN recruiter smoke, 1 call); 3,829 / 1,775 mix (per log row; includes vi localization) |

The `_server-lib/inputLimits.ts:7-8` claim that benchmark JDs "top out under 1k chars" **holds** (max 953).

### 2.2 Estimated tokens per fixture call

- **Expected input** ≈ 3.9k–4.5k tokens: the template dominates; fixture JD+CV ≤ 3k chars ≈ ≤ 0.8k tokens. This is consistent with the 3,911 observed on a real call.
- **Hard input bound used by the runner:** `bytes + 1,024` ≈ 22.2k–24.8k tokens (`A1@3fd9b74:scripts/m3b-a1/a2Runner.ts:33`, `:73-74`). This bound is derived, not provider-enforced, and the runner stops if `promptTokenCount` exceeds it (`a2Runner.ts:356`).
- **Expected output** (candidates + thoughts) ≈ 1.6k–1.8k from production. A2 fixtures produce a similar JSON shape, so this estimate is plausible but **UNVERIFIED** for these fixtures.

### 2.3 Truncation and context overflow

- **No truncation exists:** oversize JD/CV is rejected with 413 (`_server-lib/inputLimits.ts:1-3`). The worst accepted text request is 50k JD + 100k CV chars + template ≈ 170 KB, i.e. ≤ ~170k tokens. That is far below the documented 1,048,576-token input limit (A2-P §2.3, verified 2026-11-22). **Context overflow is not reachable** with text input.
- **Inline PDF/image input** is bounded by bytes (15 MiB / 16 MiB body), not tokens. The per-page token cost and page limit for PDFs are **UNKNOWN** (not re-verified). This modality is out of scope for A2.0.
- The comment in `src/lib/geminiModels.ts:2-3` ("prompts <=200k") implies a prompt-length price tier. A2-P found **no prompt-length tier** for `gemini-3-flash-preview`. Benchmark inputs are ~4k tokens either way, so this does not affect the cost model.

### 2.4 Does thinking compete with the output limit? What happens when budgets run out?

- **If** thoughts count against `maxOutputTokens` (UNKNOWN), then at `thinkingBudget: 1024` the JSON keeps ≥ 15,360 tokens, about 8.5× the observed total output. If `thinkingBudget` is *not* honoured on Gemini 3 (UNKNOWN), long reasoning could exhaust 16,384 tokens.
- **Exhaustion behaviour is safe since R0.3-A:** any candidate with `finishReason !== STOP` → `InvalidAiOutputError('incomplete_response')` (`analysisService.ts:208-209`); a blocked prompt → `'blocked'` (`:207`); unparseable output → `'malformed_json'` (`:215-221`); an invalid score → its own reason (`:225-226`). The handler releases the quota as `provider_error`, logs the real usage, and returns 502 `invalid_ai_output` with no automatic retry (`handler.ts:351-363`). This is covered by the 23 R0.3-A tests (`_server-lib/__tests__/` and `src/__tests__/` at `bc77dab`, squashed into `5610d74`). No new fixture is needed for this path.
- **Gaps outside scoring (known debt, not blocking):** localization, parse_cv and rewrite do not check `finishReason` (`localizeAnalysis.ts:143-146`; grep shows `finishReason` only in `analysisService.ts`). Localization falls back to English on a parse failure, so a truncated translation degrades presentation but never the score.

### 2.5 Proposed safe limits (proposal only, no production change)

| Limit | Proposal | Why |
|---|---|---|
| Benchmark per-call input stop | keep `promptTokenCount ≤ bytes + 1,024` (runner) | already fail-closed |
| Benchmark per-call output **stop** (new) | stop the run if `candidates + thoughts > 17,408` (16,384 + 1,024) | this is the evidence that the H1 cost model (§3) is wrong. A2-P only *records* `exceededMaxOutputTokens` (`a2Runner.ts:364`); with OD-16 rejected it should halt |
| Benchmark per-call latency | abort at 60 s (runner `REQUEST_TIMEOUT_MS`), report a fail if > 45 s | unchanged from protocol v2 §4.5 |
| Production `maxOutputTokens` | **no change** | any request change shifts `matchScore` (P0 calibration lesson) |
| Production JD/CV ceilings | no change until owner SQL (§8, OD-C) gives real percentiles | `_server-lib/inputLimits.ts:5-9` says the same |

## 3. Cost ceiling for 24 planned calls

### 3.1 Pricing assumptions (verification status)

| Input | Value | Status |
|---|---|---|
| `P_in` (gemini-3-flash-preview, text input, Standard paid tier) | $0.50 / 1M tokens | **VERIFIED 2026-11-22** (A2-P §2.3, official pricing page). Not re-verified in this audit |
| `P_out` (output, "including thinking tokens") | $3.00 / 1M tokens | **VERIFIED 2026-11-22**, same source. Matches `src/lib/geminiModels.ts:9` |
| Billing tier of the benchmark key | Standard (paid) assumed | **UNKNOWN** until the dedicated project exists |
| Charge for HTTP 400/500 | "you won't be charged" | VERIFIED 2026-11-22 (billing docs) |
| Charge for 429, timeout, client abort | not documented | **UNKNOWN** → charged at full reservation |
| Context caching / tool-use dimensions | not used; runner stops if non-zero | n/a |
| **Thinking-token upper bound per call** | none documented for `generateContent` | **UNKNOWN** (OD-16 rejected) |

**Formula (per call):** `cost = in_tok × P_in / 10⁶ + (candidates_tok + thoughts_tok) × P_out / 10⁶`.
**Runner reservation:** `⌈((bytes + 1,024) × P_in + OUT_BOUND × P_out) / 10⁶ to $0.0001⌉` (`a2Runner.ts:72-74`).
**Re-verify `P_in`/`P_out` on the day of execution** (GO item G7).

### 3.2 Envelope by assumption tier (A2.0 fixtures, 21.4 KB request ⇒ input bound ≈ 22,494 tokens)

| Tier | Assumption | Per call | 24 calls | Status |
|---|---|---|---|---|
| **E — expected** | ~4,000 in, ~1,800 out (production observation) | 4,000×0.5/10⁶ + 1,800×3/10⁶ = **$0.0074** | **$0.18** | evidence, not a bound |
| **H1a** | `maxOutputTokens` 16,384 bounds candidates + thoughts | 0.011247 + 0.049152 = **$0.0604** | **$1.45** | UNKNOWN |
| **H1b** | 16,384 bounds candidates; `thinkingBudget` 1,024 hard-caps thoughts | 0.011247 + 0.052224 = **$0.0635** | **$1.52** | UNKNOWN |
| **H2** | 65,536 model output limit bounds thinking + output (rejected OD-16) | 0.011247 + 0.196608 = **$0.2079** | **$4.9891** (A2-P table, per-fixture rounding) | rejected by owner |
| **W — provider worst case** | no documented bound | **UNKNOWN** | **UNKNOWN** | **blocks A2.0** |

Observed production usage is evidence, not a bound. This audit does **not** derive a bound from it.

### 3.3 Retry and failure scenarios (inside the 24-request ceiling)

- Retries consume budget and count toward the 24 requests (`a2Runner.ts:338-343`). At most 4 retries, and only for 429/500/503.
- 400 / other 4xx → durable stop, charged at reservation (conservative; docs say no charge).
- Timeout, abort or network error → `unknown`, **charged at full reservation**, durable stop (`a2Runner.ts:333-334`).
- 200 without `usageMetadata` → `accounting_uncertain`, charged at reservation, durable stop (`:347`, `:366`).
- Worst *plan* scenario under H2: 20 primary + 4 retries all at reservation = $4.9891. Under H1b, all at reservation = 24 × $0.0635 = $1.52.

### 3.4 Maximum authorized spend

- **OD-1 (accepted):** $5.00 hard cap, **cumulative across A2.0 + A2.1**, ≤ 24 A2.0 requests, concurrency 1 (`APPROVED_CAPS`, `a2Runner.ts:37`).
- **Proposed soft stop-loss (new):** halt A2.0 if cumulative *actual* spend exceeds **$1.00** (≈ 5.5× tier E for all 24) or any single call exceeds $0.10. Either one means the cost model is wrong.
- **Proposed provider-side ceiling (new, must be verified at setup):** a per-project request quota on the dedicated project (for example `GenerateContent` requests/day = 24) and a billing budget alert at $2 / $5. A quota override would be a provider-enforced **call** ceiling, but it still does not bound tokens per call. Whether this quota can be set on the paid tier is **UNKNOWN**. Budget alerts are not hard caps.

## 4. Fixture audit

### 4.1 Inventory

| Set | Location | Count | Labels / expected scores | Purpose |
|---|---|---|---|---|
| `SAMPLES` | `scripts/benchmark-gemini-fixtures.ts:155-485` (main) | 17 (11 base + 6 P0) | **none** (truth = parse facts and keyword lists) | fidelity/guard benchmarks, not score stability |
| A2.0 | `A1@3fd9b74:scripts/m3b-a1/a2Fixtures.ts` | 4 | draft labels + rubric score (OD-17 **pending**) | pilot |
| A2.1 held-out | `A1@3fd9b74:scripts/m3b-a1/a21Fixtures.ts` | 6 (frozen priority order) | draft labels | expanded stage |
| Rubric unit fixtures | `A1@3fd9b74:scripts/m3b-a1/fixtures.ts` | 9 finding sets (incl. `INJECTION`, OR-group, duplicates, VI presentation) | n/a | offline rubric replay |

### 4.2 Coverage

| Dimension | `SAMPLES` | A2.0 + A2.1 |
|---|---|---|
| EN JD / EN CV | 13 | 7 |
| VI JD / VI CV | 3 (`vi-short`, `vi-long`, `vi-no-contact`) | 1 (`a21-vi-vi`) |
| EN JD / VI CV | 0 | 2 (`a2-boundary-60`, `a21-career-transition`) |
| **VI JD / EN CV** | 0 | **0 — gap** |
| PDF text / inline scan | 2 (files gitignored under `.r2-migration/`, present only in the owner checkout — **not reproducible from the repo**) | 0 |
| Seniority | n/a | junior (b60), mid, senior-mismatch (`a21-seniority-mismatch`), career-transition |
| Score range | n/a | label scores 0 / 62 / 63 / 65 / 73 / 75 / 78 / 83 / 95 / 100 (both bands' boundaries covered) |
| Missing skills / OR groups / aliases / list-only evidence | P0 set (experience met/unmet, IELTS absent/6.0, duration conflict) | b60 (OR + years shortfall), semantic-stress (OR, K8s alias, list-only), keyword-stuffed |
| Prompt injection in CV/JD | `p0-injection` (unlabeled) | rubric `INJECTION` only, **not in a live labeled fixture** |
| Long input | none > 2.2k chars | `a21-long` 953 / 1,972 chars only; **no near-limit fixture** |
| Recruiter path | none | out of scope (A2-P §3). The request is identical to personal (same `analyzeCV`), so this mainly tests settlement, not scoring |

### 4.3 Deterministic properties and privacy

- Deterministic: frozen fixture/label/rendered-request SHA-256 values; pinned month `11/2026` (`a2Runner.ts:46-47`, `:267` refuses on config-hash mismatch); offline replay variance 0 (A1). Responses are non-deterministic by design (no temperature/seed); that variance is what is being measured.
- **Month pin caveat:** the runner sends `11/2026` whenever it runs. After 2026-12-01 (VN time) the benchmark request no longer equals what production would send that day. "nay"/present-date duration fixtures (b60 "06/2025 – nay") stay comparable only inside the frozen month. Either execute before 2026-12-01 or accept the frozen-month request as the reference; do not re-pin without a re-freeze.
- Privacy: all fixtures are synthetic. Every email address is `@example.com`; phones are placeholders (`+6580001234`). No production CV/JD is used. The gitignored PDF fixtures are synthetic by name and were not opened in this audit.

### 4.4 Proposed missing offline fixtures (none created here; each needs labels + re-freeze)

1. **VI JD + EN CV** (the only uncovered language combination).
2. **Near-limit text input** (e.g. ~45k-char JD + ~90k-char CV, synthetic): input-token stress, latency against the 59 s AI deadline, no-truncation proof. About 40–50k input tokens ⇒ +$0.02–0.025 input per call.
3. **Labeled prompt-injection CV** (instruction text inside the CV asking for score 100), so injection resistance is scored, not only replayed.
4. **Sparse/empty-evidence CV** (contact block + 1 line), for low-end calibration besides `a21-weak`.
5. **Text-extracted PDF** of an existing A2 fixture (same text): checks that the PDF route equals the text route. The inline-scan modality stays out of scope.
6. **Unit-only (no live call):** a runner test where a 200 response carries `finishReason: MAX_TOKENS` / `SAFETY`, or `matchScore` 59.5, `"abc"` or 101, and must be settled as *charged but invalid*, never counted as a done run (closes B3).

## 5. A2.0 live-execution safety gate (design)

### 5.1 Location (B2)

The gate must exist **on a branch cut from current main**, not on `A1@3fd9b74`. Proposed: port `scripts/m3b-a1/` (runner, transport, ledger, manifest, offline vitest config, tests) onto a new branch from `5776735` in one reviewed commit; re-run the parity test and freeze tests under the vitest 4.1.12 now on main (SEC-1 PR2); then commit a new `A2_FROZEN.json`. This is owner decision OD-B.

### 5.2 Response-side parity with production (B3)

At `A1@3fd9b74:a2Runner.ts:347-369` any HTTP 200 with usage metadata is settled `ok` and the run counts as done. It does **not** apply:
- `finishReason === STOP` and `!promptFeedback.blockReason` (`analysisService.ts:207-209`);
- `normalizeMatchScore` (finite number in [0,100], round half-up once — `src/services/ai/scoreNormalization.ts`, `analysisService.ts:225-227`);
- `A1@3fd9b74:scripts/m3b-a1/__tests__/currentPipelineCharacterization.test.ts:64-67` asserts "no clamp/round", which contradicts main.

Required: the analysis step classifies each `ok` artifact with the **production functions imported from main** (no re-implementation). Invalid outputs are counted as charged attempts and as the operational "invalid-output rate", and they are excluded from score statistics. The scores reported are integer canonical-en-v2 scores.

### 5.3 Gate requirements

| Control | Design | Exists at A1@3fd9b74? |
|---|---|---|
| Explicit owner approval | approval reference (SHA-locked commit + manifest hash) required to flip `LIVE_ENABLED` and to resume after any stop | partially (`approvalRef` for resume/repair); flip not built |
| Max call count | 24 A2.0 requests; cumulative 88; enforced in code (`APPROVED_CAPS`) **and** by a provider request quota if settable | code yes; provider no |
| Max aggregate spend | $5.00 cumulative hard (reservation-based); **$1.00 actual soft stop-loss (new)** | hard yes; soft no |
| Per-call token budget | input ≤ bytes+1,024 (stop); **output ≤ 17,408 stop (new)**; output > 65,536 stop | input/65,536 yes; 17,408 no (records only) |
| Retry policy | only 429/500/503; ≤ 4; **every retry reserves and counts** toward 24 and $ | yes |
| Fail-closed on unknown cost/usage | missing usage, `totalTokenCount` mismatch, cached/tool dimension, timeout/abort → charged at full reservation + durable stop | yes |
| Durable execution ledger | append-only JSONL, fsync, short-write check, lock, torn-tail repair, open attempt = full charge | yes (37 tests) |
| Stop conditions | protocol v2 §6 + new: output > 17,408; actual > $1.00; any call > $0.10; ≥ 2 invalid outputs; 2 consecutive non-ok; month ≠ pinned without re-freeze | partially |
| Model drift guard (new) | record `modelVersion` from every response; stop if it changes mid-run | no |
| Isolation | dedicated GCP project, key restricted to Generative Language API, key file 0400, forbidden-env refusal, egress allowlist host | transport yes; host no (B4) |
| Rollback | nothing in production changes, so rollback = revoke key, disable project billing, destroy host, keep the ledger and artifacts; results are evidence only and authorize nothing (protocol v2 §8) | runbook yes (A2-P §4.2) |

### 5.4 Never use for A2.0 (finding F5)

`scripts/benchmark-gemini-analyze.ts` and `scripts/diagnose-analyze-variance.ts` (main) call production `analyzeCV` with the key from `.env`/`.env.local` (`benchmark-gemini-analyze.ts:7-9`). They have **no budget, ledger or call ceiling**, use `CONCURRENCY=3` by default (`:29`), default `RUNS=20` in the diagnose script (`diagnose-analyze-variance.ts:27`), and run both UI languages, which adds localization calls. They are valid tools for owner-run prompt work, but **they are not a gated A2.0 path**.

## 6. A2.0 execution plan (requires separate explicit owner approval)

### 6.1 Matrix — 24 generateContent requests maximum

| Fixture | Label (draft, OD-17) | Interval | Runs | Request bytes | Reservation H2 / H1b |
|---|---|---|---|---|---|
| a2-strong | 100 High | 88–100 | 5 | 21,376 | $0.2079 / $0.0635 |
| a2-boundary-80 | 83 High (boundary) | 75–91 | 5 | 21,470 | $0.2079 / $0.0635 |
| a2-boundary-60 | 63 Medium (boundary) | 53–73 | 5 | 21,440 | $0.2079 / $0.0635 |
| a2-semantic-stress | 78 Medium | 68–88 | 5 | 21,325 | $0.2078 / $0.0635 |
| retries (429/5xx only) | — | — | ≤ 4 | — | largest reservation |
| **Total** | | | **≤ 24** | | **$4.9891 (H2) / $1.52 (H1b)**; expected **≈ $0.18** |

Every request is the raw canonical request (equivalent to `language: 'en'`): no localization, no parse_cv, no rewrite. "24 calls" means 24 outbound generateContent requests.

### 6.2 Order and checkpoints

1. **CP0 canary** (request 1, a2-strong #1). Verify: HTTP 200, `finishReason STOP`, usage present and consistent, `modelVersion` recorded, output ≤ 17,408, actual ≤ $0.02, valid canonical-en-v2 score. **Stop for owner review** before continuing. This limits the UNKNOWN-bound exposure to one call before any evidence exists.
2. **CP1** after one run of each fixture (requests 2–4). Same checks, plus inspection of the score sanity per fixture.
3. **CP2** after 12 primary runs: interim range/band flips; stop-loss check.
4. **CP3** after 20 primary runs (+ retries): final.

The current runner order is fixture-major (`a2Runner.ts:301`, `:309`). Proposal for the port: **round-robin** (run *k* of every fixture before run *k+1*), so time-of-day or model drift cannot be mistaken for a fixture effect. Changing the order needs a re-freeze.

### 6.3 Score-stability metrics and thresholds

From protocol v2 §4, A2.0 column (frozen; unchanged here):

| Metric | A2.0 fail condition |
|---|---|
| Requirement status agreement with signed labels | < 60% |
| Required/preferred agreement | < 70% |
| Model score per fixture | report median, range, SD, MAD, band-flip rate vs modal band (integer canonical-en-v2) |
| Rubric vs model | rubric range ≤ model range on ≥ 3/4 fixtures; rubric range ≤ 8 on ≥ 3/4 |
| Discrimination | rubric median(strong) − median(b60) ≥ 25 **and** ≥ 0.8 × model gap; order strong > b80 > b60 |
| Invalid-output rate | > 1/20 |
| Latency | any attempt > 45 s |
| Cost | actual > reservation on any attempt (mandatory) |

Reference for the reader: P2A.2 measured a model range of 13 (75–88) at N=20 on one fixture, and P0 measured a PRE run-to-run MAD of 1.2–1.5.

### 6.4 Stop-loss

The hard $5.00 / 24-request caps hold. Soft stops (durable, owner resume required): actual > $1.00; any call > $0.10; output > 17,408; ≥ 2 invalid outputs; 2 consecutive non-ok; any unknown outcome; `modelVersion` change; ledger or artifact failure. **No automatic expansion** of budget, count or stage.

### 6.5 GO / NO-GO checklist (all must be YES)

- [ ] G1 OD-A decided (cost-bound strategy, §8) — **currently BLOCKED**
- [ ] G2 OD-17 labels and intervals signed (or amended + re-frozen)
- [ ] G3 Harness ported to a branch from current main, response-side parity (§5.2), new stops (§5.3), re-frozen; offline suite + lint + lint:api green at that SHA
- [ ] G4 Dedicated GCP project + key restricted to the Generative Language API + billing alert; request quota set if available
- [ ] G5 Isolated host with verified egress allowlist; no production secrets on it (A2-P §4.2 steps 3–6)
- [ ] G6 Reviewed execution commit (CLI, artifact writer, `LIVE_ENABLED` flip), SHA-locked
- [ ] G7 Pricing and model status (`gemini-3-flash-preview` still served, still Preview, same prices) re-verified on execution day
- [ ] G8 Separate, explicit A2.0 execution approval quoting the SHA, the caps and the stop-loss
- [x] Request contract unchanged vs frozen manifest (hashes verified in §1.1)
- [x] Runner, ledger and transport designed and tested offline (at A1@3fd9b74)

## 7. Findings register

| ID | Severity | Finding | Evidence | Recommended fix |
|---|---|---|---|---|
| F1 | **Blocker** | No documented thinking/output token bound per `generateContent` call; OD-16 rejected ⇒ worst case UNKNOWN | A2-P §2.3-2.4; §3 above | OD-A (§8) |
| F2 | **Blocker** | Gated harness exists only on an unpushed branch based on pre-R0 `67867d3` | `git worktree list`; `A1@3fd9b74` | OD-B: port to a branch from main, re-freeze |
| F3 | **Blocker** | Runner settles any 200 as `ok`; no finishReason / `normalizeMatchScore`; characterization test asserts pre-R0 behaviour | `A1@3fd9b74:a2Runner.ts:347-369`; `currentPipelineCharacterization.test.ts:64-67` vs `analysisService.ts:207-227` | classify with imported production functions; add unit fixtures §4.4-6 |
| F4 | **Blocker** | No host, key, alert or execution commit | A2-P §7 | G4–G6 |
| F5 | High | Main benchmark scripts are uncapped live paths using the `.env` key | `benchmark-gemini-analyze.ts:7-9,29`; `diagnose-analyze-variance.ts:27` | owner rule: never for A2.0; optional later guard (separate PR) |
| F6 | Medium | `thinkingBudget` effect on Gemini 3 cannot be observed: thoughts merged into `output_tokens`, no thoughts column | `geminiClient.ts:11-14,42-51`; migration `20260704000000…:10-14` | the benchmark records `thoughtsTokenCount` separately; optional later telemetry column (needs a migration; out of scope) |
| F7 | Medium | Spend undercount: timeout/abort/provider-error rows log 0 tokens; vi rows sum 2 calls into 1 row; `admin_report_stats` success-only | `handler.ts:310-311`; `analysisService.ts:301-312`; `analysisLog.ts:11-12` | document in the admin cost report; fix comment; separate PR |
| F8 | Medium | Provider-side request/spend controls not verified (quota override, budget alert) | §3.4 | verify at G4 |
| F9 | Low | Docs/memory drift: "60 s Hobby / 50 s / 45 s budget" vs code 65 s total, 300 s `maxDuration`; Vercel plan tier **UNKNOWN**; "one row per Gemini call" wrong for vi; "prompts <=200k" tier note | `deadline.ts:3-5`; `vercel.json:53-61`; AGENTS.md §6; `geminiModels.ts:2-3` | docs-only PR later |
| F10 | Low | No `finishReason` check in localization / parse_cv / rewrite | §2.4 | non-scoring debt; separate ticket |
| F11 | Low | Gitignored PDF fixtures are not reproducible from the repo | `.gitignore:45` | store a synthetic PDF in the frozen fixture set if PDF is ever in scope |
| F12 | Info | Naming collision "A2.1 readiness" vs "A2.1 held-out stage" | header | use "A2.1-R" for this milestone |
| F13 | Info | `gemini-3-flash-preview` is a Preview model: behaviour can change under the same ID; results have a shelf life | A2-P §2.3 | record `modelVersion`; date-stamp all results |

## 8. Owner decisions required

| ID | Decision | Options | Recommendation |
|---|---|---|---|
| **OD-A** (replaces rejected OD-16) | Cost-bound strategy for the UNKNOWN per-call worst case | (i) obtain written provider confirmation of what bounds thinking+output for `generateContent`; (ii) **accept a staged risk**: canary CP0 + output > 17,408 stop + provider request quota + $1.00 soft stop, explicitly accepting that one call has an undocumented bound; (iii) stay blocked | (i) if obtainable within days; otherwise (ii), in writing |
| **OD-B** | Authorize porting the harness to a new branch from main (offline work, no live call) with the §5.2 parity and §5.3 new stops, then re-freeze | approve / defer | approve |
| **OD-C** | Run read-only token-distribution SQL on production `analysis_log` (owner runs it; evidence, not a bound) | approve / skip | approve — query below |
| OD-17 | Sign the A2.0 labels and intervals (§6.1) | approve / amend | review; amend only before any run |
| OD-D | Host option (A2-P §4.1: A temporary VM in a separate project / B CP6 VM / C local container) | A / B / C | A |
| OD-E | Execution order: keep fixture-major or switch to round-robin (§6.2) | keep / round-robin | round-robin (needs a re-freeze anyway under OD-B) |
| OD-F | Execution window vs month pin `11/2026` (§4.3) | before 2026-12-01 VN / accept frozen month | accept frozen month (no rush) |
| OD-G | Confirm the $5.00 cumulative cap and add the $1.00 / $0.10 soft stops | confirm / change | confirm |
| OD-H | A2.0 execution itself | — | only after G1–G8, with a separate SHA-locked approval |

OD-C query (read-only, owner-run; aggregate counts only, no PII):

```sql
BEGIN READ ONLY;
SELECT status,
       count(*)                                                                    AS n,
       percentile_disc(ARRAY[0.5,0.95,0.99]) WITHIN GROUP (ORDER BY input_tokens)  AS in_p50_p95_p99,
       max(input_tokens)                                                           AS in_max,
       percentile_disc(ARRAY[0.5,0.95,0.99]) WITHIN GROUP (ORDER BY output_tokens) AS out_p50_p95_p99,
       max(output_tokens)                                                          AS out_max,
       count(*) FILTER (WHERE output_tokens > 16384)                               AS out_over_16384,
       count(*) FILTER (WHERE error_message LIKE '[invalid_ai_output:incomplete_response%') AS incomplete
FROM analysis_log
WHERE kind = 'analyze' AND model = 'gemini-3-flash-preview'
  AND created_at > now() - interval '60 days'
GROUP BY status;
ROLLBACK;
```

How to read it: rows mix 1-call (en) and 2-call (vi) requests. `out_max > 16384` on an **en**-dominated sample would show that `maxOutputTokens` does not bound thinking (H1a false). Even a clean result is evidence, not a bound.

## 9. Recommended next action

1. The owner decides **OD-A** and **OD-B** (both are required before any further engineering).
2. If OD-B is approved: a new offline branch from main ports the harness, adds §5.2 parity and the §5.3 stops plus the §4.4-6 unit fixtures, re-freezes, and runs the offline suite + `lint` + `lint:api`. Still zero live calls.
3. In parallel, the owner runs the OD-C SQL and signs OD-17.
4. Only then build the host (OD-D) and request the separate SHA-locked A2.0 execution approval (OD-H).

## 10. What this audit did not do

- It did not re-fetch provider documentation; pricing and limits rely on the A2-P verification of 2026-11-22.
- It did not run the A1 test suite on main (expected to fail at the characterization test, per F3) and did not run lint/build (no code changed).
- It did not inspect the gitignored PDF fixtures, the production DB or Vercel settings.
- It did not create any fixture, test or runner change.
