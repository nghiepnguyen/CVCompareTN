# Application Review (P1B)

Ứng viên kiểm tra **CV + JD + Cover Letter** trước khi gửi. P1B là lớp
**advisory**: không phải ATS score, không có điểm, %, readiness hay
probability. Không đọc/ghi `matchScore`, category scores, requirement status,
`verification`, probability, `scoreVersion`, parsed CV; không persist; không
feed ngược vào analyze.

## Contract

`POST /api/rewrite-cv` + `action: 'application_review'` (cùng function với
Full CV và P1A — function count giữ 9).

Request:

```json
{ "action": "application_review", "jd": "...", "parsedCV": {}, "coverLetter": "...",
  "language": "vi", "employerName": "...", "roleTitle": "...",
  "requirements": [{ "requirement": "...", "status": "matched", "priority": "required" }] }
```

- `employerName`/`roleTitle`: tên P1A đã xác minh trong JD và dùng làm ngoại lệ
  khi validate thư (P1A response 200 giờ trả kèm). Server **xác minh lại**
  (`verifiedName`: phải có nguyên văn trong JD) — tên không có trong JD không
  được miễn. Thiếu tên → tên employer trong thư bị báo là không có trong CV.
- `requirements`: requirement + status canonical của analysis (context, không
  phải authority). Tối đa 40 mục × 200 ký tự, status khác
  `matched|partial|missing` bị bỏ.
- `language`: ngôn ngữ message của findings (= ngôn ngữ thư trong UI).
- Giới hạn: CV serialize ≤ 30k ký tự, thư ≤ 8k (413). JD, thư, tên và
  requirement đều qua `stripInvisibleControls`.

Response 200: `{ verdict: 'ready' | 'review', findings, language, revisedCoverLetter? }`,
finding = `{ category, severity, message, source }`.
Lỗi: 400/401/403/413/429/503, 504 (timeout, `retryable`), 500 (Gemini hoặc
reviewer trả output không đọc được). Client map status → translation key.

## Pipeline (tối đa 2 Gemini call / request)

1. **Precheck deterministic** — `validateCoverLetter` của P1A (không đổi, không
   nới), cùng exemption tên. Mỗi violation → finding server-authored:
   number/spelled-number → `numeric_claim` HIGH; raw-JD/term →
   `unsupported_claim` HIGH; strength-claim/JD-copy → `unsupported_claim`
   MEDIUM. Message không chứa tên guard nội bộ.
2. **Reviewer** (call 1) — prompt riêng (`buildReviewInstruction`), rule ở
   `systemInstruction`, CV/JD/REQUIREMENTS/COVER LETTER là block data trong
   user turn. Model trả `findings[{category, support, quote, requirementId,
   message}]` — **không** trả severity hay verdict.
3. **Anchoring server-side** (`acceptReviewerFindings`) — finding bị bỏ khi:
   - claim (`unsupported_claim`/`numeric_claim`/`consistency`) không có
     `quote` hoặc quote không có nguyên văn trong thư (hallucination);
   - quote có nguyên văn trong CV (được CV hỗ trợ);
   - trùng concept precheck đã báo;
   - `requirement_gap` không trỏ tới requirement `matched`/`partial` có thật,
     hoặc thư **đã đề cập** requirement đó (`requirementCoveredByLetter`, P1B.1).
     Gap trên requirement `missing` không bao giờ được báo (`missing ≠ thất
     bại`, và thư không được claim nó).
   Severity theo bảng server: numeric/consistency HIGH; unsupported_claim
   `unsupported` HIGH, `overstated`/`uncertain` MEDIUM; requirement_gap MEDIUM;
   relevance/tone LOW.
4. **Verdict** (`verdictFor`, server): `review` nếu có HIGH hoặc MEDIUM
   *factual* (unsupported_claim/numeric_claim/consistency); ngược lại `ready`.
   LOW và gap MEDIUM có thể đi cùng `ready`. `ready` = review này không phát
   hiện vấn đề factual/consistency — **không** có nghĩa là sẽ đậu/được phỏng vấn.
   Reviewer không thể xoá finding deterministic (guard thắng khi bất đồng).
5. **Revision** (call 2, tối đa 1) — chỉ khi verdict `review` và còn ≥ 20s
   (`REWRITE_RETRY_MIN_BUDGET_MS`). Input: thư gốc, CV, findings có cấu trúc
   (concept/quote, không có prose của reviewer), tên đã xác minh — **không có
   raw JD** (giống P1A retry). Rule: chỉ xoá hoặc viết lại đúng mức CV nêu,
   không thêm câu thay thế, giữ ngôn ngữ thư.
