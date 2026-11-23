# M3-B A3.1 — Deterministic scoring audit (offline)

- **Date:** 2026-11-23
- **Branch:** `audit/m3b-a31-deterministic-scoring` (worktree `../cv-compare-tn-m3b-a31`), cut from `f6450df` (the A2.2 tip, which is `5776735` plus harness files under `scripts/m3b-a1/` and docs only). Production code on this branch is byte-identical to `5776735`. Local commit only.
- **Mode:** offline audit. **0 Gemini calls**, no production change, no migration, no deploy, no paid infrastructure, no scoring/prompt/schema change, no PR. A2.0 not resumed.
- **Citation convention:** plain `path:line` = current code (identical to `5776735`). `A1@3fd9b74:` = the local, never-pushed branch `audit/m3b-a1-score-stability`. `scripts/m3b-a1/…` exists on this branch and on `audit/m3b-a22-runner-alignment`, **not on main**.
- **Verdict: READY WITH CONDITIONS** (§10). A3.2 (design + contract) can start now. The conditions gate calibration and release, not the design work.

---

## 1. Executive summary

1. **Gemini directly decides the final score.** The overall `matchScore` is one number the model writes. The prompt asks for it with **no aggregation formula** (`src/services/ai/prompts.ts:188`). The server only validates it and rounds it once (R0, `_server-lib/ai/analysisService.ts:225-227`). Requirement rows, category scores and explanations come from the same call but **never feed the number**.
2. **The pipeline after Gemini is already deterministic.** Since R0, the same raw response always gives the same score, band and stored row. This is proven offline: identical response ×20 → 1 distinct result, plus 29-case production/runner parity.
3. **Instability lives in the model step.** There is one empirical measurement: N=20 runs on one fixture, 2026-11-02, scores **75–88**, band flip in 15% (`docs/16_analyze_score_variance.md:49-59`). The request construction is code-equivalent to today's, but the Preview model may have changed. Today's magnitude is **unknown without a live benchmark**. That measurement also names semantic causes (status flips, 8–10 rows per run), not just numeric re-weighting.
4. **Recommended: a hybrid, shadow-first approach.** Keep the single Gemini call and its current extraction (`detailedComparison`). Compute a deterministic, documented rubric score from those rows on the server. First compute it **in shadow** (logged as numbers only, not shown). Make it the authority only after owner review, under a new `scoreVersion`. No prompt or schema change, **no extra Gemini call**, no infrastructure.
5. **Honest limit.** A rubric removes the model's holistic re-weighting. It does **not** remove semantic variance: status flips, row splits, required-vs-preferred calls. One required row moving matched→partial still moves the score by `150/Σw` points, which is enough to flip a band. With no saved provider responses, the share of the historical spread that the rubric would remove is **unknown**. Every rubric result so far is synthetic.

## 2. Current scoring architecture

### 2.1 Flow (current code)

```
CV + JD
 → handler: stripInvisibleControls(JD), size checks (413)             _server-lib/analyze/handler.ts:74, _server-lib/inputLimits.ts:21-29
 → analyzeCV
    prompt = buildAnalyzePromptEn({ jdSection, currentMonth })          analysisService.ts:94-98 (EN canonical for every UI language)
    parts  = prompt + CV text | PDF text (≥100 chars) | inline PDF | image (+ original PDF for text CVs)   :128-177
    Gemini = gemini-3-flash-preview, JSON schema, maxOutputTokens 16384, thinkingBudget 1024,
             no temperature/topP/seed                                    :184-194, geminiClient.ts:7,16
    gate   = blockReason → blocked; finishReason ≠ STOP → incomplete_response      :207-209
    parse  = JSON object or malformed_json                                          :211-221
    score  = normalizeMatchScore(model matchScore): number, finite, [0,100], round half-up once   :225-227; scoreNormalization.ts:22-28
    rows   = normalizeDetailedComparison → deriveRequirementVerification (metadata only)            :232-234
    band   = derivePassProbability(score): ≥80 High, ≥60 Medium, else Low   :270; canonicalProbability.ts:8-9,40-46
    categoryScores = model numbers, finite or 0, no clamp                   :275; resultPayloadNormalize.ts:27-35
    suggestions    = dropUnsupportedSuggestions (guard)                     :241-264
    scoreVersion   = canonical-en-v2                                        localizeAnalysis.ts:12
 → UI=vi: localizeAnalysis (2nd call, presentation strings only; scores immutable)   analysisService.ts:301-312; localizeAnalysis.ts:26-39
 → settle + persist: commitAndSaveCandidate (recruiter) | commitMonthlyQuota + saveHistoryRow (personal)   handler.ts:267-288; historyRow.ts:18
 → UI: gauge + band (AnalysisDetailsTab.tsx:82-108), History filter (HistoryView.tsx:56),
       sort by score (ComparisonOverview.tsx:22, ResultSwitcherStrip.tsx:13, recruiterService.ts:168 ORDER BY match_score),
       category chart from model categoryScores (categoryChartData.ts:21-36), recruiter table (CandidateTable.tsx:136-139)
```

