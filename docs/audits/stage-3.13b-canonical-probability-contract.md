# Stage 3.13B — Canonical probability contract

Ngày: 2026-10-29. **CONTRACT / SPECIFICATION ONLY — production behavior unchanged.**
Tiền đề: [Stage 3.13A audit](stage-3.13a-probability-authority.md) kết luận
`CASE B — DUPLICATE SEMANTIC AUTHORITY`; commit `703176e`.

Kết luận của stage này:

```text
RESULT: CONTRACT A — SCORE ONLY
canonical field: passProbability
version: canonical-score-v1
thresholds: matchScore >= 80 → High, >= 60 → Medium, < 60 → Low
required statuses: KHÔNG đọc trong probability (đã là input của canonical judge)
```

Không migration, không sửa prompt/schema/UI/API, không thêm model call.

---

## 1. Freeze semantic authority

`passProbability` là **canonical field duy nhất** cho:

> Khả năng hồ sơ/CV vượt qua vòng screening dựa trên mức độ phù hợp với JD.

Nó **không** đại diện cho:

- khả năng được tuyển / nhận offer;
- khả năng pass vòng interview;
- confidence của model;
- khả năng thành công chung chung;
- xác suất thống kê trên thị trường hay trên tập ứng viên.

Đây là **heuristic screening representation**, không phải prediction guarantee.
Mọi copy UI phải dùng "khả năng/ước tính", không dùng "sẽ pass", "sẽ được gọi
phỏng vấn", "sẽ được tuyển".

`successProbability` được classification:

```text
LEGACY DUPLICATE AUTHORITY
```

- Không còn semantic riêng (Stage 3.13A §4, §9).
- Vẫn tồn tại trong type/persistence/API trong compatibility window.
- Cho canonical rows mới, nó **không được author độc lập**; xem §13.3.

`passExplanation` và `mainFactor` **không phải** authority của probability; xem §12
và §13.

---

## 2. Probability có cần thông tin ngoài canonical authorities?

Câu hỏi: có product information nào cần cho screening probability mà
`matchScore + canonical required gaps` không biểu diễn được không?

### 2.1 Những gì `matchScore` đã bao gồm

Canonical judge được instruction trực tiếp rằng required items là trục chấm điểm:

- step 2: phân loại REQUIRED / NICE-TO-HAVE trước khi chấm
  (`src/services/ai/prompts.ts:184-188`);
- step 3: thang điểm từng category neo vào required items — 90-100 "fully meets all
  REQUIRED", 75-89 "all or nearly all REQUIRED", 60-74 "most (≥70%) REQUIRED or one
  non-critical missing", 40-59 "fewer than 50% REQUIRED or one critical missing"
  (`prompts.ts:189-196`);
- step 3 experience: trừ điểm / cap 40 theo tỉ lệ năm kinh nghiệm so với required
  (`prompts.ts:197`);
- step 5: missing REQUIRED luôn `impact = "High"` (`prompts.ts:199`) — đây là
  representation của gap, còn score chịu ảnh hưởng trực tiếp ở step 3;
- `matchScore` là overall score do cùng judge sinh trong cùng completion
  (`_server-lib/ai/analysisService.ts:169-175`).

Nói cách khác: required statuses là **input của judge**, không phải một trục thông
tin song song bị bỏ sót. Chúng đã đi vào score qua rubric.

### 2.2 Các signal khác đã xét và loại

| Signal | Có canonical authority? | Vì sao không dùng |
|---|---|---|
| ATS literal keyword coverage | Không. `atsKeywords` chỉ chứa keyword đã khớp; `missingGaps` là non-authoritative sau Stage 3.12B | Sẽ tạo authority thứ ba; keyword gap đã nằm trong đánh giá requirement của judge |
| `formatAssessment` / ATS parseability | Có, nhưng là **concept khác**: CV có đọc được bởi ATS không, không phải CV có khớp JD không | Trộn readability với fit làm probability không còn nghĩa; UI đã có card riêng |
| Competition / market odds / interview / offer | Không có trong hệ thống | Ngoài scope "CV ↔ JD screening"; cần dữ liệu thị trường không tồn tại |
| Salary/location/seniority preference | Không canonical | Sẽ cần extraction + policy mới, không có trong Stage 3.12B authority |
| Model prose (`passExplanation`, `mainFactor`) | Không | Invariant D: không được đọc prose để quyết định value |

### 2.3 Kết luận

**Không có product signal độc lập nào cần thiết.** Probability phải deterministic
hoàn toàn từ canonical authorities; cụ thể là từ `matchScore`.

Required statuses **không được đọc lại** trong probability, vì:

1. chúng đã là input của score (double-counting — §5);
2. `priority` không được schema bắt buộc (`_server-lib/ai/responseSchema.ts:6-16`
   chỉ required `requirement` + `status`), nên một contract dựa vào nó cần thêm
   fallback policy không có authority;
3. dữ liệu thực cho thấy required-missing ở điểm cao là **prose granularity**
   ("collaborate with designers"), không phải hard screening filter (§6, §7).

---

## 3. Invariants (freeze trước formula)

Ký hiệu: `P` = probability, `order(Low)=0 < order(Medium)=1 < order(High)=2`.

| # | Invariant | Định nghĩa hình thức | Contract A |
|---|---|---|---|
| A | Determinism | ∀ score: `P(score)` luôn cùng một giá trị; không phụ thuộc model randomness, thời gian, locale | Thỏa (pure function) |
| B | Score monotonicity | ∀ s1 < s2 với cùng requirement state: `order(P(s2)) ≥ order(P(s1))` | Thỏa |
| C | Requirement monotonicity | ∀ s, gap state g1 nghiêm trọng hơn g2: `order(P(s,g1)) ≤ order(P(s,g2))` | Thỏa (P không đổi theo gap → không bao giờ cao hơn) |
| D | Canonical input only | P không đọc `successProbability`, legacy `passProbability`, `passExplanation`, raw prose, UI state | Thỏa (chỉ đọc `matchScore`) |
| E | One-way derivation | `canonical score/statuses → P`; không có `P → matchScore`, không có `P → requirement status` | Thỏa; 3.13C không được feed ngược |

Ghi chú về C: invariant là **non-strict** ("không được cao hơn"). Contract A cho
kết quả bằng nhau khi gap khác nhau; điều này hợp lệ và có chủ đích — P là
representation của score, không phải gap judge thứ hai (§5).

Invariant A–E được kiểm tra bằng executable spec:
`scripts/__tests__/canonicalProbabilityContract.test.ts` (10 tests) và grid
0..100 × 5 gap configurations trong script simulation. Contract A và B đều qua
A–E; C fail invariant C (§4). Việc chọn A/B vì vậy dựa trên double-counting,
data và product semantics — không phải vì B vi phạm invariant.

---

## 4. Candidate mappings

### Candidate A — score-only thresholds (selected)

```text
matchScore ──► band(80, 60) ──► High | Medium | Low
```

- Đơn giản, deterministic, giải thích được bằng chính score đang hiển thị.
- Không đọc gap → không thể double-count, không có authority thứ hai.
- Nhược điểm lý thuyết: một score cao bất thường kèm required gap thật sẽ vẫn High.
  Đây là rủi ro calibration của score, không phải của probability (§14).

### Candidate B — score bands + required-gap cap (evaluated, rejected)

```text
base = band(matchScore)
if base == High and requiredMissing >= 1: base = Medium
```

- Bảo thủ hơn A ở top band; vẫn deterministic và monotone.
- **Nhưng** cap dựa trên `priority` do model tự gán, không có authority/validation
  riêng; schema không bắt buộc field này.
- Trên corpus: demote 2/12 kết quả (score 88 và 95) chỉ vì một responsibility
  "collaborate with designers" không được CV nhắc literal — trong khi CV khớp toàn bộ
  tool/skill bắt buộc. Đây là false negative do prose granularity, không phải
  screening risk thật.
- Cap làm P không còn là representation của score mà là **judge thứ hai** dựa trên
  một field chưa được freeze như scoring authority.

Chi tiết số liệu: §6.3, §7.

### Candidate C — weighted recomputation (rejected)

```text
adjusted = matchScore - 10×requiredMissing - 4×requiredPartial
P = band(adjusted)
```

- Tạo scoring engine thứ hai song song `matchScore`; weights không có evidence.
- Double-count: required gaps đã ảnh hưởng score (§5).
- Trên corpus: 8/12 thành Low, kể cả score 68 và 76 (đang Medium), vì trừ thêm
  20-28 điểm cho gap đã được score phản ánh.
- Có thể vi phạm Invariant C: 3 partial bị phạt nặng hơn 1 missing, nên gap nghiêm
  trọng hơn (1 missing) lại cho kết quả cao hơn (70 → 60 Medium vs 70 → 58 Low).
- Reject: duplicate scoring.

---

## 5. Double-counting analysis

Ba loại rule phải phân biệt:

### 5.1 Representation rule (A)

`score → level`. Không thêm evidence, không đổi thứ tự, không tạo scale mới. Đây là
cách duy nhất không double-count.

### 5.2 Safety/cap rule (B)

`requiredMissing → trần level`. Không trừ điểm, nhưng vẫn **re-judge** top band bằng
một field khác. Nó không duplicate phép cộng, nhưng duplicate **judgment**: judge đã
được lệnh rằng missing required phải hạ category score và overall fit
(`prompts.ts:189-199`). Cap nói lại lần hai, với dữ liệu do chính judge gán.