6. **Validation cuối** — revision chỉ được trả khi qua `validateCoverLetter`
   (cùng exemption) **và** không còn quote nào đã bị flag. Không qua → bỏ
   revision, verdict vẫn `review`. Verdict luôn mô tả thư đã gửi lên; revision
   là đề xuất, không re-review (không loop).

Reviewer lỗi/timeout → 500/504, không bao giờ trả `ready` chỉ từ precheck.
Revision lỗi → 200 không có `revisedCoverLetter`.

## Requirement coverage (P1B.1)

`requirementCoveredByLetter({ requirement, cvEvidence }, letter)` — deterministic,
không gọi Gemini. Coverage ≠ satisfaction: không đổi status/verification, chỉ
quyết định gap reviewer đề xuất có bị bỏ không.

- Tách alternative theo "or"/"hoặc": một alternative đủ là covered.
- **Concept có tên** (token có chữ hoa: React, TypeScript, WCAG, Next.js) →
  tất cả phải có trong thư (whole token, normalization của guard). Từ viết hoa
  đứng đầu requirement đi kèm danh sách tên ("React and TypeScript") cũng bắt
  buộc → multi-concept cần đủ.
- Không có concept có tên → mọi content word không generic phải có; chỉ có từ
  generic ("design systems") thì cụm đó phải có. Threshold số ("3+ years"),
  từ proficiency/"experience"/"application development" bị bỏ qua — thư không
  cần nhắc lại threshold, nhưng overlap generic không bao giờ là coverage.
- **cvEvidence bridge** chỉ khi requirement không có concept có tên: concept có
  tên trong `cvEvidence` canonical phải *đều* có trong thư ("Component tests" ←
  evidence "wrote tests with Jest" ← thư "testing with Jest"). Evidence một mình
  không bao giờ covered. Client gửi kèm `cvEvidence` (≤ 200 ký tự, sanitize).
- Không dịch: tên công nghệ tự khớp cross-language; requirement chỉ có từ
  thường VI vs thư EN sẽ không covered (giữ gap — bảo thủ).