### 2.2 Answers to the Task 1 questions

| Question | Answer | Evidence |
|---|---|---|
| Where is the overall score generated? | Inside the Gemini response (`matchScore`, schema type NUMBER) | `responseSchema.ts:22`; `prompts.ts:188` |
| Does Gemini directly determine the final score? | **Yes**, apart from R0 validation and one half-up rounding | `analysisService.ts:225-227` |
| How do skills/experience/requirements affect it? | Only through the model's own judgement. The prompt gives per-**category** bands (`prompts.ts:189-195`), a credit rule ("partial earns partial credit", `:195`) and an experience adjustment (`:196`), but no rule combining categories or rows into the overall number | `prompts.ts:188-196` |
| Are weights explicit? | **No** for the overall score. The 15-point category bands are explicit, but nothing weights them into the overall number. No numeric required/preferred weights exist | `prompts.ts:188-196` |
| Missing / ambiguous evidence | Prompt: three states matched/partial/missing (`:170-173`); "not shown ≠ lacks" (`:177`). Server: an invalid row status becomes `missing` (`resultPayloadNormalize.ts:88`); non-finite category score becomes 0 (`:29-35`); verification marks inference-based matches `unknown` without touching status or score (`requirementVerification.ts:86-106`) | — |
| Rounding / clamping / normalization | Overall: R0 rejects invalid values (no clamp) and rounds half-up once (`scoreNormalization.ts:22-28`). Band: clamps internally (`canonicalProbability.ts:40-46`). Category scores: **no clamp, no round** (`resultPayloadNormalize.ts:27-35`) | — |
| Language adjustments | No numeric adjustment. One English canonical prompt and English prose for every UI language (Stage 3.7; test `canonicalScoring.test.ts:112`). VI presentation is a separate call that cannot change scores (`localizeAnalysis.ts:58-80`). The language of the CV/JD content is handled only inside the model | — |
| Seniority adjustments | Prompt only: extract minimum years (`prompts.ts:187`), then adjust the **Experience category** score by −10–15 / −25–35 / cap 40 (`:196`). No server rule touches the overall score. P0 `compareMetric` detects shortfalls as verification metadata only (`requirementVerification.ts:69-89`) | — |
| What drives recommendations / explanations | `mainFactor`, `matchingPoints`, `missingGaps`, `rewriteSuggestions`, row `improvement` text — all model-written in the same call and **not** derived from the score. Rewrite suggestions are filtered by the deterministic guard (`suggestionGuard.ts`) | `analysisService.ts:229-287` |

## 3. Instability sources (classified)

Classes: **C** = confirmed by code or tests; **S** = supported hypothesis; **U** = unknown without a live benchmark.