### 5.3 Duplicate scoring (C)

`score - penalty`. Trừ điểm cho evidence đã nằm trong score → cùng một gap bị tính
hai lần, và có thể đẩy qua hai band.

### 5.4 Bằng chứng required gaps đã ảnh hưởng score

Prompt (không phải code) là nguồn: required classification → category bands →
experience adjustment → missing required impact High. Code không có aggregation
tất định, nhưng judge được instruction để làm việc đó trong cùng completion.

Corpus 12 mẫu cho thấy tương quan nhất quán (descriptive, n=12):

| matchScore | requiredMissing (min–max) | Ví dụ |
|---|---|---|
| 95 | 1 | 1 soft responsibility missing |
| 88–92 | 0–1 | 0 hoặc 1 soft responsibility missing |
| 72–76 | 1–2 | Looker / north-star metrics missing |
| 68 | 4 | nhiều tool/experience gaps |
| 48 | 4 | phần lớn required missing |

Không có mẫu nào score ≥ 80 với một **hard** required gap (tool/education). Các
required-missing ở điểm cao đều là responsibility/soft phrasing.

Kết luận: penalty/cap sẽ tính lại cùng evidence, với precision thấp hơn score.
Representation-only là lựa chọn đúng.

---

## 6. Repository data simulation

### 6.1 Corpus

- 12 `AnalysisResult` JSON từ Stage 3.13A probe: 8 fixture synthetic (EN) + 4 lần
  lặp `en-medium`; sinh bằng production `analyzeCV`, prompt/schema thật, UI=en
  (không localization).
- Không phải production history, không PII, không legacy row.
- 12/12 có `detailedComparison`; 0 item thiếu `priority` **trong mẫu này** (schema
  vẫn không bắt buộc).
- Không có call mới ở Stage 3.13B; chi phí stage này **$0**.

Caveat: n=12, chỉ 8 cặp CV/JD khác nhau, một cặp lặp 5 lần; không đại diện thống kê.
Dùng để kiểm tra hướng và transition, không để fit threshold.

### 6.2 Distribution

| Mapping | High | Medium | Low |
|---|---:|---:|---:|
| current stored `passProbability` | 7 | 4 | 1 |
| current stored `successProbability` | 4 | 7 | 1 |
| **CONTRACT A** | **4** | **7** | **1** |
| candidate B | 2 | 9 | 1 |
| candidate C | 3 | 1 | 8 |

### 6.3 Transitions

`stored pass → CONTRACT A` (n=12):

| Current | Proposed | Count |
|---|---|---:|
| High | High | 4 |
| High | Medium | 3 |
| Medium | Medium | 4 |
| Low | Low | 1 |

`stored success → CONTRACT A`:

| Current | Proposed | Count |
|---|---|---:|
| High | High | 4 |
| Medium | Medium | 7 |
| Low | Low | 1 |

`stored pass → candidate B`:

| Current | Proposed | Count |
|---|---|---:|
| High | High | 2 |
| High | Medium | 5 |
| Medium | Medium | 4 |
| Low | Low | 1 |

Đọc kết quả:

- A sửa đúng 3 trường hợp `pass = High` bất thường ở score 72–76 (nơi model pass
  lệch khỏi cả score và success) → Medium.
- A trùng `successProbability` 12/12. Đây là quan sát, không phải invariant; ý nghĩa
  thực tế: 4/5 consumer hiện hiển thị `successProbability`, nên A gần như không đổi
  những gì người dùng đang thấy ở các surface đó, và chỉ sửa detail tab (pass).
- B demote thêm 2 case High→Medium so với A; xem §6.4.

### 6.4 B demotions — vì sao reject

| Fixture | Score | A | B | Missing required |
|---|---:|---|---|---|
| en-pdf-text | 95 | High | Medium | "collaborate with designers" |
| en-pdf-scan-inline | 88 | High | Medium | "collaborate with designers" |

Cả hai CV khớp toàn bộ tool/skill bắt buộc (React, TypeScript, Vitest, 3 năm);
item bị coi là "required missing" là một responsibility mềm không được nhắc literal.
Demote một CV 95 xuống Medium vì câu chữ này là false negative. B không sai về
invariant, nhưng sai về product semantics trên dữ liệu thật.

C còn lệch hơn: 8/12 Low, gồm 68/76/72 — những case score nói Medium và model nói
Medium.

---

## 7. Boundary analysis

### 7.1 Exact boundaries (Contract A)

