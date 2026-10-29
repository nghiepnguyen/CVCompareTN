# Stage 3.13A — Probability authority audit

Ngày: 2026-10-29. **AUDIT ONLY — production behavior unchanged.**
Phạm vi: `successProbability`, `passProbability` (và quan hệ với `matchScore`).
Phương pháp: trace tĩnh toàn repo + git history + 12 call live trên fixture tổng hợp
(8 + 4, ~$0.1049 theo pricing trong repo). Không gọi production API, không đọc dữ liệu
người dùng thật, không sửa code/prompt/schema/UI.

Kết luận ngắn: **CASE B — DUPLICATE SEMANTIC AUTHORITY**, có nguồn gốc CASE A trong
git history nhưng semantic contract đó không còn được producer, persistence hay
consumer duy trì.

---

## 1. Executive conclusion

`successProbability` và `passProbability` là hai field **cùng một completion Gemini**
sinh ra, cùng domain `High | Medium | Low`, cùng được lưu, nhưng **không có định nghĩa
nào trong prompt production hiện tại** và **không có consumer nào hỏi hai câu hỏi sản
phẩm khác nhau**. Bốn trong năm surface hiển thị `successProbability` dưới nhãn chung
"Xác suất / Probability"; chỉ surface duy nhất hiển thị `passProbability` mới có nhãn
nói rõ "Khả năng pass vòng CV". Recruiter panel và Excel export còn dùng
`successProbability || passProbability` — tức hai field được code coi là thay thế được
cho nhau.

Trong 12 call live: 9/12 hai field bằng nhau, **3/12 lệch** (cùng một analysis có
`successProbability = Medium`, `passProbability = High`). Cùng một input lặp lại cho
`passProbability` nhảy `High/Medium` trong khi `successProbability` đứng yên — hai field
được model sample độc lập, không phải hai phép đo có contract.

Điểm lịch sử quan trọng: commit đầu tiên **có** định nghĩa hai khái niệm khác nhau
(interview success vs CV-screening pass). Định nghĩa đó bị xoá ở lần refactor
`a6d4e74` và không bao giờ được khôi phục. Vì vậy không thể kết luận "hai field khác
nhau vì tên khác nhau" — nhưng cũng không thể kết luận chúng đang đo hai concept khác
nhau, vì **không còn artefact nào trong pipeline hiện tại định nghĩa sự khác biệt đó**.

---

## 2. Field inventory

| Field | Producer | Transformation | Persistence | Consumers | UI label | Scale/domain | Fallback |
|---|---|---|---|---|---|---|---|
| `matchScore` | Gemini, cùng completion, prompt step 3 (`src/services/ai/prompts.ts:189-197`) | numeric coercion (number / `parseFloat` / `Number`) tại `_server-lib/ai/analysisService.ts:169-175`; **không** derive từ probability | `history.match_score` numeric (`historyService.ts:96`); `candidate_cvs.match_score` numeric | Analysis tab circle + verdict + charts, History badge, Comparison sort/badge, Recruiter panel, Excel | "ATS", `atsScore`, `matchVerdict*` | 0–100 (number) | `0` khi coercion fail (`analysisService.ts:175`) |
| `successProbability` | Gemini, cùng completion, prompt step 8 (`prompts.ts:218`) | **không có** — raw string, không trim/validate ngoài enum schema; không derive từ `matchScore` | `history.success_probability text` (`schema:38`, `historyService.ts:100`); `candidate_cvs.analysis_result` JSONB (`RecruiterContext.tsx:293`) | Comparison table, History list, Recruiter panel, Excel | "Xác suất / Probability" (`result.ts:363-366`, `recruiter.ts:304-307`); History list **không nhãn** (`HistoryView.tsx:328-330`) | `High` / `Medium` / `Low` (`responseSchema.ts:63`) | server default `Medium` khi thiếu (`analysisService.ts:216`); reader `""` khi NULL (`historyService.ts:29-30`); recruiter fallback sang `passProbability`, sau đó `—` (`CandidatePanel.tsx:339`) |
| `passProbability` | Gemini, cùng completion, prompt step 8 (`prompts.ts:218`) | **không có** — raw string | `history.pass_probability text` (`schema:39`, `historyService.ts:101`); `candidate_cvs.analysis_result` JSONB | Analysis details tab (duy nhất) | "Khả năng pass vòng CV / CV Pass Probability" (`result.ts:75-78`, render `AnalysisDetailsTab.tsx:186`) | `High` / `Medium` / `Low` (`responseSchema.ts:64`) | server default `Medium` khi thiếu (`analysisService.ts:217`); reader `""`; recruiter fallback sang `successProbability` |