| # | Source | Class | Evidence / reasoning |
|---|---|---|---|
| 1 | Gemini sampling variability | **S** (historical empirical evidence) / magnitude today **U** | `docs/16_analyze_score_variance.md:49-59`: N=20, one smoke fixture, 2026-11-02, one request hash, scores 75–88, SD 4.66, High/Medium flip 15%; control fixture range 4. Request construction since then: `prompts.ts`/`responseSchema.ts` last changed 2026-10-29, `geminiClient.ts` 2026-10-28, and the `generateContent` config block and part construction are textually identical to `9d57fa7` (diffed in this audit). The Preview model may have changed under the same ID. No sampling controls are set (`analysisService.ts:184-194`) |
| 2 | Prompt ambiguity | **C** | No formula for the overall score (`prompts.ts:188`); bands are 15 points wide (`:189-195`); the required/preferred fallback ("core … requirements") is model judgement (`:186`); "partial credit" has no numeric value (`:195`) |
| 3 | Inconsistent requirement interpretation | **S** / magnitude **U** | Doc 16: "reusable UI component libraries" matched vs partial across runs; rows split differently (8–10 per run). Plausible for any borderline row. No captured responses exist to quantify it |
| 4 | Skill matching and synonyms | **C** (no deterministic handling) / effect **U** | The prompt says "recognized variant name" (`prompts.ts:171`) and lists ATS variants (`:200`) with no fixed list; the server has no alias table. The prototype alias table exists only in `scripts/m3b-a1/scoringRubric.ts:59+` |
| 5 | Experience calculation | **C** (model-only) | The model estimates years from timelines and `currentMonth` (`prompts.ts:166`, `:196`); the penalty applies to a **category** score that does not feed the overall number by any rule. The P0 shortfall check is metadata only |
| 6 | Language adjustments | **C** for UI language (none; request identical for en/vi, `canonicalScoring.test.ts:112-138`) / **U** for CV/JD language mix | Effect of EN JD + VI CV etc. on the model's judgement is unmeasured |
| 7 | Score normalization | **C**: deterministic, not a source of variance | R0 tests (`scoreNormalization.test.ts`, 38 cases; `m3bR0InvalidOutput.test.ts`, 50). It *amplifies* boundary noise: 59.5→60 changes Low→Medium (by design, documented) |
| 8 | Missing evidence handling | **C** | Invalid status → `missing`, i.e. absence (`resultPayloadNormalize.ts:88`), not `unknown`; non-finite category score → 0 (`:29-35`). Neither affects the overall number directly |
| 9 | Conflicting scoring rules | **C** | (a) The ATS rule puts a semantically matched but literally absent keyword into `missingGaps` (`prompts.ts:203`) while the semantic row says matched; (b) the `keywords` bucket (`:222`) duplicates other rows as literal strings; (c) the experience cap (`:196`) and the category bands conflict whenever both apply; (d) per-category bands vs an unconstrained overall number. A1 measured (synthetic) that a conflicting keyword row drops a row-based score 90→76 if not excluded (`A1@3fd9b74:docs/audits/2026-11-22-m3b-a1-scoring-architecture.md` §2.2) |
| 10 | Different output structures for equivalent inputs | **S** (doc 16: 8–10 rows per run) / magnitude **U** | Also **C** for modality: the same CV as text, extracted PDF text, inline PDF, or text + attached PDF gives a different request (`analysisService.ts:130-177`) |

Not a source (confirmed): post-model processing (same response ×20 → 1 result, `scripts/m3b-a1/__tests__/currentPipelineCharacterization.test.ts`); UI language (`canonicalScoring.test.ts:112`); no `Math.random` in the scoring path.

## 4. Scoring logic and weight analysis

