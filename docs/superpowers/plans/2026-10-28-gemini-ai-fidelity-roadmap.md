# Gemini AI fidelity — roadmap

Ngày lập: 2026-10-28. Cập nhật: 2026-10-29 (Stage 3.14A — DEPLOYED / VERIFIED).
Production hiện tại: `main` @ `1a96faa` (PR #20 đã merge; deploy success ngày 2026-10-29). Commit Stage 3.14A: `40bf6b9`; audit Parsed CV: `eb7a283`. Trước đó: PR #19 (Stage 3.13C) merge `200d3bf`; PR #18 (Stage 3.12B) merge `0fd9f6c`; PR #17 (3.11B) merge `ade22f2`; PR #16 (3.10B) merge `b974e92`. Migration `20261031000000_probability_version.sql` đã apply + verify; `20261030000000_score_version.sql` có schema từ trước nhưng migration history còn drift (xem debt 3.13).

## Trạng thái đã ship

| PR | Stage | Nội dung |
|---|---|---|
| #6 | — | Routing per-workload (analyze/rewrite → `gemini-3-flash-preview`, parse_cv → `gemini-3.5-flash-lite`), log `model` + `latency_ms`, pricing theo model, hardening prompt rewrite_cv |
| #7 | — | Hardening prompt analyze (CV = nguồn sự thật duy nhất), explicit > derived, guard numeric + Skills, chuẩn hoá tháng tiếng Anh, contact preamble Premium CV |
| #8 | 3.2 | Chống khái niệm JD-only (prompt), raw-JD narrow guard; guard theo analysis đã TẮT vì false positive ("Nội", "Observability") |
| #9 | 3.3 — CLOSED | Full CV factual guard: validate → 1 retry không có raw JD → fallback rỗng (`fidelityFallback`); zero-pad `05 ↔ 5` coi như bằng nhau |
| #10 | 3.4 — CLOSED | `analysis_log.guard_metrics` jsonb v1 (suggestion drops, Full CV validation/retry/fallback/skip, geminiCalls); console production không còn section/concept/matchedForm/số |
| — | 3.6 / 3.6b — CLOSED (audit) | MatchScore do Gemini sinh trực tiếp; ngôn ngữ UI đổi cả prompt chấm → lệch 4–10 điểm trên cùng CV/JD; cả ngôn ngữ instruction lẫn ngôn ngữ output đều đổi calibration (bằng chứng/phân loại gần như giữ nguyên). Replay tất định 360/360. Không đổi code |
| #12 | 3.7 — CLOSED (production verified) | Chấm điểm canonical: luôn prompt EN + prose EN cho mọi UI → `scoreVersion = canonical-en-v1`; UI tiếng Việt thêm 1 lượt dịch hẹp (chỉ chuỗi trình bày, theo id, kiểm số liệu, cùng model, dùng chung deadline AI ≥15s / cap 20s, fallback EN `presentationLanguage = en`). `history.score_version`, `candidate_cvs.score_version`; history cũ NULL = legacy |
| #13 | 3.8 — CLOSED (deployed) | 3.8A audit: parse-cv `relevant_score` = judge CV↔JD thứ hai (model `gemini-3.5-flash-lite`, prompt theo ngôn ngữ UI), chỉ dùng hiển thị → Option A. 3.8B: bỏ `relevant_score` khỏi prompt/`PARSED_CV_SCHEMA` + UI `ParsedCVTab` (%, thanh, badge lệch điểm, `computeScoreDiscrepancy`); field chỉ còn optional cho `history.parsed_cv` legacy, không migration, không score version mới. Pattern `useMemo` sau early return đã gỡ (crash hooks nghi ngờ không tái hiện trên React 19) |
| #14 | 3.9 — CLOSED (deployed) | 3.9A audit (20 call live, ~$0.07): `key_match_highlights`/`missing_keywords` của parse-cv là judge CV↔JD thứ hai — membership lệch theo UI, output không thật sự localize, mâu thuẫn canonical (BigQuery/Redshift "thiếu" dù yêu cầu OR đã khớp qua Snowflake) → Option C. 3.9B: bỏ 2 field khỏi prompt/`PARSED_CV_SCHEMA`; `ParsedCVTab` suy ra qua `deriveParsedCvInsights()` từ `detailedComparison` canonical (matched → điểm khớp, required trước, tối đa 3; chỉ `missing` → "Yêu cầu còn thiếu / Missing requirements", `partial` không tính); canonical không bao giờ trộn legacy; history cũ fallback mảng legacy. Không thêm call Gemini, không migration |
| [#16](https://github.com/nghiepnguyen/CVCompareTN/pull/16) | 3.10B — CLOSED (merged & deployed) | Option B: `/api/parse-cv` chỉ nhận CV để Gemini trích xuất/cấu trúc; bỏ JD khỏi application payload, handler, service và prompt VI/EN. Extra `jd` từ caller cũ bị bỏ qua, không thể đi vào Gemini parse request. Giữ nguyên response schema, `ats_evaluation.years_of_experience` fallback/override và canonical authority Stage 3.8/3.9. Không migration, không thêm call Gemini |
| [#17](https://github.com/nghiepnguyen/CVCompareTN/pull/17) | 3.11B — CLOSED (merged & deployed) | Evidence-aware experience authority: COMPLETE + source-backed timeline mới override model; PARTIAL/UNAVAILABLE giữ Gemini hợp lệ; invalid → trusted subtotal → 0; model-zero conflict; future-only loại, future end cap tại ICT `asOf`; year-only không đủ precision; `is_current` chỉ boolean true. History `mode` giữ snapshot, không tăng theo thời gian. Không schema/migration/AI call; parse-cv vẫn CV-only |
| [#18](https://github.com/nghiepnguyen/CVCompareTN/pull/18) | 3.12B — CLOSED (merged & deployed) | 3.12A audit: production chỉ có 1 call CV↔JD nhưng một completion sinh nhiều representation độc lập; `detailedComparison` split OR thành alternative missing (BigQuery/Bahasa) và `matchingPoints`/`missingGaps` tự diễn giải lại, lọt non-JD gap; 6 fixture audit ~$0.044 gồm smoke. 3.12B benchmark 6 fixture + 1 AND probe ~$0.043. 3.12B: `detailedComparison` là requirement-status authority duy nhất; prompt EN step 9 thêm logical OR grouping (một row, matched nếu bất kỳ alternative có evidence; AND giữ separate); `deriveRequirementInsights()` dùng chung cho Analysis/Parsed/Recruiter/Excel; partial tách riêng, không thành missing; `matchingPoints`/`missingGaps` giữ compatibility nhưng non-authoritative, legacy fallback khi không có DC. Không schema/migration/AI call/score change |
| [#19](https://github.com/nghiepnguyen/CVCompareTN/pull/19) | 3.13A–C — CLOSED (merged & deployed) | 3.13A audit: `CASE B — DUPLICATE SEMANTIC AUTHORITY`, 12 call synthetic, 3/12 lệch. 3.13B: freeze `CONTRACT A — SCORE ONLY` (`>=80 High`, `>=60 Medium`, else `Low`), version `canonical-score-v1`; loại cap required-gap và weighted recomputation bằng simulation. 3.13C: server derive từ `matchScore`, bỏ model authorship khỏi prompt/schema, `successProbability` chỉ là mirror, resolver canonical/legacy/unknown-version, migrate 5 consumer, align threshold `>=80/60`, migration `probability_version` + RPC. Production: new analysis 88 → High; history/legacy/recruiter RPC verified; Excel chưa click tay (automated resolver test) |
| [#20](https://github.com/nghiepnguyen/CVCompareTN/pull/20) | 3.14A — DEPLOYED / VERIFIED | Audit `eb7a283`: request waterfall — parse chỉ start sau analysis (và sau cả batch) dù parse-cv CV-only. 3.14A: parse start ngay khi CV-ready, chạy song song analyze; parse-first attach trực tiếp, analysis-first patch theo result id; parse limiter 5; parse failure isolated; `parsed_cv` persist sau history upsert. Browser production: parse start 111266.1ms, analyze start 111266.3ms; parse xong 114789.6ms, analyze xong 119303.8ms; first open 51.5ms, second 0.3ms, reload/history reopen không parse lại. Không đổi parser/PDF/R2/telemetry/rewrite |
| #11 | 3.5 — CLOSED | Request deadline 65s dùng chung (AI 59s + 6s dự phòng), storage hủy thật ≤15s/ref, Gemini abort thật, quota/telemetry bị giới hạn, error row phân loại cho analyze/rewrite/parse, client 75s, `maxDuration` 300s (chỉ là trần an toàn) |

Guard production:

```
rewriteSuggestions (analyze):
  numeric guard: ON
  Skills/Kỹ năng guard: ON
  raw-JD narrow guard: ON
  analysis-derived lexical guard: OFF

fullRewrittenCV (rewrite):
  numeric + raw-JD validation: ON (bỏ qua với PDF scan / ảnh)
  retry: 1 lần, không raw JD, khi deadline AI còn ≥ 20s
  fallback: fullRewrittenCV '' + fidelityFallback, không lưu history
```

MatchScore production (Stage 3.7):

```
scoring: canonical EN judge, request identical for UI en/vi
VI presentation: narrow localization (presentation strings only), fallback EN
scoreVersion: canonical-en-v1 (NULL = legacy, never rescored)
score authority: matchScore là điểm CV↔JD duy nhất (Stage 3.8);
  parse-cv relevant_score: không generate/hiển thị/so sánh — chỉ còn trong history.parsed_cv legacy
```

Probability production (Stage 3.13C):

```
score authority: matchScore (Stage 3.7)
probability: passProbability = band(matchScore)  [>=80 High, >=60 Medium, else Low]
             probabilityVersion = canonical-score-v1
             successProbability = compatibility mirror only (deprecated)
             passExplanation = '' cho canonical rows; legacy giữ prose cũ
legacy rows: probability_version NULL -> không rescore/recompute; hiển thị theo surface cũ
```

Boundary production (Stage 3.14A):

```
CV ready           → analyze + parse-cv chạy song song (parse CV-only, không chờ JD/analysis)
                   → parsedCV attach theo result id; parsed_cv persist sau history upsert
CV                 → parse-cv → Gemini CV-only extraction / structuring / presentation data
CV + JD            → canonical analyze → matchScore + categoryScores + detailedComparison
detailedComparison → requirement-status authority duy nhất
                     OR/alternative = một logical requirement (matched nếu bất kỳ alternative có evidence)
                     AND = các requirement riêng, không suy ra lẫn nhau
                     → deriveRequirementInsights() → Analysis / Parsed CV / Recruiter / Excel
                     (partial tách riêng, không bao giờ thành missing)
matchingPoints     → compatibility/narrative; KHÔNG authoritative trên canonical result
missingGaps        → compatibility/legacy fallback khi không có detailedComparison
Legacy fields      → relevant_score / key_match_highlights / missing_keywords: history fallback only
rewrite            → generative transformation only; không score/classification, không feed ngược Analyze
probability        → downstream của matchScore; không feed ngược score/requirement/rewrite
JD                 → không đi vào Gemini parse request (extra jd từ caller cũ bị bỏ qua)
```

Timing production:

```
AI deadline           ~59s
server deadline        65s
client timeout         75s
Vercel maxDuration    300s (safety ceiling, không phải ngân sách request)
```

Benchmark: `scripts/benchmark-gemini-analyze.ts`, `scripts/benchmark-gemini-parse-rewrite.ts` (fixtures tổng hợp, không PII; rewrite benchmark có số liệu Full CV guard).
Telemetry: `docs/11_guard_metrics.md` (SQL mẫu). Deadline: `_server-lib/deadline.ts`, `docs/5_api.md`. Canonical scoring: `docs/12_canonical_scoring.md`.

## Stage 3.10 — CLOSED (merged & deployed)

- **3.10A — audit hoàn tất, đã duyệt:** mọi output parse hiện tại đều tạo được từ CV, không cần JD → Option B. 18 call live trên fixture tổng hợp VI/EN/VI đầy đủ, ~$0.044 theo pricing trong repo; không quan sát thấy JD-only contamination, còn dao động taxonomy/wording và một lần hỏng extraction. Không sửa production.
- **3.10B — MERGED & DEPLOYED ✅:** [PR #16](https://github.com/nghiepnguyen/CVCompareTN/pull/16), commit `2a54cc1` → merge `b974e92`, chốt ngày 2026-10-29. Bỏ JD khỏi `generateParsedCVForResult` → `parseCV` → shared handler → `generateParsedCV` → prompt VI/EN. Prompt có contract riêng chỉ nhận language; extra `jd` từ caller cũ được bỏ qua. Giữ Gemini cho structured extraction, schema, model, deadline, telemetry và Stage 3.8/3.9 canonical authority. Test mocked Gemini request chứng minh absent/real/unrelated JD không đổi input; loại bỏ nguồn coupling/contamination từ JD trong parse.
- **Verification trước commit:** targeted 162 PASS; lint PASS; lint:api PASS; full Vitest 430 PASS / 33 files; production build PASS; `git diff --check` PASS. Không gọi thêm Gemini ở 3.10B.
- **Scope commit:** đúng 15 file implementation/docs/tests; `scripts/verify-r2-flow.ts`, R2/Graphify/Graft/local tooling debt nằm ngoài commit.
- **Deferred:** giữ `ats_evaluation.years_of_experience` nguyên vị trí/semantics: Gemini fallback khi không có khoảng thời gian hợp lệ; deterministic merged-range override khi có. Không migration; chưa sửa taxonomy, extraction variability/corruption hay redesign parser.

## Stage 3.11 — authority kinh nghiệm (merged & deployed)

- **3.11A — audit hoàn tất, đã duyệt:** Option E — evidence-aware hybrid. 36 fixture tất định + 10 call live (~$0.0075 theo pricing repo) chứng minh subtotal 4 năm ghi đè model 9 năm trên timeline partial; model cũng có thể sinh calendar dates không có trong CV. History current-role 6.8 → 7.3 khi mở lại từ 10/2026 sang 04/2027. Field chỉ display/persistence, không chấm điểm.
- **3.11B — MERGED & DEPLOYED ✅:** [PR #17](https://github.com/nghiepnguyen/CVCompareTN/pull/17), commit `9ae7b1f` → merge `ade22f2`, chốt ngày 2026-10-29. Inspection raw entries → source-backed union → explicit selector; COMPLETE + source-supported mới override model, PARTIAL/UNAVAILABLE giữ estimate hợp lệ, invalid → trusted subtotal → 0; xử lý model-zero conflict. Evidence check bảo thủ trên một dòng có company/title ngay trước date pair; multiline/scan/image không xác minh được → unknown. Future-only bỏ, future end cap tại ICT `asOf`, year-only không đủ precision COMPLETE, `is_current` chỉ nhận boolean true. History mode giữ selected snapshot. Giữ schema/ATS wrapper/CV-only/canonical authority; không migration hay thêm AI call.
- **Verification trước commit:** targeted 181 PASS; lint PASS; lint:api PASS; full Vitest 485 PASS / 35 files; production build PASS; `git diff --check` PASS. Commit 13 file (+421/−102).
- **Deferred:** ATS wrapper naming; role-local provenance cho layout nhiều dòng/OCR; conflict summary/timeline; taxonomy và general Gemini extraction variability. Không sửa history cũ hay phục hồi estimate Gemini đã bị mất.

## Stage 3.12 — requirement-status authority (merged & deployed)

- **3.12A — audit only, đã duyệt:** production chỉ có một call CV↔JD, nhưng một completion sinh nhiều representation độc lập. 6 fixture tổng hợp (~$0.044 gồm smoke) chứng minh: `detailedComparison` split OR thành alternative missing (`BigQuery`/`Bahasa`), `matchingPoints`/`missingGaps` tự diễn giải lại và có thể lọt gap không có trong JD (soft skills), `partial` bị nâng thành gap High. `successProbability`/`passProbability` và `categoryScores` là debt latent, tách khỏi scope. Không sửa production.
- **3.12B — MERGED & DEPLOYED ✅:** [PR #18](https://github.com/nghiepnguyen/CVCompareTN/pull/18), commit `4d40fee` → merge `0fd9f6c`, chốt ngày 2026-10-29. `detailedComparison` là requirement-status authority duy nhất. Prompt EN step 9 thêm một dòng logical OR grouping: alternative là một requirement duy nhất, giữ wording JD, `matched` nếu bất kỳ alternative có evidence, `partial` nếu chỉ đáp ứng một phần, `missing` nếu không alternative nào; không emit alternative chưa đạt thành required row riêng; AND vẫn là các requirement riêng. `deriveRequirementInsights()` dùng chung cho Analysis tab (matched/partial/missing + priority badge), Parsed CV chips (cùng derivation, tối đa 3 highlight), recruiter panel và Excel export. `partial` tách riêng; non-JD `missingGaps` không thể thành canonical missing; canonical history ưu tiên DC, legacy fallback chỉ khi không có DC. Không schema/migration/AI call/score/probability/category/rewrite/parse change.
- **Verification:** focused PASS; lint PASS; lint:api PASS; full Vitest 503 PASS / 38 files; production build PASS; `git diff --check` PASS. Commit 13 file (+669/−213). Benchmark 7 call ~$0.043: C/D một logical OR matched; AND Python matched + SQL missing; E giữ partial; A/F non-JD gap không lên surface authoritative.
- **Deferred:** dọn `matchingPoints`/`missingGaps` khỏi prompt/persistence khi không còn compatibility; ~~contract `successProbability` vs `passProbability`~~ CLOSED ở 3.13C; quan hệ `categoryScores` với `matchScore` (non-additive); partial bị bỏ khỏi recruiter panel/Excel hai-khái-niệm; advice cho matched `improvement`; revalidate OR prompt khi đổi model.

## Stage 3.13 — probability authority (merged & deployed)

- **3.13A — audit only, đã duyệt:** [báo cáo](docs/audits/stage-3.13a-probability-authority.md), commit `703176e`. Kết luận `CASE B — DUPLICATE SEMANTIC AUTHORITY`: hai field cùng một prompt step, cùng enum, không definition trong production prompt/schema, 4/5 surface dùng `successProbability`, recruiter/Excel coi hai field thay thế nhau; probe 12 call synthetic cho 3/12 lệch. Git history cho thấy nghĩa gốc interview-success vs screening-pass đã bị xoá từ `a6d4e74`. Không sửa production.
- **3.13B — contract, đã duyệt:** [spec](docs/audits/stage-3.13b-canonical-probability-contract.md), commit `e086553`. Freeze `CONTRACT A — SCORE ONLY`: `passProbability = band(matchScore)`; `>=80 High`, `>=60 Medium`, else `Low`; version `canonical-score-v1`; không đọc required statuses; loại Candidate B (cap demote 95/88 vì một responsibility mềm) và Candidate C (double-count). Có simulator + executable contract test.
- **3.13C — MERGED & DEPLOYED ✅:** [PR #19](https://github.com/nghiepnguyen/CVCompareTN/pull/19), commit `e10fa9a` → merge `200d3bf`, deploy success 2026-10-29. Server derive probability sau `matchScore`; `successProbability` mirror; `probabilityVersion`; `passExplanation = ''`; bỏ probability khỏi prompt/schema; resolver `resolveProbability()` cho canonical/legacy/unknown-version; migrate AnalysisDetailsTab/HistoryView/ComparisonOverview/CandidatePanel/Excel; align threshold inclusive 80/60; migration `20261031000000_probability_version.sql` + RPC copy version.
- **Production verification:** new analysis `matchScore 88 → pass=High`, `success=High`, `probabilityVersion=canonical-score-v1`, explanation rỗng; history/RPC/legacy row đã kiểm tra. Excel export chưa click tay — covered by resolver/component tests (partial verification ở thời điểm 3.13C).
- **Deferred / 3.13D:** `successProbability` + `passExplanation` compatibility removal sau window; chưa cleanup legacy resolver/DB columns; migration-history drift `20261029`/`20261030` (schema có, history thiếu) cần reconcile riêng.

## Stage 3.14 — Parsed CV critical path (deployed / verified)

- **3.14A audit:** [báo cáo](docs/audits/parsed-cv-load-latency.md), commit `eb7a283`. Kết luận `C — REQUEST WATERFALL`: parse eager nhưng chỉ start sau analyze (và sau cả batch), dù `/api/parse-cv` CV-only từ Stage 3.10B. Parse p50 model ~5.5s, analyze p50 ~15.3s; first open rơi vào phần còn lại của parse; second open instant; reload/history dùng `parsed_cv` đã persist.
- **3.14A implementation:** [PR #20](https://github.com/nghiepnguyen/CVCompareTN/pull/20), commit `40bf6b9` → merge `1a96faa`, deploy success 2026-10-29. Parse start ngay khi CV-ready, song song analyze; parse-first attach trực tiếp, analysis-first patch theo result id; parse limiter 5 (analyze vẫn 5); parse failure không reject analyze; temp cleanup chờ parse; `parsed_cv` persist sau history upsert (parsed-first nằm trong upsert, parsed-later một `updateHistoryField`). Rewrite vẫn post-analysis, không đổi.
- **Verification:** 561 test / 43 file; lint/lint:api/build PASS. Browser production: parse và analyze bắt đầu lệch 0.2ms, overlap; parse xong trước analyze 4.51s; first open 51.5ms; second 0.3ms, parse request count giữ 1; reload 0 parse request; history reopen 101.6ms; DB row có `parsed_cv`, `probability_version=canonical-score-v1`, `success=pass=High`.
- **Batch smoke:** không chạy production vì account free (`MAX_BATCH_BY_PLAN.free=1`); batch per-CV scheduling + limiter covered bằng automated test.
- **Deferred:** parser/model latency, PDF payload duplication, large-file R2 second read, legacy `parsed_cv` recovery, CV-hash cache, telemetry response latency, rewrite batch concurrency.

## Hướng tiếp theo

### Next-action queue — cập nhật sau production verification 3.14A

Roadmap này là **master plan** cho AI fidelity, authority, performance, technical debt và operational risk. Danh sách dưới đây là **next-action queue**: thứ tự thực thi thực tế sau khi Stage 3.14A đã được production-verify. Không mở optimization mới chỉ vì debt tồn tại; chỉ triển khai khi có trigger/evidence rõ ràng.

#### P0 — Reconcile migration-history drift trước lần `db push` tiếp theo

- Production schema đã có thay đổi tương ứng `20261029` / `20261030`, nhưng migration history còn thiếu record; `20261031000000_probability_version.sql` đã apply + record.
- Reconcile riêng migration history trước lần `supabase db push` tiếp theo để tránh migration state không phản ánh schema thật.
- Đây không phải regression của 3.13C/3.14A, nhưng có trigger rõ ràng nên không để trôi trong backlog.

#### P1 — Hoàn tất Recruiter production verification

- Stage 3.13C đã verify Candidate/History/RPC; canonical contract vẫn là `passProbability = band(matchScore)`, `successProbability` chỉ compatibility mirror.
- Cần smoke Recruiter thật: tạo/analyze khoảng **5–10 recruiter analyses** khi thuận tiện, kiểm tra CandidatePanel, persistence `candidate_cvs.probability_version`, `successProbability === passProbability`, và click/export Excel ít nhất một lần.
- Canonical rows phải có `probabilityVersion = canonical-score-v1`, `passProbability` không rỗng, mirror mismatch = 0.

#### P1 — Recruiter/batch concurrency audit

- 3.14A production single-CV đã PASS, nhưng production chưa chạy batch 3–5 CV vì smoke account Free (`MAX_BATCH_BY_PLAN.free = 1`). Automated tests đã chứng minh parse per-CV start trước khi analysis resolve và parse cap = 5.
- Audit/smoke batch Recruiter để quan sát thực tế analyze ≤5 + parse ≤5 và rewrite post-analysis. Trọng tâm là debt rewrite concurrency có thể lên tới plan max 50 Recruiter, 429/timeout/retry behavior và burst Gemini.
- Không hạ concurrency hay thêm global limiter nếu chưa có evidence 429/latency/cost bất thường.

#### P1 — Đọc telemetry production Stage 3.4 sau 1–2 tuần

- Chạy SQL trong `docs/11_guard_metrics.md`: guard drop, first-pass failure, retry recovery, fallback, skip; error rows theo category (`[storage_timeout]`, `[gemini_timeout]`…).
- Raw-JD guard thấp không chứng minh lowercase leakage thấp vì guard hiện không nhìn thấy nhóm đó.
- Telemetry là căn cứ quyết định có mở lại fidelity/latency optimization hay không.

#### P2 — Legacy / failed `parsed_cv` recovery

- History legacy hoặc parse-fail row không có `parsed_cv` hiện vẫn empty vĩnh viễn.
- Thiết kế recovery/lazy regeneration là stage riêng; không trộn vào scheduler 3.14A.
- Cần giữ nguyên nguyên tắc dedup: tab không tự tạo duplicate parse trong cùng run và history đã có `parsed_cv` không parse lại.

#### WAIT — Stage 3.13D probability compatibility cleanup

Không cleanup `successProbability`, `passExplanation`, legacy resolver/DB compatibility ngay. Exit criteria đề xuất:

- production window tối thiểu **7 ngày**;
- khoảng **≥50 Candidate canonical analyses**; traffic thấp có thể xem xét từ 30 nhưng 50 là mốc mục tiêu;
- khoảng **5–10 Recruiter canonical analyses**;
- canonical `successProbability === passProbability` 100%;
- không canonical row thiếu `passProbability` / `probabilityVersion`;
- Candidate + History + Recruiter + Excel không còn consumer thực tế phụ thuộc `successProbability`;
- không regression/error liên quan probability trong compatibility window.

Khi đủ các điều kiện trên mới mở 3.13D để remove compatibility fields/branches theo scope riêng, có rollback rõ ràng.

#### BACKLOG — Parsed CV latency/cost optimization

Stage 3.14A đã production-verify scheduling fix:

```text
parse start:       111266.1ms
analyze start:     111266.3ms
parse finish:      114789.6ms  (~3.52s)
analyze finish:    119303.8ms  (~8.04s)
first open:        51.5ms
second open:       0.3ms
reload/history:    101.6ms, 0 parse request
429 observed:      NO
runtime errors:    0 trong smoke window
```

Vì parse hoàn tất trước analysis trong production sample và Parsed tab gần như instant, **không mở 3.14B chỉ để giảm parser latency**. Các debt sau giữ backlog và chỉ kích hoạt khi telemetry/user impact chứng minh cần thiết:

- parser/model latency nền (~5.5s p50 baseline audit);
- PDF có text vẫn gửi kèm PDF → token/payload duplication;
- PDF >2MB có thể R2 HEAD+GET lần hai;
- CV-hash cache để tránh parse lại cùng CV;
- telemetry `logAnalysisAttempt` vẫn nằm trước parse response;
- analyze fail sau khi parse start → parse bị discard, tốn một call.

Trigger để mở optimization: large PDF chậm đáng kể, `/parse-cv` thường xuyên >10s, R2 chiếm latency/cost đáng kể, parse cost tăng rõ, repeated-CV parse phổ biến, hoặc batch xuất hiện 429.

#### Operational risk — model preview

- `gemini-3-flash-preview` vẫn là operational risk độc lập với 3.14A. Nếu model có lịch retire/deprecation, benchmark model kế nhiệm trước khi đổi production.
- Khi benchmark model mới phải kiểm tra lại latency/cost/fidelity và cùng lúc đánh giá `TOTAL_BUDGET_MS`, AI deadline 59s, server 65s, client 75s; `maxDuration` 300s chỉ là safety ceiling.

### Các mục đã đóng khỏi next-action queue

- Stage 3.8 `relevant_score`: CLOSED.
- Requirement-status duplicate authority: CLOSED ở 3.12B.
- Probability duplicate authority: CLOSED ở 3.13C; chỉ còn compatibility cleanup 3.13D sau window.
- Parsed CV request waterfall: CLOSED ở 3.14A.
- Mục “đo baseline Parsed CV sau 3.14A” được coi là **DONE cho quyết định scheduling** vì production smoke đã có overlap, first-open, reload, persistence, 429/error evidence. Có thể tiếp tục thu telemetry thụ động nhưng không phải blocker cho task kế tiếp.

### Semantic debt còn lại (sau 3.14A)

- ~~`successProbability` vs `passProbability`: hai claim độc lập trong cùng canonical call.~~ CLOSED ở PR #19 (Stage 3.13C): một canonical `passProbability`, `successProbability` chỉ là mirror; legacy NULL rows không rescore.
- Parsed CV scheduling không còn chờ analysis; các debt còn lại là parser/model (~5.5s p50), PDF payload duplication, R2 second read, legacy `parsed_cv` recovery, CV-hash cache, telemetry response latency (xem debt 3.14).
- `categoryScores` vs `matchScore`: non-additive, không có weighting tất định; UI chỉ hiển thị theo category; LOW.
- `matchingPoints` / `missingGaps`: vẫn generate/persist/localize nhưng non-authoritative trên canonical result; prose có thể lệch `detailedComparison`; dọn khỏi prompt/persistence khi hết nhu cầu compatibility.
- Partial bị bỏ khỏi recruiter panel/Excel (surface hai khái niệm); nếu cần đầy đủ phải thêm khối/cột partial, không được gán thành missing.
- `detailedComparison[].improvement` cho item matched có thể còn lời khuyên điều kiện; theo dõi khi làm sạch recommendation.

### Chất lượng output (debt đã chấp nhận)

3. **Khái niệm JD chữ thường lọt** ("data modeling", "automated reporting", "demand forecasting"; benchmark 3.3: 2/8 output Full CV stress). Không thêm heuristic từ vựng. Nếu cần đo: sampling/audit output riêng, privacy-safe. Nếu lặp lại nhiều → tách rewrite khỏi raw JD.
4. ~~matchScore lệch theo ngôn ngữ UI~~ — đã xử lý ở Stage 3.7 (canonical scoring). Còn lại: lệch theo ngôn ngữ tài liệu (~3.5 điểm dưới judge cố định) + dao động Gemini (sd 1–3).
5. **Explicit vs derived experience trong analysis text** (CV "5 years", analysis ghi ~7 năm). Full CV đã bắt số năm lấy từ JD ("3+ years") qua numeric guard.
6. **Lời khuyên không điều kiện** kiểu "Cần bổ sung bằng chứng về causal inference…" (~1–3/benchmark).
7. **Wording rewrite chung chung** ("data modeling", "key performance indicators").

### Nhỏ

8. Numeric guard bắt oan khi cùng số khác cách viết ("800 nghìn" vs "800.000") — với Full CV thường được retry cứu.
9. Contact block trước `##` đầu tiên của Full CV không được validate.
10. Tháng tiếng Việt dạng chữ ("Tháng 6/2022") chưa chuẩn hoá.
11. History cũ có `\n` literal trong `fullRewrittenCV` vẫn vỡ (fix chỉ áp cho kết quả mới).
12. Trọng số `languageSkills` hơi nặng với yêu cầu ngoại ngữ nice-to-have.
13. Fallback Full CV chỉ hiển thị trong session; không có nút retry.

### Debt kỹ thuật từ Stage 3.5

14. `unpdf` extractText không hủy được (CPU) — có thể chặn event loop.
15. Gemini abort chỉ phía client — generation bị hủy vẫn có thể bị tính tiền.
16. Hai storage ref (PDF + data) có thể tốn tới 2 × 15s.
17. Quota increment vẫn fail-open (timeout gần deadline = 1 lượt miễn phí).
18. Deadline timers được `unref` nhưng không clear.
19. Platform kill trước khi ghi log vẫn không để lại row.
20. Audit privacy các `console.error` ghi raw error object (`CV rewrite failed`, `Gemini Analysis Error`…).

### Debt từ Stage 3.7

21. Calibration của user VI đổi có chủ đích (3.6b: strong ~+4, medium ~−4–7); phân biệt bằng `scoreVersion`.
22. Recruiter campaign có thể trộn điểm legacy/canonical; nhận biết qua `candidate_cvs.score_version`, UI chưa hiển thị/lọc.
23. `rewriteSuggestions.section` có thể vẫn tiếng Anh; `detailedComparison.requirement` có thể trộn EN/VI.
24. `optimized` đôi khi theo ngôn ngữ JD với tài liệu trộn ngôn ngữ (3–9%, có từ trước).
25. Ngưỡng localization (15s / 20s) còn tạm thời — benchmark local p95 5.7s; theo dõi production.

### Debt từ Stage 3.8

26. ~~`key_match_highlights` / `missing_keywords` do parse-cv tự chấm theo ngôn ngữ UI.~~ CLOSED ở PR #14 (xem bảng trên).

### Debt từ Stage 3.9

27. ~~**parse-cv còn phụ thuộc JD dù không còn judgment CV↔JD.**~~ CLOSED ở PR #16 (Stage 3.10B, merged & deployed): CV-only extraction, JD không đi vào Gemini parse; giữ schema và years fallback.
28. Chip điểm khớp / yêu cầu còn thiếu dùng nguyên `detailedComparison.requirement` (ngôn ngữ JD, không nằm trong allowlist localization 3.7) → UI VI với JD tiếng Anh hiện chip tiếng Anh. Có chủ đích; không mở allowlist chỉ để dịch chip.
29. Chip yêu cầu dài (cụm từ requirement) trong `rounded-full` chưa kiểm tra trên trình duyệt thật.
30. History cũ không có `detailedComparison` vẫn hiện mảng legacy (do parse model chấm) dưới nhãn cũ "Từ khóa còn thiếu"; kết quả mới có bảng canonical rỗng (hiếm) cũng rơi vào nhãn này.

### Ngoài code

31. Vercel Hobby chỉ cho dùng phi thương mại; app thu tiền qua PayOS → rủi ro điều khoản, cân nhắc gói Pro.


### Debt từ Stage 3.13

32. `successProbability` + `passExplanation` vẫn tồn tại như compatibility fields/resolver legacy branches; chỉ remove ở Stage 3.13D sau compatibility window. Không cleanup trong 3.14A.
33. Migration-history drift: `20261029`/`20261030` đã có trong schema production nhưng không có trong `supabase_migrations`; `20261031000000` đã apply + record. Cần reconcile riêng trước lần `db push` tiếp theo; không phải regression của 3.13C.
34. Legacy `history.success_probability`/`pass_probability` có thể chứa giá trị cũ (`Cao`, `%`, free-form); resolver legacy hiển thị raw, không coerce/rescore. Chưa đo phân bố production.
35. Excel export dùng header localized nhưng value canonical enum EN; giữ behavior cũ, chưa localize value.

### Debt từ Stage 3.14

36. Parse model p50 ~5.5s (real CV baseline) vẫn là chi phí nền; 3.14A chỉ che nó sau analyze, không giảm latency.
37. PDF có text vẫn gửi kèm PDF vào parse; input token tăng (audit: 473 → 953 với PDF nhỏ) và có thể làm chậm model.
38. PDF >2MB có text bị R2 HEAD+GET lần hai trong parse sau analyze; chưa tối ưu.
39. History legacy/parse-fail rows không có `parsed_cv` vẫn empty vĩnh viễn; chưa có lazy regeneration (quyết định riêng).
40. Không có CV-hash cache: analyze lại cùng CV sẽ parse lại từ đầu.
41. Parse success vẫn `await logAnalysisAttempt` trước response; telemetry nằm trên critical path (chưa đổi).
42. Rewrite batch concurrency vẫn post-analysis và có thể tới plan batch max (50 recruiter), không đổi trong 3.14A.
43. Nếu analyze fail sau khi parse đã start, parse vẫn chạy và bị discard; tốn một Gemini call (không ảnh hưởng analysis result).