Không có alias, derived value hay mapping gián tiếp nào khác: `grep` toàn repo chỉ có
các vị trí trên (cộng fixture test và generated `graft/*.md` — xem §12).

---

## 3. Producer / dataflow map

```text
buildAnalyzePromptEn step 8 (prompts.ts:218)          ← production, always EN since Stage 3.7
  "Estimate success probability and pass probability, correctly reflecting that
   gaps in REQUIRED items hurt these estimates far more than gaps in NICE-TO-HAVE items."
        │
        │  responseSchema: both enum High/Medium/Low, both required, no description
        │  (responseSchema.ts:63-66, 113-117)
        ▼
Gemini completion (analysisService.ts:147-167)
        ▼
finalResult
  successProbability: parsedResult.successProbability || 'Medium'   (analysisService.ts:216)
  passProbability:    parsedResult.passProbability    || 'Medium'   (analysisService.ts:217)
        │            ↑ hai fallback độc lập, không cross-check, không nhìn matchScore
        ▼
canonical AnalysisResult (types.ts:129-158)
        │
        │  localizeAnalysis: KHÔNG nằm trong presentationItems() → enum không đổi
        │  (localizeAnalysis.ts:24-37; so sánh passExplanation/mainFactor ở :29-30)
        ▼
API response ──► history.upsert (success_probability, pass_probability)  ──► mapHistory
             └─► /api/recruiter/save-analysis ──► candidate_cvs.analysis_result JSONB
                                                                    │
        ┌───────────────────────────────────────────────────────────┘
        ▼
ComparisonOverview · HistoryView · AnalysisDetailsTab · CandidatePanel · Excel
```

Vị trí hai field đi vào pipeline: **duy nhất tại step 8 của prompt scoring**, cùng một
completion với `matchScore`; không có stage normalization, mapping hay derivation nào
sau đó. Đây là điểm khác biệt với `detailedComparison` (được normalize ở
`resultPayloadNormalize.ts` và là authority của Stage 3.12B).

Producer authority thực tế:

| Câu hỏi | `successProbability` | `passProbability` |
|---|---|---|
| Model sinh trực tiếp? | Có | Có |
| Deterministic code sinh? | Không | Không |
| Derived từ `matchScore`? | Không | Không |
| Derived từ requirement statuses? | Không | Không |
| Normalize sau model? | Không (chỉ default `Medium`) | Không (chỉ default `Medium`) |
| Legacy fallback? | Không; chỉ default khi thiếu | Không; chỉ default khi thiếu |
| Localize theo UI? | Không | Không |

---

## 4. Semantic evidence

### 4.1 Live producer: không định nghĩa field nào

- Prompt production (`prompts.ts:218`) gộp cả hai vào **một câu**, không nêu khái niệm,
  không nêu scale, không nói field nào là gì. Không có instruction riêng cho
  `passExplanation` hay `mainFactor` (hai field này chỉ xuất hiện trong evidence-rule
  như "field không được chứa JD-only concept": `prompts.ts:38`, `prompts.ts:176`).
- Schema (`responseSchema.ts:63-64`) chỉ có `type: 'STRING'` + enum, **không description**.
- TypeScript (`types.ts:139-142`) chỉ khai báo `string`, **không comment**.
- Prompt VI (`prompts.ts:80`) còn giữ câu gốc "xác suất thành công khi phỏng vấn và khả
  năng vượt qua vòng lọc CV", nhưng **không được production dùng**: `analysisService.ts:64`
  luôn gọi `buildAnalyzePromptEn`; `buildAnalyzePromptVi` / `buildAnalyzePrompt` chỉ còn
  trong `src/__tests__/services/prompts.test.ts:2,7,219`.
- Documentation (`docs/5_api.md:45`) chỉ liệt kê tên field, không định nghĩa.
- Tests: `canonicalScoring.test.ts:51` đặt `'High'` / `'Medium'` nhưng **không assert gì
  về semantics**; `AnalysisDetailsTab.test.tsx:36-37` đặt cả hai `'Medium'`. Không có test
  nào chứng minh hai field khác nghĩa.

### 4.2 Historical producer (git): hai khái niệm khác nhau, rồi bị xoá định nghĩa

Commit đầu tiên `4d47a7c` (`src/services/geminiService.ts`):

```text
482  8. Ước tính xác suất thành công khi phỏng vấn.
483  9. Ước lượng khả năng vượt qua vòng lọc CV (Thấp, Trung bình, Cao).
484  10. Giải thích ngắn gọn lý do tại sao khả năng vượt qua vòng lọc CV lại ở mức đó.
```