| Score | Level | Ghi chú |
|---:|---|---|
| 59 / 59.9 | Low | dưới ngưỡng |
| 60 | Medium | inclusive |
| 79 / 79.9 | Medium | |
| 80 | High | inclusive |
| 100 | High | |
| < 0 | Low | clamp 0 |
| > 100 | High | clamp 100 |
| NaN / ±Infinity | Low | non-finite → 0-equivalent, khớp coercion hiện tại |

Không round. Nếu 3.13C quyết định round `matchScore` để hiển thị, phải dùng cùng
giá trị đã round cho cả hiển thị và contract — tốt nhất là **không round**, giữ
nguyên behavior hiện tại (UI đang render số thô).

### 7.2 Grid: score × gap state

| Score | required gaps | A | B | C |
|---:|---|---|---|---|
| 59 | 0m/0p | Low | Low | Low |
| 60 | 0m/0p | Medium | Medium | Medium |
| 60 | 1m/0p | Medium | Medium | Low |
| 79 | 0m/0p | Medium | Medium | Medium |
| 79 | 3m/1p | Medium | Medium | Low |
| 80 | 0m/0p | High | High | High |
| 80 | 1m/0p | High | Medium | Medium |
| 80 | 3m/1p | High | Medium | Low |
| 95 | 0m/0p | High | High | High |
| 95 | 1m/0p | High | Medium | High |
| 95 | 3m/1p | High | Medium | Medium |

### 7.3 Corpus boundary cases

| Case | Score | Required state | Stored pass | A | B |
|---|---:|---|---|---|---|
| high + 0 gap | 92 | 6 matched, 1 partial | High | High | High |
| high + 1 soft gap | 95 | 11 matched, 1 partial, 1 missing | High | High | **Medium** |
| high + 1 soft gap | 88 | 9 matched, 2 partial, 1 missing | High | High | **Medium** |
| medium + 2 gaps | 76 | 8 matched, 2 partial, 2 missing (Looker…) | **High** | Medium | Medium |
| medium + 1–2 gaps | 72 | 7 matched, 2 partial, 1–2 missing | High/Medium | Medium | Medium |
| low + many gaps | 68 | 5 matched, 4 partial, 4 missing | Medium | Medium | Medium |
| low + many gaps | 48 | 2 matched, 2 partial, 4 missing | Low | Low | Low |

Không có case `low score + no gaps`, `high score + multiple hard gaps`, hay
`medium score + 0 gaps` trong corpus. Đây là giới hạn dữ liệu, không phải giả định
rằng chúng không tồn tại; grid ở §7.2 phủ định nghĩa cho mọi tổ hợp.

### 7.4 Boundary lệch hiện có trong UI

Ba surface dùng `matchScore > 80` / `> 60` cho màu
(`AnalysisDetailsTab.tsx:96-98`, `ComparisonOverview.tsx:43-44`,
`HistoryView.tsx:303-304`), trong khi verdict copy dùng `>= 80` / `>= 60`
(`AnalysisDetailsTab.tsx:117-121`). Ở đúng 80 hoặc 60, màu và verdict đang bất
đồng. Contract dùng **inclusive** để khớp verdict; 3.13C phải sửa màu thành
`>= 80` / `>= 60` để không tạo mâu thuẫn mới giữa màu badge và probability.

---

## 8. Product semantics test

| Level | Điều kiện Contract A | Product statement | Đánh giá |
|---|---|---|---|
| High | score ≥ 80 | "CV có khả năng tốt vượt vòng screening" | Hợp lý: judge xếp overall fit vào vùng cao; UI đã gọi đây là high match |
| Medium | 60 ≤ score < 80 | "CV có khả năng vượt screening nhưng còn điểm chưa đạt đáng kể" | Hợp lý nếu "gap" được định nghĩa là **score deficit**, không nhất thiết required-missing |
| Low | score < 60 | "CV có rủi ro cao không vượt screening" | Hợp lý: rubric nói dưới 60 là thiếu phần lớn required hoặc thiếu critical |

Wording bắt buộc: "khả năng", "ước tính", "mức phù hợp"; cấm "sẽ pass", "sẽ được
gọi phỏng vấn", "sẽ được tuyển", "chắc chắn".

Đánh giá candidate:

- **A**: nhất quán với score/verdict đang hiển thị trên cùng màn hình. Medium ở
  score 60–79 luôn đi kèm một score deficit nhìn thấy được → câu "còn điểm chưa đạt"
  đúng.
- **B**: Medium ở score 95 (vì một responsibility mềm) mâu thuẫn với score 95 và
  verdict "high match" trên cùng màn hình; muốn đúng phải thêm copy giải thích
  "required gap" — nhưng gap đó không đáng kể. Không nhất quán.
- **C**: score 76 → Low trong khi score/verdict nói Medium/high; phá vỡ cách đọc
  score. Không nhất quán.

---

## 9. Selected contract

