# Gemini AI fidelity — roadmap

Ngày lập: 2026-10-28. Cập nhật: 2026-10-29 (sau PR #12).
Production hiện tại: `main` @ `ce84b7c` (PR #12 đã merge, migration `20261030000000_score_version.sql` đã apply, production smoke PASS).

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

## Hướng tiếp theo

### Ưu tiên cao

0. ~~**Stage 3.8 — parse-cv `relevant_score` vẫn UI-language-coupled.**~~ **3.8B (local, chờ review):** Option A — bỏ `relevant_score` khỏi prompt/schema parse + UI `ParsedCVTab` (cả badge lệch điểm; pattern `useMemo` sau early return cũng bị gỡ, nhưng crash hooks nghi ngờ ở 3.8A KHÔNG tái hiện được trên React 19); `matchScore` canonical là điểm CV↔JD duy nhất; `relevant_score` chỉ còn trong `history.parsed_cv` legacy. Còn lại: `key_match_highlights`/`missing_keywords` vẫn theo ngôn ngữ UI. Mô tả gốc: `/api/parse-cv` vẫn chấm `ats_evaluation.relevant_score` bằng prompt theo ngôn ngữ UI, nên `ParsedCVTab` → `computeScoreDiscrepancy(matchScore, relevant_score)` đang so MatchScore canonical với một điểm do judge khác chấm → cảnh báo lệch điểm có thể sai/nhiễu với user VI. Hướng xử lý cần audit trước (giống 3.6): bỏ so sánh, chấm `relevant_score` bằng judge canonical, hay chỉ hiển thị khi cùng `scoreVersion`.
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

### Ngoài code

26. Vercel Hobby chỉ cho dùng phi thương mại; app thu tiền qua PayOS → rủi ro điều khoản, cân nhắc gói Pro.
