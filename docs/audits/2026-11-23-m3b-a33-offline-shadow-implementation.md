# M3-B A3.3 — fit-score-v1 offline shadow implementation

- **Date:** 2026-11-23
- **Branch:** `feat/m3b-a33-fit-score-shadow` (worktree `../cv-compare-tn-m3b-a33`), cut from `origin/main` `554a873`. Local commit only: nothing was pushed, no PR was opened, nothing was merged.
- **Mode:** offline. **0 live Gemini calls** (every test mocks `generateContent`). No deployment, no migration, no prompt or schema change, no flag set in any environment.
- **Supersedes** the earlier NO-GO status report that had this file name. That report was blocked only because PR-1 and PR-2 had not been merged. Both are merged now (§1).
- **Contract:** `docs/audits/2026-11-23-m3b-a32-scoring-contract.md` (A3.2). The brief approves the shadow-v1 policy values.
- **Verdict: PASS WITH KNOWN DEBT** (§7, §8).

## 1. Baseline verification

| Check | Evidence |
|---|---|
| Latest main | `git fetch` → `origin/main` = `554a873` (PR #101) on top of `fa5a4b9` (PR #100) |
| PR #100 merged | `gh pr view 100` → MERGED, `fa5a4b9fded5…` |
| PR #101 merged | `gh pr view 101` → MERGED, `554a873d3db8…` |
| Main CI | `554a873`: CI success, DB tests success, Benchmark freeze success. `fa5a4b9`: CI success |
| Production deployment | GitHub deployment `Production` for `554a873` → state `success` |
| Production scoring unchanged | PR #100 is docs-only and PR #101 is test/CI-only (0 production lines, as the PR-2 report shows). The production score path is therefore still R0 `canonical-en-v2`. No live call was made to re-check it |
| Isolated branch | new worktree from `origin/main`, so the dirty main checkout (`feat/p3a-interview-prep`) is untouched |

## 2. Files changed

| File | Change |
|---|---|
| `src/services/ai/fitScore.ts` (new) | Pure `fit-score-v1` module: `scoreFitV1`, `buildFitShadow`, `inspectRawTable`, the versioned alias table, and the two flag readers |
| `_server-lib/ai/analysisService.ts` | `inputMode` set in the existing branches. Shadow computed behind the flag after `matchScore` and `detailedComparison` exist, before localization, inside `try/catch`. Optional `fitShadow` in the return value, never inside `result` |
| `_server-lib/analyze/handler.ts` | `fitShadow` (when present) spread into the existing single `guard_metrics` insert |
| `_server-lib/ai/suggestionGuard.ts` | `GuardMetrics` analyze variant gains optional `fitShadow` (type only) |
| `src/__tests__/services/fitScore.test.ts` (new) | 37 unit tests: the contract table and the rules |
| `src/__tests__/services/fitShadowAnalyze.test.ts` (new) | 10 integration tests on the real handler with Gemini and Supabase mocked: flags, isolation, privacy |
| `scripts/m3b-a1/__tests__/fitScoreParity.test.ts` (new) | Parity with the frozen prototype: every fixture plus 2,000 random tables |
| `scripts/m3b-a1/a2Manifest.ts` | `src/services/ai/fitScore.ts` added to the frozen file list |
| `scripts/m3b-a1/A2_FIXTURES_MANIFEST.json` | Re-frozen (§6.2) |
| `.github/workflows/benchmark-freeze.yml` | `fitScore.ts` added to both path filters |
| `docs/11_guard_metrics.md` | `fitShadow` shape, reasons, privacy and retention note |
| `.env.example` | `FIT_SCORE_SHADOW=false`, `FIT_SCORE_AUTHORITY=false` (server-only) |

**Not changed:**
- `prompts.ts`, `responseSchema.ts`, `geminiClient.ts`, `scoreNormalization.ts`, `requirementVerification.ts`, `canonicalProbability.ts`;
- the quota and payment code;
- the recruiter service and UI sort code;
- `supabase/`, `api/`, `vercel.json`;
- the prototype `scoringRubric.ts`. `RUBRIC_FROZEN.json` and `A2_FROZEN.json` are unchanged.

## 3. Scoring implementation (`fit-score-v1`)

This is a port of the frozen prototype, restricted to what the A3.2 contract defines. It drops `jdText` grounding, `hard`, `findingsHash` and the per-category breakdown. It has no `node:crypto` and no I/O.

| Rule | Implementation |
|---|---|
| Weights / credit | required ×3, preferred ×1. Credit in halves: matched 2, partial 1, missing 0, unknown 0. Integer sums |
| Rounding | one half-up: `floor((200·num + den) / (2·den))`. Tested: 59.5→60, 79.5→80, ⅓→33, ⅔→67 |
| Range / bands | integer in [0,100]; bands from `derivePassProbability` (production 80/60 thresholds, reused rather than copied) |
| Validation order | shape → row validation → category/keywords → status → evidence → priority → key/alias → merge → arithmetic |
| Row cap | more than 100 input rows → `null`, `too_many_rows`. Never truncated; keyword rows count toward the cap |
| Empty / malformed | `no_scorable_rows` when the denominator is 0 (this includes keyword-only tables); `malformed_rows` for non-array input |
| Keywords | excluded from the score, counted in `keywordsExcluded`. An unknown category defaults to keywords |
| Status | anything outside the four statuses becomes `unknown` (`statusDefaulted`) |
| Evidence | `matched` gets full credit only when P0 `deriveItemVerification` returns `met`. Otherwise it becomes partial (`unverifiedMatchDowngraded`) |
| Skills-list-only evidence | full credit in v1, counted in `listOnlyEvidence` (OD-12) |
| Priority | `required` → required; `preferred` / `nice-to-have` → preferred; missing or invalid → required (`priorityDefaulted`) |
| Duplicates / aliases | NFC, lower-case, whitespace and punctuation key, then the versioned alias table; OR groups become an order-free set. Same key → one requirement: lower status wins, required wins. Counters: `duplicatesMerged`, `conflictingDuplicates`, `aliasMerged` |
| Experience | **no numeric penalty.** A years row is an ordinary row. The P0 same-metric shortfall (EN and VI) downgrades a false "matched" |
| Model numbers | `matchScore`, `categoryScores` and extra numbers on rows are ignored (tested) |
| Version | `FIT_SCORE_VERSION = 'fit-score-v1'`. The header says any rule change means `fit-score-v2`, and the file hash is now in the benchmark freeze |

**Malformed tables at the call site:** production normalization turns a broken model table into empty buckets. A normalized-only input would therefore always report `no_scorable_rows`. `inspectRawTable` checks the raw `parsedResult.detailedComparison` instead. It parses a JSON string the way the normalizer does. A missing table, a non-object, an array, or a bucket that is not an array all give `malformed_rows`. The same pass counts `schemaViolations`: raw statuses outside the schema enum, which production displays as `missing`.

## 4. Shadow integration

| Requirement | How it is met | Test |
|---|---|---|
| Two server flags, default off | `FIT_SCORE_SHADOW` is read at call time and is on only for `true` / `on`. Neither flag is a `VITE_*` variable | `flags` unit tests; integration tests "flags OFF" |
| Flag off = path not executed | the builder spy is never called; the `guard_metrics` keys are exactly `v`, `suggestionGuard`, `requirementVerification` | `fitShadowAnalyze` |
| Gemini score unchanged | the response is `toEqual` between on and off. `matchScore` stays 72, `scoreVersion` stays `canonical-en-v2`, `passProbability` is unchanged | `fitShadowAnalyze` |
| Stored results unchanged | the `analyzeCV().result` value (what `saveHistoryRow` and recruiter `commitAndSaveCandidate` persist) is identical on and off | `fitShadowAnalyze` |
| Recruiter sorting unchanged | no recruiter or sort file changed (`git diff --stat`). The candidate row receives the identical result | diff and the test above |
| No extra Gemini call | `generateContent` gets one call with identical arguments on and off (`abortSignal` excluded) | `fitShadowAnalyze` |
| Billing / quota unchanged | the same commit calls on and off. No quota or payment file changed | `fitShadowAnalyze` and the diff |
| Shadow failure isolated | a thrown builder still gives 200 and the same body, and the log gets `{v, eligible:false, reason:'error'}` with no message | `fitShadowAnalyze` |
| Authority non-operational | `fitScoreAuthorityEnabled()` returns `false` whatever the environment says. With both flags `true` the response equals the off response | unit test and `fitShadowAnalyze` |
| Canonical rows, before localization | computed before the `language === 'en'` return and before `localizeAnalysis` | `vi` test: `fitShadow` equals the `en` run, the body is equal on and off, Gemini gets 2 calls (analyze + localize) both times. Removing the `vi`-path spread fails it (mutation check) |

## 5. Metrics and privacy verification

- **Placement:** the `fitShadow` key goes inside the existing `guard_metrics` v1 object, in the same single `analysis_log` insert. This needs no extra write and no migration, because the column is already `jsonb`. The shape is exactly A3.2 §4.2.
- **Content:** a recursive check allows only numbers, booleans, `null`, and the enum strings for `v`, `reason`, `bandCanonical`, `bandShadow` and `inputMode`. The serialized object contains none of these synthetic values:
  - requirement names (SQL, Python, Tableau);
  - employers (Acme, Globex);
  - an email address, a phone number or a name;
  - the job title, the user id or the request key;
  - the thrown error's message.
- **Public API:** the response body has no `fitShadow` key and no `fit-score` string, whether the flag is on or off.
- **Other readers of `analysis_log`:**
  - **App code never selects `guard_metrics`.** `_server-lib/accountLock.ts:81-86` selects only `id` (a head count), and its document-cap filter reads only the `coverLetter`, `applicationReview` and `followUp` keys, so analyze rows are not affected.
  - **The admin report RPC** (`20261101170000_admin_report_stats.sql`) returns aggregates only.
  - **Direct row reads** go through RLS `is_admin()` (`20260703030000_admin_analysis_log.sql`). Admins can read `guard_metrics`, `fitShadow` included; no one else can.
- **Production logging is not enabled:** the flag defaults to off and is not set in any environment. **Retention and the privacy review stay open (OD-M2).** `analysis_log` has no retention job, and `fitShadow` would be a new kind of user-linked evaluation number in that table.

## 6. Tests and results

### 6.1 Commands (worktree, final tree)

| Command | Result |
|---|---|
| `npx vitest run src/__tests__/services/fitScore.test.ts` | 37 passed |
| `npx vitest run src/__tests__/services/fitShadowAnalyze.test.ts` | 10 passed |
| `npx vitest run scripts/m3b-a1/__tests__/fitScoreParity.test.ts scripts/m3b-a1/__tests__/isolation.test.ts` | 3 passed |
| `npm test` | 132 files passed, 8 skipped; **2054 passed**, 76 skipped |
| `npm run test:benchmark` (before the re-freeze) | **4 failed** (`a2Manifest`, 3 × `freezeCheck`): the tripwire fired as designed |
| `npm run test:benchmark` (after the re-freeze) | **15 files, 272 passed**, 1 skipped (by design) |
| `npm run lint` | exit 0 |
| `npm run lint:api` | exit 0 |
| `npm run build` | exit 0 |

**Mutation check:** temporarily setting the required weight to 2 made 6 tests fail (parity and the contract table). The change was reverted, and the file hash equals the frozen one.

**Coverage against the brief:**
- matched, partial and missing rows; unknown rows and malformed rows or tables;
- duplicates, conflicting duplicates, aliases and OR groups;
- ATS keyword exclusion; evidence downgrade; skills-list-only evidence;
- Vietnamese and English rows, plus VI shortfall and inference markers;
- experience shortfalls; empty, keyword-only and oversized tables (100 vs 101 rows);
- rounding boundaries and the range property (300 random tables); order independence;
- shadow failure isolation; flags off by default and the authority flag;
- no extra Gemini call; canonical score, result and history/candidate payload unchanged; privacy.

### 6.2 Benchmark freeze (re-frozen after review)

The only reviewed change to frozen inputs is `analysisService.ts`. `fitScore.ts` is new. The regenerated manifest (`computeManifest()` written verbatim, not hand-edited) differs from `554a873` in exactly two lines:

```
-    "_server-lib/ai/analysisService.ts": "bc9cb96d02c0…7f699",
+    "_server-lib/ai/analysisService.ts": "d48bfd18d753…44221",
+    "src/services/ai/fitScore.ts": "c6e2eade3e9c…542ae",
```

The following are **byte-identical**:
- `requestConfigHash` (`0892cba0…5a45`);
- `promptTemplateSha256`;
- `rubricVersion`;
- every `renderedRequestSha256` / `requestBytes` / `labelRubric` for all A2.0 and A2.1 fixtures;
- `A2_FROZEN.json` and `RUBRIC_FROZEN.json`.

The frozen Gemini request contract is therefore preserved: no prompt, schema, model or generation-config change.

## 7. Remaining risks

- **Real-world impact unknown.** All evidence is synthetic, and no saved production responses exist. A3.2 §6 expects:
  - all-partial CVs to score 50 (Low);
  - **under-experienced candidates to possibly score higher than today** (no numeric experience penalty; this is the largest accuracy risk);
  - inference-based matches to drop;
  - keyword-heavy JDs to rise.
- **Hedged evidence** ("may have", "có thể") is not caught in either language, so it still gets full matched credit. The same applies to list-only evidence, which keeps full credit by design (OD-12).
- **Alias coverage:** the table is EN tech names only, with no VI synonyms. Near-synonyms outside it ("React framework") still count twice.
- **`unknown` is almost unreachable:** normalized rows only carry matched, partial or missing. `schemaViolations` measures the raw cases instead.
- **No link from `analysis_log` to the result**, so disagreements can be inspected only on the owner's own test analyses (A3.2 §7).
- **The freeze job is non-required**, so a scoring PR could still merge with a red freeze. The live-run guard (`staleFreeze`) keeps that safe for spend.
- **Flag parsing:** only `true` and `on` enable the shadow. `1` / `TRUE` stay off (fail-safe, but worth knowing when setting the variable in Vercel).

## 8. Production readiness

The code is safe to merge with both flags off: the shadow path is not executed and `guard_metrics` keeps its pre-A3.3 shape. It is **not ready for a production shadow deploy** until:
- OD-M2 (retention window plus a privacy-policy check) is decided;
- the A3.4 shadow-deploy approval is given.

A Vercel env change needs a redeploy. The authority switch is not implemented: it needs A3.4 work and owner approval, including version-aware recruiter sorting before any flip (A3.2 §7).

## 9. Owner approvals needed

1. **Review this branch, then push it and open a PR** (owner action). Pushing creates a Vercel Preview build; the flags are off there too.
2. **Accept the re-freeze:** the `analysisService.ts` hash plus the new `fitScore.ts` entry (§6.2).
3. **OD-M2:** set the `fitShadow` retention window and check the privacy policy. Required before setting `FIT_SCORE_SHADOW=true` anywhere real.
4. **A3.4 shadow deploy:** a separate approval. It covers which environment, how long, and the OD-O1 minimum evidence.
5. **Authority flip** (later): OD-3 category scores, OD-17 fixture labels, OD-6 band wording, version-aware recruiter sort, and `scoreVersion` `fit-v1`.

**Verdict: PASS WITH KNOWN DEBT.** The implementation, isolation, privacy and freeze checks all pass offline. The debt is the open retention and privacy decision and the unmeasured real-world impact (§7). A3.4 was not started.

---

## Tóm tắt (tiếng Việt)

- **Đã làm:**
  - Thêm module `fit-score-v1` (`src/services/ai/fitScore.ts`). Module tính điểm 0–100 từ chính các dòng yêu cầu Gemini đã trả về: bắt buộc ×3, ưu tiên ×1; đạt 1, một phần ½, thiếu hoặc không rõ 0; làm tròn một lần.
  - Có gộp yêu cầu trùng và bảng đồng nghĩa, loại từ khoá ATS, và chỉ cho "đạt" trọn điểm khi CV có bằng chứng. Không trừ điểm kinh nghiệm theo công thức.
  - Bảng rỗng, bảng lỗi hoặc quá 100 dòng thì **không có điểm** và ghi rõ lý do.
- **Chạy ngầm sau cờ `FIT_SCORE_SHADOW`** (mặc định tắt):
  - Điểm Gemini, kết quả lưu, sắp xếp ứng viên, lượt dùng và thanh toán đều không đổi.
  - Không thêm lần gọi Gemini. Nếu phần tính ngầm bị lỗi thì phân tích vẫn thành công.
  - Cờ `FIT_SCORE_AUTHORITY` chưa có tác dụng.
- **Số liệu ghi ngầm** (`guard_metrics.fitShadow`) chỉ gồm số và giá trị enum: không có nội dung CV hay JD, tên yêu cầu, bằng chứng hay thông tin cá nhân. API công khai không trả về trường này.
- **Kiểm tra:**
  - Toàn bộ test (2054), benchmark (272), lint, lint:api và build đều đạt.
  - Đã đóng băng lại: chỉ đổi hash của `analysisService.ts` và thêm `fitScore.ts`. Hash request gửi Gemini giữ nguyên.
- **Việc cần anh/chị làm:**
  - duyệt rồi đẩy nhánh và mở PR;
  - chấp nhận lần đóng băng lại;
  - quyết định thời gian lưu dữ liệu ngầm (OD-M2) trước khi bật cờ ở môi trường thật;
  - duyệt riêng A3.4.
- **Kết luận: PASS WITH KNOWN DEBT.**