Root cause trước P1B.1 (smoke production 2026-11-02, 3/3 review có gap sai):
server chỉ bỏ gap khi *nguyên câu* requirement có trong thư ("3+ years of
React" ≠ "React and TypeScript web apps"); requirement thật "Component tests"
được thư thể hiện qua Jest mà server không có cầu nối evidence.

## Deadline

Một request deadline (65s, AI 59s) chung cho reviewer và revision
(`reviewApplication(input, aiDeadline)`); mỗi call có `abortSignal` +
race với deadline. Không call nào nhận budget mới; không retry timeout.

## Quota

Không có monthly quota. **Document cap chung** cho P1A + P1B: đếm
`analysis_log` `kind='rewrite'` có `guard_metrics->coverLetter` hoặc
`guard_metrics->applicationReview` (filter `.or(...)`), giới hạn
`ceil(hourlyAiLimit(plan)/2)` request (free: 5/giờ). Cap Full CV vẫn đếm mọi
row rewrite, nên thư + review dùng tối đa nửa ngân sách Full CV. Một row /
request; review = 1–2 call → tối đa `2 × cap` Gemini call/giờ từ documents
(cùng tiền lệ P1A retry). Không migration.

## UI

Nút **Kiểm tra hồ sơ ứng tuyển / Review Application** nằm *trong* dialog Cover
Letter, cạnh Sao chép, chỉ hiện khi đã có thư (thư chỉ tồn tại trong state
dialog — khác vị trí header gợi ý trong spec, có chủ ý để không thêm nút
header trên mobile). Kết quả: Sẵn sàng / Cần kiểm tra + findings nhóm theo
Cao/Trung bình/Thấp + "Bản đã chỉnh" (Sao chép, Dùng bản đã chỉnh → thay thư
trong bộ nhớ, giữ tên). Review reset khi tạo lại thư, đổi ngôn ngữ, đổi
result; tạo thư và review khóa lẫn nhau. Result mở từ History không có thư
(P1A cần JD session) nên cũng không có review.

## Observability

Một row / request, `guard_metrics.applicationReview` (xem
[11_guard_metrics.md](./11_guard_metrics.md)): `language`, `outcome`
(`ready|review|error`), `category` (lỗi), `deterministic` (counts theo
reason), `severity`, `categories`, `droppedFindings`, `revision`
(`not_needed|skipped_budget|error|invalid|shipped`), `geminiCalls`; tokens,
latency, model ở cột chuẩn. Không log CV, JD, thư, revision, message hay quote.

## Benchmark

`scripts/benchmark-application-review.ts` (production service, Gemini thật):
17 fixture — clean (thư P1A thật + thư viết tay), JD-only skill, số, employer,
certification, project, claim chữ thường guard không thấy (một claim có gợi ý
trong REQUIREMENTS, một claim không), puffery
(expert in Canva / professional proficiency in English / deep understanding),
requirement bị bỏ sót, bẫy requirement ngoài JD, injection trong JD / CV / thư
(+ ký tự ẩn; cả ba dùng claim *không* có gợi ý), cross-language VI→EN và
EN→VI. Fixture rủi ro cao × 5, còn lại × 3.

Kết quả P1B (2026-11-02, 73 run): missed deterministic 0, revision không an toàn
0, HIGH sai trên thư grounded 0, injection thành công 0, requirement bịa 0,
false-negative HIGH 0; claim chỉ reviewer thấy được 30/30; gap recall 3/3;
revision 55/55 ship (kiểm tay: chỉ xoá/làm nhẹ câu bị flag, không thêm câu);
0 lỗi ngôn ngữ message/revision. Latency 0,8–2,9s. Nhánh revision bị guard
từ chối / lỗi / hết budget không xảy ra với model thật — chỉ có unit test.

P1B.1 (+8 fixture gap × 5: covered React / Jest-qua-evidence / Figma /
cross-language VI, missing React / Jest, bẫy generic, multi-concept): full run
25 fixture / 113 run — 4 gate = 0, gap sai 0/20 (reviewer vẫn *đề xuất* gap sai
ở phần lớn run covered; server bỏ hết), recall gap 23/23; run riêng phần gap
20/23 (3 lần sót ở multi-concept do reviewer không đề xuất, server không bỏ).
Gộp recall 43/46.

## Known debt

- **`rawJdConcepts` đọc dòng JD viết hoa một phần như acronym** (≤ 6 chữ:
  "MUST HAVE: React" → `MUST`, `HAVE`; "NOTE TO THE …" → `NOTE`, `THE`), nên
  thư/rewrite chứa từ thường đó bị coi là raw-JD. Có sẵn từ trước. Ảnh hưởng
  thật: P1A fallback, Full CV retry/fallback, suggestion bị drop. Trong UI,
  P1B không gặp (thư review đã qua đúng guard này với cùng JD/tên); chỉ caller
  API trực tiếp mới thấy HIGH sai. Không sửa ở P1B vì guard dùng chung và spec
  cấm đổi ngữ nghĩa P1A/Full CV — cần PR riêng có benchmark.
- Revision không được review lại: claim định tính *mới* (nếu model thêm) chỉ
  bị chặn bởi guard lexical; benchmark không thấy trường hợp nào.
- Verbatim-in-CV chỉ bắt quote liền mạch; "professional working proficiency
  in English" với CV "English — Professional working proficiency" vẫn có thể
  bị reviewer báo overstated (MEDIUM, không HIGH).
- Severity `unsupported` vs `overstated` do model chọn → cùng một puffery có
  run HIGH, có run MEDIUM (verdict giống nhau).
- Tên employer/role JD-steered (debt P1A) vẫn áp dụng cho exemption.
- Không sửa/nhập thư thủ công; chỉ review thư P1A trong session (P2A).
- Smoke production 2026-11-02: luồng VI/EN, verdict, cap 429, History đạt;
  "Dùng bản đã chỉnh"/copy bản chỉnh trên UI chưa bấm thử (chỉ unit test).
- **Đã thấy trên production:** reviewer bỏ sót tô điểm định tính trong thư P1A
  thật ("proficient in using Figma", "comprehensive testing") → task chất
  lượng reviewer riêng (đổi độ nhạy có thể tăng false positive).
- Message finding theo ngôn ngữ thư, có thể khác ngôn ngữ UI (UX, chưa đổi).
- Coverage là lexical: requirement chỉ có từ thường VI vs thư EN (hoặc diễn
  đạt khác hẳn) vẫn giữ gap; recall gap phụ thuộc reviewer có đề xuất hay không.