- **Today: no weights exist for the overall score.** The only numeric scoring guidance is per category (6 bands, 15–20 points wide) plus the experience penalty. How the model blends 8 categories, of which 4 (`softSkills`, `hardSkills`, `technicalSkills`, `languageSkills`) have no evidence-row bucket, into one number is implicit. So the score cannot be explained from the visible rows. A1 characterization: every required row matched while the model said 41 → accepted.
- **Prototype rubric (`scripts/m3b-a1/scoringRubric.ts`, `rubric-proto-v1-candidate`, not in production):**
  - Weights: required 3, preferred 1 (`:50`).
  - Credit: matched 1, partial ½, missing 0, unknown 0 (`:52`).
  - Score: `round-half-up(100·Σ w·credit / Σ w)` over de-duplicated requirements, independent of category.
  - Literal-ATS `keywords` rows excluded (`:24-25`, OD-10 accepted).
  - Matched without usable evidence downgraded to partial.
  - Bands: ≥80 / ≥60 (`:54-55`), same as production.
  - The weights are **uncalibrated**.
- **Sensitivity of any row-based rubric** (exact): with total weight `Σw`, one required row going matched→partial moves the score by `150/Σw`, and matched→missing by `300/Σw`. A preferred row moves it by a third of that.

| Required rows (no preferred) | Σw | matched→partial | matched→missing |
|---|---|---|---|
| 4 | 12 | 12.5 | 25 |
| 8 | 24 | 6.25 | 12.5 |
| 12 | 36 | 4.2 | 8.3 |

  So with few requirements, a single semantic flip still crosses a band.

## 5. Deterministic scoring options

| Criterion | **Current: AI-driven** (model writes the number) | **Hybrid: AI extraction + deterministic rubric** | **Fully deterministic** (no AI judgement; string/keyword matching) |
|---|---|---|---|
| Accuracy | Holistic; can weigh depth, domain and seniority nuance; unexplainable; contradicts its own rows (41 with all required matched) | Inherits the model's semantic row judgement; the formula is explicit. Can miss nuance the model weighed (domain depth, seniority) unless rows capture it. **Not automatically more accurate** — needs labelled calibration | Weak: no semantic matching (synonyms, VI/EN mixes, paraphrased experience, OR groups); keyword stuffing is easy |
| Stability | Numeric + semantic variance (historical 75–88) | Numeric re-weighting removed; **semantic variance remains** (§4 formula); exact replay → identical score | Perfectly stable for identical text; changes with any wording change |
| Explainability | Low | High: score = visible rows × documented weights | High but shallow |
| VI + EN support | Model handles both | Model handles both; deterministic layer must preserve diacritics (NFC) and needs VI aliases | Poor: needs bilingual dictionaries and tokenization |
| Complexity | none | Medium: one pure module + tests (prototype exists, 58 tests) | High to do well (parsing, taxonomy, dictionaries) |
| Latency | — | negligible (pure CPU, no I/O) | negligible to low |
| Gemini cost | 1 call (+1 for vi) | **unchanged** (same single call, same rows) | 0 calls for scoring, but extraction for the rest of the report still needs the call |
| Migration risk | — | New `scoreVersion`; scores shift for new analyses; mixed-version sorting; explanation consistency | Very high: product behaviour changes; loses semantic quality |

## 6. Recommended approach

**Hybrid, shadow-first, minimal change.**

1. **No prompt or schema change, no extra call.** Score from the `detailedComparison` rows the model already returns (normalized), using a documented rubric ported from the prototype.
2. **A3.3, offline:** a pure, versioned production module (e.g. `src/services/ai/fitScore.ts`). It needs a new name, because `isolation.test.ts` fails any production file that mentions `m3b-a1` or `scoringRubric`. Golden fixtures, property tests and a findings hash. Called in `analyzeCV` in **shadow mode only**: the user-visible result stays byte-identical, and the shadow score, counts and `findingsHash` go to the existing `analysis_log.guard_metrics` JSONB as numbers only (no migration; already written on success at `handler.ts:289`).
3. **A3.4, controlled:**
   - Deploy shadow (a production change needing its own approval; no Gemini calls are added).
   - Collect model-vs-rubric agreement and the score distribution on real traffic.
   - The owner reviews.
   - Only then flip authority behind a server flag, with a new `scoreVersion` (e.g. `rubric-v1`). Old rows stay immutable, with no rescoring.