EN tương ứng `:530-532`: "probability of success in an interview" /
"probability of passing the CV screening" / "explain why the probability of passing
the CV screening is at that level".

Schema lúc đó (`:616-617`):

```text
successProbability: { type: Type.STRING }                                  ← không enum
passProbability:    { type: Type.STRING, enum: ["Thấp","Trung bình","Cao"] } ← 3 mức
```

Tức định nghĩa ban đầu **là CASE A**: `successProbability` = khả năng thành công ở vòng
phỏng vấn (free-form), `passProbability` = khả năng vượt screening CV (3 mức).

Refactor `a6d4e74` (2026-05-27) gộp thành một bước và **xoá cả hai định nghĩa**
(`prompts.ts:36` VI, `:118` EN), đồng thời đưa JSON example trong đó **cả hai field cùng
giá trị "High"** (`:62-63` VI, `:144-145` EN):

```text
36   9. Ước tính xác suất thành công khi phỏng vấn và khả năng vượt qua vòng lọc CV.
62       "successProbability": "High",
63       "passProbability": "High",
```

Từ đó đến nay không có commit nào khôi phục định nghĩa. Enum hiện tại của cả hai là
`High/Medium/Low`, tức domain của `passProbability` đã được áp cho cả hai, còn domain
free-form của `successProbability` biến mất.

### 4.3 Kết luận ngữ nghĩa hiện tại (theo field)

**`successProbability`**

- Định nghĩa đang có hiệu lực: **không có**. Không prompt, schema description, comment,
  doc hay test nào định nghĩa nó.
- Nghĩa còn sót lại chỉ là tên field + ký ức lịch sử "interview success", nhưng:
  - không consumer nào hỏi câu "khả năng thành công khi phỏng vấn";
  - `passExplanation` (field duy nhất có thể giải thích) lại được render cạnh
    `passProbability`, không cạnh `successProbability` (`AnalysisDetailsTab.tsx:196-208`);
  - nó được hiển thị dưới nhãn chung "Xác suất".
- Kết luận: de facto là **"khả năng CV này phù hợp / vượt qua" phiên bản chung chung**,
  trùng câu hỏi với `passProbability`.

**`passProbability`**

- Định nghĩa đang có hiệu lực: **không có trong prompt/schema/type**. Bằng chứng duy nhất
  còn mang nghĩa là **UI label** "Khả năng pass vòng CV / CV Pass Probability"
  (`result.ts:75-78`) và tên field.