# **CONTRACT A — SCORE ONLY**

### 9.1 Inputs

| Input | Source | Bắt buộc |
|---|---|---|
| `matchScore` | canonical AnalysisResult, number 0–100 (Stage 3.7) | Có |

Không input nào khác. Required statuses, `successProbability`, stored
`passProbability`, `passExplanation`, prose, UI state: **không đọc**.

### 9.2 Algorithm (chính xác)

```text
INPUT: score = canonical matchScore (number)

1. if score is not finite: score = 0
2. score = clamp(score, 0, 100)
3. if score >= 80: return "High"
4. if score >= 60: return "Medium"
5. return "Low"

VERSION = "canonical-score-v1"
```

- Không round; so sánh trên giá trị số đã parse.
- Output enum: `"High" | "Medium" | "Low"` (canonical EN; UI dịch khi render).
- Hàm thuần (pure), không I/O, không đọc thời gian/locale/random.
- Chạy **một lần lúc write**, kết quả được persist; không tính lại khi read.

### 9.3 Thresholds — vì sao 80/60

Đây là ngưỡng **sản phẩm đã tồn tại**, không phải ngưỡng mới:

- verdict copy: `>= 80` high, `>= 60` mid (`AnalysisDetailsTab.tsx:117-121`);
- badge màu và sort dùng cùng 80/60 (`ComparisonOverview.tsx:43-44`,
  `HistoryView.tsx:303-304`).

Dùng lại 80/60 giữ probability khớp với thứ người dùng đã thấy; không tạo boundary
thứ hai. Không dùng 75 (biên của category rubric) vì sẽ lệch verdict/score.

### 9.4 Fallback behavior

| Tình huống | Behavior |
|---|---|
| `matchScore` non-finite / absent (canonical write path) | coi là 0 → Low; vẫn set version; log telemetry. Khớp coercion hiện tại (`analysisService.ts:169-175`) |
| `matchScore` ngoài [0,100] | clamp |
| Canonical row thiếu `passProbability` khi read | hiển thị "—", log; **không** fallback sang `successProbability`, không tính lại |
| Legacy row (version NULL) | không tính; hiển thị theo legacy policy (§11) |
| Unknown future version | hiển thị stored value; không tính lại; log |

### 9.5 Non-goals / không được làm

- Không derive probability từ `matchingPoints`/`missingGaps` (non-authoritative
  sau Stage 3.12B).
- Không derive từ `categoryScores` (non-additive).
- Không feed probability ngược vào score, requirement status, sort score, hay
  rewrite.
- Không dùng probability để thay đổi màu/verdict của score (chỉ dùng chung ngưỡng).
- Không thêm model call.

---

## 10. Versioning

### 10.1 Field

```ts
// AnalysisResult (3.13C)
probabilityVersion?: 'canonical-score-v1';
```

Giá trị hiện tại: `canonical-score-v1`. Tên phản ánh contract A (score-only).

### 10.2 Persistence (3.13C, không phải stage này)

| Nơi | Thay đổi | Ghi chú |
|---|---|---|
| `history` | thêm cột nullable `probability_version text` | Theo đúng pattern `score_version` (`supabase/migrations/20261030000000_score_version.sql:11-14`) |
| `candidate_cvs` | thêm cột nullable `probability_version text` | RPC `save_candidate_analysis` set từ `p_analysis_result->>'probabilityVersion'` (cùng pattern `score_version`, dòng 48) |
| `analysis_result` JSONB | chứa `probabilityVersion` | Không cần đọc cột vẫn hiển thị được |

- **Không** default, **không** backfill, **không** index (giống `score_version`).
- Deploy order: apply migration + verify trước khi deploy app ghi version; nếu
  không, insert history mới sẽ fail.
- `NULL` = legacy (analyzed trước 3.13C hoặc client cũ), không bao giờ rescore.
- **Không** derive on read. Nếu sau này đổi thresholds, bump version
  (`canonical-score-v2`); row v1 giữ nguyên giá trị đã lưu.
- Vì sao không reuse `scoreVersion`: mapping probability có thể đổi độc lập với
  scoring; row `canonical-en-v1` được tạo trước 3.13C vẫn phải là legacy cho
  probability.

### 10.3 Unknown/missing version

| Trạng thái | Behavior |
|---|---|
| `probabilityVersion` NULL/absent | legacy: preserve display (§11) |
| `canonical-score-v1` | canonical: dùng `passProbability` |
| version khác (tương lai) | hiển thị stored `passProbability`; không tính lại; log/metric để audit |

---

## 11. Legacy compatibility

### 11.1 Nguyên tắc

```text
historical persisted result
    → preserve historical display
    → no silent rescore
    → no rewrite of stored analysis
```