4. **Before the flip (prerequisites):**
   - Decide category scores (OD-3), because the chart (`categoryChartData.ts:36`) would otherwise show model numbers beside a rubric total.
   - Decide explanation consistency (§8).
   - Restrict score-based sorting to one `scoreVersion` (`ComparisonOverview.tsx:22`, `ResultSwitcherStrip.tsx:13`, `recruiterService.ts:168`).
5. **What the shadow phase can and cannot show:**
   - It **can** show agreement between model and rubric (bands, mean difference) and the real distribution.
   - It **cannot** show run-to-run stability: each user analysis runs once. Stability evidence would still need A2.0 (deferred) or owner-run repeated analyses.

### 6.1 Changes that alter user scores (each needs separate owner approval)

| Change | Who is affected |
|---|---|
| Rubric becomes the score authority (A3.4 flip) | every new analysis |
| Keywords excluded from the score (OD-10, accepted, takes effect only at the flip) | analyses with many literal-ATS rows |
| Experience-years penalty dropped (OD-5) | under-experienced candidates (scores may rise) |
| Credit for `unknown` rows (OD-2) | analyses with unreadable or ambiguous rows |
| Matched-without-usable-evidence → partial | analyses with inference-based matches (scores fall) |
| Weights 3:1 (OD-8) | all |
| Category scores derived from rows (OD-3) | category chart, recruiter panel, Excel |
| Mixed-version sorting in recruiter `ORDER BY match_score` | recruiter campaigns spanning the flip |

**Do not alter scores:** shadow computation, tests, docs, the A2.2 harness. **Changes copy only:** renaming the "probability" band label to a fit-level label (OD-6).

## 7. Expected impact on accuracy and stability

- **Stability:**
  - For a fixed set of rows: exactly reproducible (proven offline in the prototype: same findings ×200 → 1 output; permutations and bucket reassignment → same score).
  - For live repeats: residual semantic variance bounded per row by §4. Real reduction vs the historical 75–88 is **unknown**: there are no saved provider responses, and the A1 "rubric 90/83 vs model 75–88" result is a synthetic reconstruction, not a replay.
- **Accuracy:** **unknown** until owner-signed labels (OD-17) exist. Risks:
  - The rubric compresses or shifts the distribution (draft label scores already reach 100 where the model historically gave 88).
  - The rubric ignores nuance that is not expressed as a row.
  - Partial = ½ is arbitrary.
- **Explainability:** strongly better: the score is reconstructible from visible rows.
- **Cost / latency:** unchanged (0 extra calls; negligible CPU).

## 8. Risks and trade-offs

| Risk | Mitigation |
|---|---|
| Explanation contradicts the score (model `mainFactor`/`matchingPoints` "strong fit" beside a rubric 58) | Consistency test in A3.3 (band vs required-missing count, gap list vs missing rows); a decision on whether model prose may state overall fit; a prerequisite for the flip |
| Category chart inconsistent with the total | OD-3 before the flip |
| Weights uncalibrated | Shadow distribution + labelled fixtures (OD-17); no flip without owner sign-off |
| Semantic flips still change bands | Communicate as a fit level; consider showing a tie band for near-equal scores in sorts |
| Mixed score versions in sorting / recruiter lists | Version-aware sorting before the flip |
| A2.2 freeze tripwire: the manifest hashes `analysisService.ts`, so any shadow change fails `a2Manifest`/`rubricFreeze` tests | Re-freeze in the same change, or apply the A2.2 CI-coupling decision first; decide which branch A3.3 starts from (main does not have the harness) |
| Evidence stuffing (one skills line satisfies several AND rows) | Not resisted by the rubric (prototype limitation test); later evidence-span rules |
| Privacy of shadow telemetry | Numbers, counts and hash only; never row text (existing `guard_metrics` policy) |

## 9. A3.2–A3.4 implementation plan

### A3.2 — Design and scoring contract (docs + owner decisions)

