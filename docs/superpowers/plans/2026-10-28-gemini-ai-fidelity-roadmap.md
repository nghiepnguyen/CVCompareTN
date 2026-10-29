# Gemini AI fidelity — roadmap

Ngày lập: 2026-10-28. Cập nhật: 2026-10-29 (Stage 3.10B — MERGED & DEPLOYED).
Production hiện tại: `main` @ `b974e92` (PR #16 đã merge; deploy được xác nhận ngày 2026-10-29). Commit Stage 3.10B: `2a54cc1`; merge commit: `b974e92ab01a14f9105c243601f5b232b1e704ea`. PR #12 + migration `20261030000000_score_version.sql` đã apply trước đó, production smoke PASS.

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

Boundary production (Stage 3.10B):

```
CV                 → parse-cv → Gemini CV-only extraction / structuring / presentation data
CV + JD            → canonical analyze → matching / semantic judgment (matchScore, categoryScores, detailedComparison)
Parsed CV UI       → canonical detailedComparison cho match / missing qua deriveParsedCvInsights
                     (matched → điểm khớp; chỉ missing → yêu cầu còn thiếu; partial không tính)
Legacy fields      → compatibility only (relevant_score, key_match_highlights, missing_keywords)
                     fallback history cũ khi không có detailedComparison; không trộn với canonical
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

## Stage 3.11 — authority kinh nghiệm (local, chưa ship)

- **3.11A — audit hoàn tất, đã duyệt:** Option E — evidence-aware hybrid. 36 fixture tất định + 10 call live (~$0.0075 theo pricing repo) chứng minh subtotal 4 năm ghi đè model 9 năm trên timeline partial; model cũng có thể sinh calendar dates không có trong CV. History current-role 6.8 → 7.3 khi mở lại từ 10/2026 sang 04/2027. Field chỉ display/persistence, không chấm điểm.
- **3.11B — triển khai local để review:** inspection raw entries → source-backed union → explicit selector; COMPLETE + source-supported mới override model, PARTIAL/UNAVAILABLE giữ estimate hợp lệ, invalid → trusted subtotal → 0; xử lý model-zero conflict. Evidence check bảo thủ trên một dòng có company/title ngay trước date pair; multiline/scan/image không xác minh được → unknown. Future-only bỏ, future end cap tại ICT `asOf`, year-only không đủ precision COMPLETE, `is_current` chỉ nhận boolean true. History mode giữ selected snapshot. Giữ schema/ATS wrapper/CV-only/canonical authority; không migration hay thêm AI call. Chưa commit/push/PR/deploy.
- **Deferred:** ATS wrapper naming; role-local provenance cho layout nhiều dòng/OCR; conflict summary/timeline; taxonomy và general Gemini extraction variability. Không sửa history cũ hay phục hồi estimate Gemini đã bị mất.

## Hướng tiếp theo

### Ưu tiên cao

0. ~~**Stage 3.8 — parse-cv `relevant_score` UI-language-coupled.**~~ CLOSED ở PR #13 (xem bảng trên).
1. **Đọc telemetry production (Stage 3.4 data).** Sau 1–2 tuần, chạy SQL trong `docs/11_guard_metrics.md`: tỷ lệ guard drop, first-pass failure, retry recovery, fallback, skip; cùng tỷ lệ error row theo category (`[storage_timeout]`, `[gemini_timeout]`…). Dữ liệu này quyết định mục 2 và 4.
   - Lưu ý: rawJd thấp ≠ leakage lowercase thấp — guard không nhìn thấy loại này.
2. **Rủi ro model preview.** `gemini-3-flash-preview` có thể bị khai tử với 2 tuần báo trước. Chuẩn bị `gemini-3.6-flash` (chậm ~1.7×, giá ×2 từ 01/2027). Deadline 65s / AI 59s giờ là một hằng số chung (`_server-lib/deadline.ts`) + client 75s + `maxDuration` 300s đã có headroom — cần benchmark lại latency để chỉnh `TOTAL_BUDGET_MS`/client cùng lúc.

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