New analyses sau 3.13C:

```text
canonical deterministic passProbability
    + probabilityVersion = canonical-score-v1
```

### 11.2 Value matrix

| Stored state | Classification | Display |
|---|---|---|
| `probabilityVersion = canonical-score-v1` + `passProbability` ∈ enum | canonical | `passProbability` ở mọi surface |
| version NULL (kể cả có đủ hai field) | legacy | giữ nguyên field/label mà surface đó vẫn dùng (§13) |
| version NULL, `passProbability` NULL, có `successProbability` | legacy | history/comparison/recruiter dùng `successProbability`; detail hiển thị rỗng như hiện tại |
| version NULL, giá trị `Cao`/`Trung bình`/`Thấp` | legacy | hiển thị nguyên văn; color adapter hiện có của detail đã map 3 cách viết (`AnalysisDetailsTab.tsx:189-190`) |
| version NULL, giá trị free-form (`%`, text khác) | legacy | hiển thị nguyên văn; **không** coerce, không map sang enum |
| version hợp lệ nhưng `passProbability` thiếu | corrupt canonical | hiển thị "—", log; không fallback, không tính lại |

### 11.3 Ranh giới legacy ↔ canonical

Ranh giới là **`probabilityVersion`**, không phải sự hiện diện của field, không
phải `scoreVersion`, không phải `matchScore`. Một row chỉ được coi là canonical
khi version là chuỗi đã biết. Điều này tránh việc row cũ vô tình bị "canonical hóa"
chỉ vì có đủ hai cột.

Legacy rows có thể vẫn lộ mâu thuẫn cross-surface cũ (success ở list, pass ở
detail); đây là **compatibility có chủ đích**, không sửa trong 3.13C.

---

## 12. `passExplanation` policy

### 12.1 Đánh giá options

| Option | Mô tả | Đánh giá |
|---|---|---|
| **A** | Deprecate cho canonical rows; legacy giữ stored prose | Không còn narrative authority thứ hai; probability deterministic tự giải thích được bằng score đang hiển thị. UI detail mất một đoạn prose; có thể thay bằng caption tĩnh từ translations |
| B | Derive deterministic explanation từ canonical inputs | Không thể contradict, nhưng lặp lại score/band ("76/100 → Medium") hoặc phải nhắc required gaps mà value cố tình không dùng → tái tạo mâu thuẫn |
| C | Giữ model-authored explanation, cấm author probability | Cần model biết canonical value để không contradict → phải inject value vào prompt hoặc call thứ hai; validation ngữ nghĩa không đáng tin. Hiện trạng là C nhưng không có cơ chế kiểm soát contradiction |

### 12.2 Quyết định

**Option A** cho canonical rows:

- 3.13C: không render `passExplanation` khi `probabilityVersion` là canonical.
- Write path: set `passExplanation = ''` cho canonical rows (model value bị bỏ).
- Legacy rows: giữ nguyên text đã lưu và tiếp tục render.
- UI thay thế (tuỳ chọn, không bắt buộc): caption tĩnh theo level từ translations,
  ví dụ "Mức phù hợp tổng thể của CV so với JD", không phải per-analysis prose.

Lý do: probability giờ là một band của score đang hiển thị; một đoạn văn model sinh
thêm không có định nghĩa sẽ chỉ tạo authority thứ hai. Option B không thêm thông tin;
Option C không thể đảm bảo non-contradiction nếu không thêm call/prompt injection.

`mainFactor`: giữ nguyên model-authored trong 3.13C (narrative "yếu tố ảnh hưởng",
không phải probability claim), theo dõi contradiction như debt riêng. Không thuộc
contract này.

---

## 13. Consumer migration plan

### 13.1 Shared accessor (3.13C)

Tạo một hàm duy nhất, ví dụ `resolveProbability(result, surface)`:

```text
if probabilityVersion is a known canonical version:
    return { value: result.passProbability, source: 'canonical' }
else:
    return legacy field for this surface (see table)
```

Không consumer nào được tự viết `successProbability || passProbability` cho
canonical rows. Legacy fallback chỉ nằm trong nhánh legacy của accessor.

### 13.2 Per-consumer

| Consumer | Current | Target (canonical rows) | Label | Legacy behavior |
|---|---|---|---|---|
| `AnalysisDetailsTab` | `passProbability` + `passExplanation` + `mainFactor` | `passProbability`; ẩn explanation block; giữ `mainFactor` | "Khả năng pass vòng CV" (giữ) | giữ stored `passProbability` + `passExplanation` như hiện tại |
| `HistoryView` | `successProbability`, icon-only | `passProbability` + label rõ | "Khả năng vượt vòng lọc" | `successProbability` như hiện tại |
| `ComparisonOverview` | `successProbability`, header "Xác suất" | `passProbability` | header "Khả năng vượt vòng lọc" (thay "Xác suất") | `successProbability` như hiện tại |
| `CandidatePanel` | `successProbability`, fallback `passProbability`, "Xác suất" | `passProbability` | "Khả năng vượt sàng lọc" | `successProbability`, fallback `passProbability` như hiện tại |
| Excel export | `successProbability`, fallback `passProbability`, "Xác suất" | `passProbability` | cột "Khả năng vượt sàng lọc"; render theo ngôn ngữ sheet | `successProbability`, fallback `passProbability` như hiện tại |