- **Scope:**
  - Written contract `fit-score v1`: inputs (normalized rows), identity and duplicate rules, OR groups, credit table, weights, `unknown` policy, keywords exclusion, evidence downgrade, experience handling, bands and labels, `null` on no valid rows.
  - VI alias policy (diacritics preserved; initial VI/EN alias list).
  - Shadow telemetry shape.
  - Consistency rules for explanations and categories.
  - Version-aware sorting rule.
  - Golden-fixture plan with owner labels.
- **Files:** `docs/` only (a new contract doc). Optionally the label sheet for the existing A2/A2.1 fixtures.
- **Risk:** low (no code).
- **Acceptance:** owner signs OD-2, OD-3, OD-5, OD-8, OD-12, the alias policy, the shadow telemetry shape, and the consistency rule. The contract has a worked example per rule.
- **Rollback:** n/a (docs).

### A3.3 — Offline implementation and regression tests

- **Scope:**
  - Pure module `src/services/ai/fitScore.ts` (ported from the prototype, renamed).
  - Shadow call in `analyzeCV` writing numbers to `guard_metrics`.
  - Tests:
    - identical rows → identical score/hash
    - permutation/bucket invariance
    - equivalent skill names (EN + VI aliases)
    - missing/partial/unknown
    - experience boundary rows
    - language combinations (EN/EN, EN/VI, VI/VI, VI/EN) on saved synthetic responses
    - invalid/incomplete output (existing R0 path untouched)
    - integer range [0,100] and half-up rounding
    - score-vs-explanation consistency
    - **user-visible result byte-identical to today** (shadow only)
    - request hash unchanged
- **Files likely to change:**
  - new `src/services/ai/fitScore.ts`
  - `_server-lib/ai/analysisService.ts` (shadow compute)
  - `_server-lib/ai/suggestionGuard.ts` (`GuardMetrics` type)
  - `_server-lib/analyze/handler.ts` (pass metrics)
  - new tests under `src/__tests__/services/`
  - A2.2 manifest re-freeze if the harness is on the base branch
- **Risk:** low–medium (touches the analyze path, but no output change).
- **Acceptance:**
  - All tests, `lint`, `lint:api` and `build` are green.
  - A response-parity test shows the API body is identical with and without shadow.
  - Zero Gemini calls.
  - Guard metrics contain no text.
- **Rollback:** revert the commit; nothing is deployed.

### A3.4 — Controlled release (each step separately approved)

1. **Shadow deploy** (production change, owner approval). Adds no Gemini calls; only numbers are logged. **Rollback:** revert or redeploy the previous deployment.
2. **Observation window** (owner-defined N analyses). An owner-run read-only SQL report: model-vs-rubric band agreement, mean/median difference, distribution, rows per analysis.
3. **Authority flip** (owner approval) behind a server flag:
   - new `scoreVersion` `rubric-v1`;
   - category and explanation decisions applied;
   - version-aware sorting;
   - UI label (OD-6);
   - old rows untouched.
   **Rollback:** flag off. Rows written as `rubric-v1` keep their version and score; no backfill in either direction.

**Acceptance for the flip:**
- The owner accepts the agreement report and the label calibration (OD-17).
- No contradictory explanation copy remains.
- The recruiter sort is version-aware.

## 10. Owner decisions required

| ID | Decision | Blocks |
|---|---|---|
| OD-2 | Credit for `unknown` rows (0 in the denominator recommended) | A3.2 contract |
| OD-3 | Category scores after the flip: derived from rows (5 buckets) or keep model numbers | A3.2 contract; flip |
| OD-5 | Experience penalty: drop it (rely on row status + P0 shortfall) or port it as a row rule | A3.2 contract (alters scores) |
| OD-8 | Weights (3:1 proposed, uncalibrated) | A3.2 contract (alters scores) |
| OD-12 | List-only evidence credit: full or partial | A3.2 contract |
| OD-A3-1 | Approve the shadow telemetry shape (numbers, counts and hash in `guard_metrics`; no text) | A3.3 |
| OD-A3-2 | Which base branch A3.3 starts from, and the A2.2 freeze CI-coupling choice | A3.3 |
| OD-17 | Sign the fixture labels (calibration reference) | A3.4 flip |
| OD-A3-3 | Shadow deploy approval and observation-window size | A3.4 step 1–2 |
| OD-A3-4 | Authority flip approval (new `scoreVersion`) | A3.4 step 3 |
| OD-6 | Band label wording (copy only) | A3.4 step 3 |