- `passExplanation` được thiết kế để giải thích nó (theo step 10 của `4d47a7c`), nhưng
  prompt hiện tại không còn instruction đó; model viết explanation từ tên field. Trong
  probe, explanation luôn đọc như giải thích cho giá trị `passProbability` (ví dụ
  matchScore 76, pass High: "The candidate is a strong match for the core technical
  requirements. They exceed the years of experience requirement…").
- Kết luận: intended semantics = **khả năng vượt vòng lọc CV / screening**, nhưng chỉ được
  carrier bởi label + tên field, không được producer định nghĩa.

---

## 5. Consumer map

| # | Surface | Product question | Field đọc | Nhãn | Ghi chú |
|---|---|---|---|---|---|
| 1 | `AnalysisDetailsTab` (candidate, 1 kết quả) | "Khả năng CV tôi vượt vòng lọc?" | `passProbability` | "Khả năng pass vòng CV" (`result.ts:75-78`) | Surface duy nhất dùng `passProbability`; cùng tab hiển thị `matchScore` (`:102`) và verdict theo `matchScore` (`:117-121`) |
| 2 | `HistoryView` list | "Kết quả phân tích trước đây là gì?" | `successProbability` | **không nhãn**, chỉ icon Target (`HistoryView.tsx:328-330`) | Card đã có `matchScore`; user đọc như "xác suất của analysis này" — cùng câu hỏi với #1 |
| 3 | `ComparisonOverview` (nhiều CV) | "CV nào khả năng cao nhất?" | `successProbability` | "Xác suất / Probability" (`result.ts:363-366`; render `ComparisonOverview.tsx:36,90`) | Sort theo `matchScore`, không theo probability (`:22,64`) |
| 4 | `CandidatePanel` (recruiter) | "Ứng viên này khả năng vượt screening / đáng shortlist?" | `successProbability`, fallback `passProbability` | "Xác suất / Probability" (`recruiter.ts:304-307`) | Hai field được coi là thay thế được (`CandidatePanel.tsx:339`) |
| 5 | Excel export (recruiter) | Như #4 | `successProbability`, fallback `passProbability` | "Xác suất" (`RecruiterContext.tsx:412`) | Cùng logic thay thế; sheet không có cột partial (Stage 3.12B) |

Không surface nào hiển thị đồng thời cả hai field. Nhưng #1 và #2/#3 cách nhau **một
click**: từ History list bấm vào item (`HistoryView.tsx:287-290`) sẽ mở đúng tab
`AnalysisDetailsTab`, tức chuyển từ `successProbability` sang `passProbability` của
**cùng một analysis**. Với kết quả có hai giá trị khác nhau, user thấy mâu thuẫn trực
tiếp.

Kết luận consumer: 4/5 surface trả lời cùng một câu hỏi sản phẩm bằng
`successProbability`; 2 surface còn tuyên bố hai field thay thế được cho nhau. Đây là
**duplicate semantic authority**, không phải hai product question.

---

## 6. Persistence / history behavior

- `history` có hai cột text từ schema gốc: `success_probability`, `pass_probability`
  (`supabase/migrations/20260516120000_cv_matcher_core_schema.sql:38-39`); không có
  `CHECK`, không có version, không có migration/backfill nào khác.
- Ghi: `saveToHistory` map 1:1 từ result (`historyService.ts:100-101`), không transform.
- Đọc: `mapHistory` trả `""` khi NULL (`historyService.ts:29-31`) — **khác** với default
  `'Medium'` lúc analyze. Vì vậy một row legacy/external thiếu cột sẽ render badge rỗng,
  không phải Medium.
- Recruiter: toàn bộ `AnalysisResult` được ghi nguyên vào `candidate_cvs.analysis_result`
  JSONB (`RecruiterContext.tsx:293`, `api/recruiter/save-analysis.ts:31,39-44`); migration
  ghi rõ "same shape as history"
  (`20260601300000_add_recruiter_campaigns.sql:43,57`). Không validate probability.
- `candidate_cvs` còn có cột `match_score` riêng — một bản sao thứ hai của score, không
  liên quan probability.
- Localization: `presentationItems()` (`localizeAnalysis.ts:24-37`) **không** chứa hai
  field probability → VI UI luôn thấy enum EN `High/Medium/Low`, trong khi
  `passExplanation`/`mainFactor` đã được dịch. Đây là behavior hiện tại, có chủ đích từ
  Stage 3.7 (immutable list), không phải bug của stage này.
- Không có rescore/recompute khi đọc history; history là snapshot.
- Export duy nhất: Excel (`RecruiterContext.tsx:412`), dùng raw string.
- Analytics/telemetry: không có event nào dùng probability (`grep` toàn repo; analytics
  chỉ quota — `docs/8_analytics.md`).
- Generated docs: `graft/src/components/recruiter/CandidatePanel.md:3` và
  `graft/src/context/recruiter/RecruiterContext.md:4` chỉ là mirror sinh tự động của type,
  không phải authority; không hand-edit.

---

## 7. Relationship với `matchScore`

### 7.1 Static: không có mapping

- Cả ba giá trị đến từ **một completion**, nhưng là ba output độc lập: `matchScore` là
  number (`analysisService.ts:169-175`), hai probability là string enum
  (`:216-217`). Không có đoạn code nào đọc field này để tính field kia.
- UI chỉ dùng `matchScore` cho màu/verdict/sort: `AnalysisDetailsTab.tsx:96-98` (>80/>60),
  `:117-121` (verdict), `ComparisonOverview.tsx:43-44`, `:22,64` (sort), `HistoryView.tsx:303-305`.
  Probability không tham gia logic nào.
- Vì vậy câu trả lời cho "1 canonical score + derived probability" là **không**: hiện có
  **3 scoring authority độc lập** (`matchScore`, `successProbability`, `passProbability`).

### 7.2 Empirical: 12 call live trên fixture tổng hợp

Chạy `scripts/benchmark-gemini-analyze.ts` (production `analyzeCV`, prompt/schema thật,
UI=en để không có localization; fixture synthetic, không PII) và tabulate bằng
`scripts/audit-probability-authority.ts`:

| sample | matchScore | success | pass | same |
|---|---|---|---|---|
| en-pdf-text | 95 | High | High | yes |
| en-complex-layout | 92 | High | High | yes |
| en-fullcv-cv-has-concepts | 92 | High | High | yes |
| en-pdf-scan-inline | 88 | High | High | yes |
| en-medium (run A) | 76 | Medium | **High** | **NO** |
| en-medium (repeat r3) | 76 | Medium | **High** | **NO** |
| en-medium (repeat r1) | 72 | Medium | **High** | **NO** |
| en-no-contact | 72 | Medium | Medium | yes |
| en-medium (repeat r2) | 72 | Medium | Medium | yes |
| en-medium (repeat r4) | 72 | Medium | Medium | yes |
| en-jd-concept | 68 | Medium | Medium | yes |
| en-fullcv-jd-only | 48 | Low | Low | yes |

Tổng: 12 call, 9 identical, **3 divergent (25%)**, 0 giá trị ngoài enum.

Đọc kết quả:

- Không có deterministic mapping: cùng `matchScore = 72` cho `passProbability` cả
  `High` và `Medium` (cùng fixture, cùng prompt). `successProbability` ổn định hơn trong
  mẫu này nhưng đó là quan sát, **không** phải invariant của code.
- `passProbability = High` xuất hiện ở score 72/76, trong khi `successProbability = High`
  chỉ xuất hiện từ 88 trở lên. Hai field "đo" hai ngưỡng khác nhau mà không có bảng ngưỡng
  nào trong code.
- Cùng một input lặp 5 lần (en-medium): score 76/72, success luôn Medium, pass đổi
  High/High/Medium/High/Medium → hai field được sample riêng; không field nào là hàm của
  field kia hay của score.

---

## 8. Contradiction findings

Phân loại theo yêu cầu:

### A. Expected semantic difference — **không còn hiệu lực**

Bằng chứng ủng hộ: định nghĩa gốc (`4d47a7c:geminiService.ts:482-484, 530-532`); trong
12 mẫu, `pass` không bao giờ thấp hơn `success` (9 bằng, 3 cao hơn), đúng chiều
"screening dễ hơn interview success".

Bằng chứng phủ định:

- định nghĩa bị xoá khỏi prompt từ `a6d4e74` và không quay lại; production chỉ dùng EN
  (`analysisService.ts:64`) — nơi hai field chỉ còn là hai cái tên;
- không consumer nào hỏi "interview success"; 4/5 surface dùng `successProbability` cho
  câu hỏi screening/phù hợp chung;
- hai field được dùng thay thế nhau trong recruiter panel/Excel (`CandidatePanel.tsx:339`,
  `RecruiterContext.tsx:412`);
- divergence không ổn định: cùng input, pass nhảy High/Medium; nếu là hai concept thật,
  phải có contract ổn định để bảo vệ chiều pass ≥ success.

Kết luận: A là **historical intent**, không phải semantic contract hiện tại.

### B. Representation difference — **không áp dụng**

Cả hai cùng enum `High | Medium | Low` (`responseSchema.ts:63-64`), cùng EN, cùng cách
render. Khác biệt representation duy nhất từng tồn tại (success free-form vs pass 3 mức)
đã biến mất khi cả hai bị ép cùng enum. Không có scale khác nhau.

### C. Duplicate authority — **đúng, operative**

Cùng concept "khả năng CV vượt qua / phù hợp", cùng một bước prompt, cùng domain, hai
authority độc lập, không cross-check, được thay thế nhau ở consumer, và quan sát thấy
lệch 25%.

### D. Legacy divergence — **một phần**

`successProbability` giữ **nghĩa cũ** (interview success) như một legacy orphan: nghĩa
đó không còn producer/consumer, nhưng field thì vẫn là field được dùng nhiều nhất.
`passExplanation` cũng là orphan tương tự: được generate/localize/render nhưng prompt
hiện tại không định nghĩa nó giải thích field nào. Không field nào là dead authority —
cả hai đều còn được ghi và đọc.

---

## 9. Authority classification

# **CASE B — DUPLICATE SEMANTIC AUTHORITY**

Hai field thực chất phục vụ **một** product question — "CV này có khả năng vượt qua /
phù hợp với JD đến đâu" — nhưng có hai authority độc lập do model sinh, hai cột lưu, và
được các surface khác nhau đọc thay thế nhau. Đây là architecture debt.

Không chọn A vì định nghĩa phân biệt không còn tồn tại trong producer/consumer hiện tại.
Không chọn C vì không có deterministic derivation nào (và observed data chứng minh không
phải hàm của `matchScore`). Không chọn D vì không field nào chết — cái chết là **nghĩa**
của `successProbability`, không phải field. Không chọn E vì evidence đã đủ để kết luận
duplicate; phần chưa biết duy nhất là phân bố giá trị legacy trong production (xem §11).

---

## 10. Recommended Stage 3.13B scope

**Không implement ở stage này.** Đề xuất hướng, theo thứ tự:

### 10.1 Chọn canonical authority

Đề xuất: **`passProbability` là canonical semantic** (screening pass), vì:

- đây là field duy nhất có label sản phẩm rõ nghĩa ("Khả năng pass vòng CV");
- `passExplanation` đã tồn tại để giải thích nó;
- recruiter panel/Excel thực chất đang hỏi câu screening-pass nhưng lại đọc
  `successProbability` — đổi consumer sang canonical sẽ sửa đúng mismatch này;
- `successProbability` là field có nghĩa legacy không còn consumer riêng.

Tên field/DB giữ nguyên ở 3.13B; chỉ đổi **ai được quyền sinh giá trị**.

### 10.2 Canonical model (recommendation)

```text
matchScore (0–100)  ──┐
                      ├──► canonicalProbability (High | Medium | Low)   ← deterministic, code-side
detailedComparison    │        ├── Candidate representation: "Khả năng vượt vòng lọc CV"
  required gaps ──────┘        └── Recruiter representation:  "Khả năng vượt sàng lọc"
```

- Mapping phải là bảng ngưỡng tường minh, versioned (`probabilityVersion`, cùng pattern
  `scoreVersion`), dùng `detailedComparison` (authority Stage 3.12B) — **không** dùng
  `matchingPoints`/`missingGaps` legacy, **không** dùng `categoryScores` (non-additive).
- Gate theo required gaps: ví dụ missing required → cap mức thấp; partial required → trần
  trung bình; chỉ nice-to-have gaps → không hạ. Bảng cụ thể là việc của 3.13B, kèm
  property test "cùng matchScore + cùng required-gap status ⇒ cùng probability".
- Model **không còn được sinh** `successProbability`/`passProbability`; staged:
  1. vẫn generate để không phá schema, nhưng server bỏ qua và tính canonical;
  2. bỏ khỏi prompt/schema required;
  3. deprecate field/column sau compatibility window.

### 10.3 Consumer migration

| Surface | Sau 3.13B |
|---|---|
| AnalysisDetailsTab | canonical value, label giữ "Khả năng pass vòng CV" |
| HistoryView | canonical value + label rõ (bỏ icon-only), hoặc bỏ khỏi card vì đã có `matchScore` |
| ComparisonOverview | canonical value, header "Khả năng vượt vòng lọc" thay "Xác suất" |
| CandidatePanel | canonical value, label "Khả năng vượt sàng lọc" |
| Excel | canonical value, render theo ngôn ngữ sheet |

Bỏ fallback `successProbability || passProbability`; thay bằng một hàm đọc duy nhất.

### 10.4 Legacy rule

- Row cũ (`probabilityVersion` NULL) **không rescore**: hiển thị đúng field mà surface đó
  vẫn hiển thị từ trước (success cho list/comparison/recruiter, pass cho detail) để không
  đổi lịch sử; row mới hiển thị canonical ở mọi surface.
- Không migrate, không xoá cột, không backfill.
- API: giữ cả hai field trong response/schema cho tới khi hết compatibility; field legacy
  trả nguyên giá trị đã lưu (không tính lại).

### 10.5 Out of scope cho 3.13B

`categoryScores` vs `matchScore`; dọn `matchingPoints`/`missingGaps`; partial column cho
recruiter/Excel; đổi model/score calibration.

---

## 11. Risks / compatibility concerns

1. **Legacy values ngoài enum.** Ở `4d47a7c`, `successProbability` không có enum → DB cũ
   có thể chứa `"70%"`, `"Cao"`, `"High"`… `.history` là text không CHECK. Mọi renderer
   mới phải chịu được giá trị lạ; không được coerce row cũ sang enum mới.
2. **Trộn VI/EN.** Row legacy có thể là `Cao/Trung bình/Thấp`; `AnalysisDetailsTab.tsx:189-190`
   hiện chấp nhận cả 3 cách viết cho `passProbability`. Nếu gom về một renderer dùng
   `t.high/medium/low`, phải map alias legacy trước khi so sánh.
3. **Excel đang trộn ngôn ngữ**: giá trị raw (EN) nằm cạnh header Việt; nếu canonical là
   enum EN thì sheet vẫn trộn. 3.13B nên render label theo ngôn ngữ sheet.
4. **API contract.** `docs/5_api.md:45` liệt kê cả hai field; xoá/đổi kiểu là breaking với
   client cũ và với `candidate_cvs.analysis_result` đã lưu. Phải staged như §10.2.
5. **Schema required.** `responseSchema.ts:113-117` yêu cầu cả hai field; nếu prompt ngừng
   sinh nhưng schema vẫn required, model có thể bịa giá trị để thoả schema → phải đổi
   schema cùng lúc với prompt, hoặc bỏ qua output (staged option 1).
6. **Recruiter JSONB không schema.** `candidate_cvs.analysis_result` có thể thiếu field
   (row cũ/import tay); fallback hiện tại che lỗi này. Canonical reader cần fallback rõ
   ràng, không crash.
7. **Hai bản copy của matchScore.** `candidate_cvs.match_score` và
   `analysis_result.matchScore` có thể lệch (đã có từ trước); đừng thêm bản copy thứ ba
   của probability.
8. **Boundary noise.** `matchScore` có sd ~1–3 (roadmap `:121`); mapping ngưỡng cứng sẽ
   làm badge nhảy quanh biên. Nên dùng band thô + `probabilityVersion`, không hứa
   "chính xác đến 1 điểm".
9. **Không derive từ nguồn sai.** Sau Stage 3.12B, `matchingPoints`/`missingGaps` là
   non-authoritative; probability mới phải đọc `detailedComparison`.
10. **Localization invariant.** Hai field đang nằm ngoài `presentationItems()`
    (`localizeAnalysis.ts:24-37`); nếu chuyển sang render-time translation thì giữ nguyên
    `machineProjection` test và không đưa probability vào payload dịch.
11. **Test fixture sẽ vỡ có chủ đích.** `canonicalScoring.test.ts:51` hard-code
    `'High'`/`'Medium'` và `machineProjection` equality; 3.13B phải sửa fixture một cách
    có ý thức, không nới assertion.
12. **Model preview retirement** (roadmap `:108`) có thể đổi calibration probability;
    deterministic mapping loại bỏ rủi ro này — thêm lý do chọn hướng §10.2.
13. **Chưa đo production.** Audit này không đọc DB thật; tỷ lệ row legacy có giá trị lạ
    là chưa biết. 3.13B nên sample read-only `history.success_probability` distinct
    values trước khi chốt alias map.
14. **Generated files.** `graft/*.md` là mirror; regenerate, không sửa tay.

---

## 12. Exact evidence references

**Types / schema / producer**

- `src/services/ai/types.ts:139-142` — `successProbability`, `passProbability`,
  `passExplanation`, `mainFactor` đều `string`, không comment.
- `_server-lib/ai/responseSchema.ts:63-66` — hai enum giống nhau, không description.
- `_server-lib/ai/responseSchema.ts:113-117` — cả hai nằm trong `required`.
- `src/services/ai/prompts.ts:218` — step 8 EN (production) gộp hai field, không định nghĩa.
- `src/services/ai/prompts.ts:80` — step 8 VI (test-only) còn nhắc "phỏng vấn" và "vòng lọc CV".
- `src/services/ai/prompts.ts:38,176` — `passExplanation`/`mainFactor` chỉ xuất hiện trong evidence rule.
- `_server-lib/ai/analysisService.ts:64` — production luôn `buildAnalyzePromptEn`.
- `_server-lib/ai/analysisService.ts:169-175` — `matchScore` numeric coercion.
- `_server-lib/ai/analysisService.ts:216-217` — hai fallback `|| 'Medium'` độc lập.
- `_server-lib/ai/localizeAnalysis.ts:24-37` — probability không nằm trong presentation items.
- `src/services/ai/resultPayloadNormalize.ts:299-315` — không normalize probability.

**Persistence**

- `supabase/migrations/20260516120000_cv_matcher_core_schema.sql:38-39` — hai cột text.
- `src/services/historyService.ts:29-31` — map đọc, `""` khi NULL.
- `src/services/historyService.ts:100-101` — map ghi 1:1.
- `src/services/historyService.ts:112` — `language` là presentation language (không liên quan probability).
- `supabase/migrations/20260601300000_add_recruiter_campaigns.sql:43,57` — `analysis_result` JSONB "same shape as history".
- `src/context/recruiter/RecruiterContext.tsx:293` — ghi nguyên analysis vào JSONB.
- `api/recruiter/save-analysis.ts:31,39-44` — không validate probability.
- `src/services/recruiterService.ts:69` — đọc raw JSONB.

**Consumers**

- `src/components/views/result/ComparisonOverview.tsx:36,90` — `successProbability`.
- `src/components/views/result/ComparisonOverview.tsx:22,64` — sort theo `matchScore`.
- `src/components/views/result/ComparisonOverview.tsx:43-44` — màu theo `matchScore`.
- `src/components/views/HistoryView.tsx:287-290` — click history → mở detail.
- `src/components/views/HistoryView.tsx:328-330` — `successProbability`, không nhãn.
- `src/components/views/result/AnalysisDetailsTab.tsx:102` — `matchScore` cùng tab.
- `src/components/views/result/AnalysisDetailsTab.tsx:117-121` — verdict theo `matchScore`.
- `src/components/views/result/AnalysisDetailsTab.tsx:186-193` — `passProbability` + màu theo 3 alias.
- `src/components/views/result/AnalysisDetailsTab.tsx:196-208` — `passExplanation` + `mainFactor`.
- `src/components/recruiter/CandidatePanel.tsx:28-29` — type optional cả hai.
- `src/components/recruiter/CandidatePanel.tsx:339` — `successProbability || passProbability || '—'`.
- `src/context/recruiter/RecruiterContext.tsx:387-388,412` — Excel `'Xác suất'` dùng fallback.
- `src/translations/result.ts:75-78` — "Khả năng pass vòng CV".
- `src/translations/result.ts:363-366` — "Xác suất / Probability".
- `src/translations/recruiter.ts:304-307` — "Xác suất / Probability".

**Tests / docs**

- `src/__tests__/services/canonicalScoring.test.ts:51` — fixture `High` / `Medium`, không assert semantics.
- `src/__tests__/components/AnalysisDetailsTab.test.tsx:36-37` — fixture `Medium` / `Medium`.
- `docs/5_api.md:45` — API liệt kê cả hai field, không định nghĩa.
- `docs/3_frontend.md:114,144` — mô tả panel/Excel dùng "probability"/"Xác suất".
- `docs/12_canonical_scoring.md:184` — Stage 3.7 không đổi probability.
- `docs/superpowers/plans/2026-10-28-gemini-ai-fidelity-roadmap.md:95,98,112` — debt đã biết.

**Git history**

- `4d47a7c:src/services/geminiService.ts:482-484` — VI: interview success + CV-screening pass + explanation.
- `4d47a7c:src/services/geminiService.ts:530-532` — EN tương ứng.
- `4d47a7c:src/services/geminiService.ts:616-617` — `successProbability` free-form; `passProbability` enum VI 3 mức.
- `4d47a7c:src/services/geminiService.ts:692` — cả hai required.
- `4d47a7c:src/App.tsx:2543` — cột comparison header generic "Xác suất".
- `a6d4e74:src/services/ai/prompts.ts:36,118` — gộp instruction, xoá định nghĩa.
- `a6d4e74:src/services/ai/prompts.ts:62-63,144-145` — JSON example cả hai `"High"`.

**Generated mirrors (không phải authority)**

- `graft/src/components/recruiter/CandidatePanel.md:3`
- `graft/src/context/recruiter/RecruiterContext.md:4`

---

## Appendix — audit commands và chi phí

```bash
# 8 call, 8 fixture EN (không localization), production analyzeCV
RUNS=1 UI=en CONCURRENCY=3 node --env-file=.env --env-file=.env.local \
  node_modules/.bin/tsx scripts/benchmark-gemini-analyze.ts /tmp/stage-3-13a-prob

# 4 call lặp trên một fixture để đo tính ổn định
RUNS=4 ONLY=en-medium UI=en CONCURRENCY=2 node --env-file=.env --env-file=.env.local \
  node_modules/.bin/tsx scripts/benchmark-gemini-analyze.ts /tmp/stage-3-13a-prob-repeat

# Tabulate (read-only, không gọi mạng)
node node_modules/.bin/tsx scripts/audit-probability-authority.ts \
  /tmp/stage-3-13a-prob/raw /tmp/stage-3-13a-prob-repeat/raw
```

Tổng: 12 call, **$0.1049** (pricing trong `src/lib/geminiModels.ts`), fixture synthetic
trong `scripts/benchmark-gemini-fixtures.ts`, không PII, không production API. Raw JSON
nằm ngoài repo (`/tmp/...`), không commit.

**Characterization test:** không thêm. Behavior hiện tại được chứng minh bằng code 2 dòng
(`analysisService.ts:216-217`) + probe; một test freeze `'Medium'` sẽ phải sửa ngay ở
3.13B. Nếu 3.13B cần, test đó phải ghi rõ `AUDIT TEST ONLY — freezes current behavior`.

---

## TL;DR cho Stage 3.13B

`passProbability` = khả năng vượt screening (có label, có explanation). `successProbability`
= bản trùng không còn nghĩa riêng nhưng đang được 4/5 surface dùng. Chọn một canonical,
sinh **deterministic từ `matchScore` + required gaps của `detailedComparison`**, versioned,
giữ legacy read-only, migrate 5 consumer, không rescore.