### 13.3 `successProbability` trong compatibility window

- **Phase 1 (3.13C):** server tính canonical `passProbability` và **bỏ giá trị model
  author**; set `successProbability = passProbability` (mirror) cho canonical rows để
  client cũ không thấy mâu thuẫn; set `probabilityVersion`.
- **Phase 2:** bỏ hai field khỏi prompt/schema (model không author nữa); server vẫn
  set canonical + mirror.
- **Phase 3:** deprecate `successProbability` khỏi API/type; giữ cột DB cho history.
- Consumer đã migrate **không** đọc `successProbability` cho canonical rows, kể cả
  khi field còn tồn tại.

### 13.4 Threshold consistency

3.13C phải đổi màu badge từ `> 80`/`> 60` sang `>= 80`/`>= 60`
(`AnalysisDetailsTab.tsx:96-98`, `ComparisonOverview.tsx:43-44`,
`HistoryView.tsx:303-304`) để khớp contract và verdict copy.

### 13.5 Sorting/filtering

Hiện tại sort theo `matchScore` (`ComparisonOverview.tsx:22,64`), không theo
probability. Giữ nguyên; probability không trở thành sort authority.

---

## 14. Risks / compatibility concerns

1. **Corpus nhỏ (n=12, 8 cặp CV/JD, một cặp lặp 5 lần).** Distribution chỉ để kiểm
   tra hướng; threshold dựa trên ngưỡng sản phẩm hiện có, không fit từ corpus.
2. **High + hard required gap chưa quan sát.** Nếu production có score ≥80 mà thiếu
   required tool/education thật, A vẫn High. Đây là **score calibration** issue;
   sửa ở judge/rubric, không thêm cap vào probability (sẽ tái tạo authority thứ hai).
   Đề xuất telemetry: đếm `score ≥ 80 && requiredMissing ≥ 1` trong canonical rows.
3. **`priority` không được schema bắt buộc** (`responseSchema.ts:6-16`). A không phụ
   thuộc field này nên an toàn; B/C thì không.
4. **Legacy values chưa đo.** DB có thể chứa `Cao`, `%`, free-form từ trước Stage
   3.7. Chưa đọc production; adapter phải hiển thị raw, không coerce.
5. **API breaking nếu xoá `successProbability` sớm.** Phải mirror + staged
   deprecation; `docs/5_api.md:45` đang liệt kê cả hai.
6. **`passExplanation` biến mất ở canonical rows** là thay đổi UX; cần caption tĩnh
   hoặc chấp nhận block trống được ẩn. Legacy vẫn hiển thị.
7. **Off-by-one màu hiện tại** (strict `>` vs inclusive `>=`): nếu 3.13C không sửa,
   score đúng 80 sẽ có probability High nhưng màu Medium.
8. **Rounding:** không round score. Nếu tương lai round để hiển thị, phải dùng cùng
   giá trị cho contract hoặc probability sẽ lệch ở 79.5/80.4.
9. **History là snapshot:** không derive on read. Nếu derive, đổi threshold sẽ làm
   số liệu lịch sử thay đổi — vi phạm "no silent rescore".
10. **Migration deploy order:** `probability_version` phải có trước khi app ghi, như
    `score_version`; nếu không history insert fail.
11. **Unknown future version:** app cũ không được tính lại; hiển thị stored value.
12. **Model preview retirement** (roadmap `:108`) có thể đổi score calibration;
    probability đi theo score, nên rủi ro nằm ở score/version, không ở mapping.
13. **Excel localize:** value canonical là EN enum; sheet VI phải render qua
    translation, nếu không sẽ trộn ngôn ngữ như hiện tại.
14. **Old clients** vẫn đọc `successProbability`; mirror bảo vệ đến khi Phase 3.
15. **`mainFactor`** vẫn model-authored, có thể nhắc gap mà probability bỏ qua;
    ngoài scope, theo dõi như debt.

---

## 15. Evidence index

**Canonical score / rubric**