Already accepted: OD-7 (keep current sorting as known debt; no new score-based ranking before A3), OD-10 (keywords excluded from the score).

**Verdict: READY WITH CONDITIONS.** A3.2 can start immediately. OD-2/3/5/8/12 are decided *inside* A3.2. The conditions are:
1. The OD-A3-1/2 decisions before A3.3.
2. OD-17 labels and an owner-reviewed shadow report before any authority flip.
3. Explicit acceptance that run-to-run stability stays **unmeasured** while A2.0 is deferred.

### Test evidence used in this audit (offline, run on this branch)

`npx vitest run` over `scoreNormalization` (38), `canonicalProbability` (24), `canonicalScoring` (27), `requirementVerification` (22), `resultPayloadNormalize` (23), `m3bR0InvalidOutput` (50), `canonicalProbabilityContract` (10), and harness `scoringRubric` (58), `currentPipelineCharacterization` (15), `responseParity` (31): **10 files, 298 passed, 0 failed.** These cover normalization, range and rounding, invalid/incomplete output, UI-language invariance, verification and the prototype rubric. **Missing** (A3.3): a production deterministic score, production alias handling, score-vs-explanation consistency, CV/JD language-combination fixtures, experience-boundary scoring (today only verification metadata), and saved real responses (none exist).

---

## Tóm tắt cho chủ dự án (tiếng Việt)

- **Hiện trạng:** Điểm phù hợp cuối cùng do Gemini tự viết ra thành một con số. Prompt không có công thức tính tổng, và server chỉ kiểm tra hợp lệ rồi làm tròn một lần (R0). Các dòng yêu cầu, điểm thành phần và phần giải thích được tạo cùng lượt nhưng **không** dùng để tính điểm.
- **Nguồn dao động:** Phần xử lý sau Gemini đã ổn định hoàn toàn. Cùng một phản hồi luôn cho cùng một kết quả. Dao động nằm ở bước mô hình. Lần đo duy nhất (02/11/2026, 20 lần, 1 bộ dữ liệu) cho điểm 75–88. Mức dao động hiện nay **chưa biết** nếu không chạy benchmark thật.
- **Đề xuất:** Giữ nguyên một lần gọi Gemini, không đổi prompt hay schema. Server tính điểm theo công thức minh bạch từ các dòng yêu cầu mà mô hình đã trả về: bắt buộc ×3, ưu tiên ×1; đạt 1, một phần ½, thiếu 0. Bước đầu chỉ chạy **ngầm (shadow)**: ghi số liệu để so sánh, người dùng không thấy gì thay đổi. Chỉ chuyển sang điểm mới khi anh/chị duyệt, với phiên bản điểm mới, và không tính lại điểm cũ.
- **Giới hạn cần biết:** Công thức loại bỏ việc mô hình "tự cân nhắc" con số, nhưng **không** loại bỏ việc mô hình đánh giá khác nhau giữa các lần chạy. Ví dụ, một yêu cầu bắt buộc chuyển từ "đạt" sang "một phần" vẫn làm điểm đổi vài điểm, đôi khi đổi cả mức. Độ chính xác của công thức chưa được kiểm chứng; cần bộ nhãn do anh/chị duyệt.
- **Chi phí:** Không thêm lần gọi Gemini, không thêm hạ tầng.
- **Kết luận:** **READY WITH CONDITIONS.** Có thể bắt đầu A3.2 (thiết kế và hợp đồng chấm điểm) ngay. Các quyết định về trọng số, kinh nghiệm, `unknown` và điểm thành phần được chốt trong A3.2. Việc triển khai ngầm và chuyển sang điểm mới cần anh/chị duyệt riêng từng bước.