- `src/services/ai/prompts.ts:184-188` — phân loại REQUIRED/NICE-TO-HAVE trước khi chấm.
- `src/services/ai/prompts.ts:189-196` — category bands neo vào required items.
- `src/services/ai/prompts.ts:197` — experience adjustment theo required years.
- `src/services/ai/prompts.ts:199` — missing required → `impact = High`.
- `src/services/ai/prompts.ts:218` — step 8 probability (model-authored hiện tại).
- `_server-lib/ai/analysisService.ts:169-175` — matchScore parse/coercion.
- `_server-lib/ai/analysisService.ts:216-217` — fallback `Medium` hiện tại (sẽ bị thay).

**Schema / types**

- `_server-lib/ai/responseSchema.ts:6-16` — `priority` không nằm trong required.
- `_server-lib/ai/responseSchema.ts:63-66` — hai probability enum.
- `src/services/ai/types.ts:139-142` — type hiện tại.
- `src/services/ai/types.ts:154-157` — pattern `scoreVersion`/`presentationLanguage`.

**Persistence**

- `supabase/migrations/20260516120000_cv_matcher_core_schema.sql:38-39` — cột probability.
- `supabase/migrations/20261030000000_score_version.sql:11-14` — pattern version columns.
- `supabase/migrations/20261030000000_score_version.sql:48` — RPC copy từ
  `analysis_result->>'scoreVersion'`.
- `src/services/historyService.ts:29-31,100-101` — map đọc/ghi.
- `src/services/historyService.ts:46-48` — pattern đọc `score_version`.
- `src/services/historyService.ts:114` — pattern ghi version.
- `src/context/recruiter/RecruiterContext.tsx:293` — ghi analysis JSONB.
- `api/recruiter/save-analysis.ts:39-44` — RPC call.

**Consumers / thresholds**

- `src/components/views/result/AnalysisDetailsTab.tsx:96-98` — màu dùng `> 80`/`> 60`.
- `src/components/views/result/AnalysisDetailsTab.tsx:117-121` — verdict dùng `>= 80`/`>= 60`.
- `src/components/views/result/AnalysisDetailsTab.tsx:186-193` — pass render + label.
- `src/components/views/result/AnalysisDetailsTab.tsx:196-208` — explanation/mainFactor.
- `src/components/views/result/ComparisonOverview.tsx:22,64` — sort theo score.
- `src/components/views/result/ComparisonOverview.tsx:43-44` — màu theo score.
- `src/components/views/result/ComparisonOverview.tsx:36,90` — success display.
- `src/components/views/HistoryView.tsx:303-304` — màu theo score.
- `src/components/views/HistoryView.tsx:328-330` — success display, icon-only.
- `src/components/recruiter/CandidatePanel.tsx:339` — `success || pass`.
- `src/context/recruiter/RecruiterContext.tsx:412` — Excel fallback.
- `src/translations/result.ts:75-78` — label "Khả năng pass vòng CV".
- `src/translations/result.ts:363-366` — label "Xác suất".
- `src/translations/recruiter.ts:304-307` — label "Xác suất".

**Prior stage**

- `docs/audits/stage-3.13a-probability-authority.md` — CASE B, probe 12 calls,
  3/12 divergence, legacy `successProbability`.
- `docs/superpowers/plans/2026-10-28-gemini-ai-fidelity-roadmap.md:112` — debt entry.

---

## 16. Appendix — commands, cost, executable spec

```bash
# 1) Run the contract simulator on the Stage 3.13A probe corpus (read-only, no network)
node node_modules/.bin/tsx scripts/audit-canonical-probability.ts \
  /tmp/stage-3-13a-prob/raw /tmp/stage-3-13a-prob-repeat/raw

# 2) Executable specification (10 tests)
npx vitest run scripts/__tests__/canonicalProbabilityContract.test.ts

# 3) Full gates (docs/script only; production untouched)
npm run lint
npm test
```

- Corpus: 12 `AnalysisResult` JSON từ Stage 3.13A (8 fixture EN + 4 repeat), synthetic,
  không PII. Không có model call ở Stage 3.13B — **$0**.
- Simulator là read-only, import production code: không. Mapping functions trong
  script là **reference spec**, không phải runtime.
- Test file: `AUDIT / CONTRACT TEST ONLY — freezes the Stage 3.13B specification`.
  Không assert behavior production hiện tại; không được import bởi app.

---

## TL;DR cho 3.13C

`passProbability` = `band(matchScore)` với 80/60, version `canonical-score-v1`,
tính một lần lúc write và persist; không đọc gap, không cap, không penalty. B bị
loại vì demote score 95/88 chỉ vì một responsibility mềm; C vì double-count và
cross-band. 3.13C: migration `probability_version` → server override + mirror
`successProbability` + bỏ `passExplanation` cho canonical → migrate 5 consumer qua
một accessor → align màu `>= 80/60` → sau đó mới bỏ field legacy.
