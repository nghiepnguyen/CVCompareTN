# Kế hoạch tích hợp ý tưởng từ ai-job-search vào cvFit

-   Ngày lập ban đầu: 24/10/2026.
-   Cập nhật: 01/11/2026.
-   Trạng thái: Backlog ưu tiên --- triển khai theo từng stage, không
    port nguyên stack upstream.
-   Repo tham khảo: https://github.com/ai-job-search-dev/ai-job-search
    (nhánh `master`).
-   Revision nghiên cứu ban đầu:
    `eb0fcd71fb37dcec582345f2b23c7b20135d2975` (MIT).
-   Phạm vi: học workflow, trust boundary, factual grounding,
    application package, outcome/tracker và interview preparation; không
    đưa Claude Code/Python/Bun/LaTeX vào runtime cvFit.

## 1. Mục tiêu sản phẩm

Mở rộng cvFit theo lộ trình tự nhiên từ công cụ phân tích CV/JD thành
workspace hỗ trợ toàn bộ giai đoạn ứng tuyển:

`Phân tích → tối ưu hồ sơ → lưu ứng tuyển → theo dõi → chuẩn bị phỏng vấn`

Việc mở rộng phải giữ nguyên core hiện tại: Next.js/React, Gemini phía
server, Supabase, R2 và canonical scoring. Candidate flow hiện có không
được bị chậm hoặc phức tạp hơn chỉ vì các tính năng mới.

Ưu tiên triển khai:

1.  Authority và độ tin cậy của dữ liệu.
2.  Cover letter.
3.  Review hồ sơ tùy chọn.
4.  Lưu application + snapshot.
5.  Application tracker.
6.  Follow-up.
7.  Interview preparation.
8.  Multi-JD intelligence.
9.  Job discovery chỉ sau khi có dữ liệu chứng minh nhu cầu.

MVP mới dừng ở P0--P2C. P3/P4 chỉ mở khi usage và feedback đủ rõ.

## 2. Nguyên tắc tích hợp upstream

`ai-job-search` hiện là workflow agent/CLI, không phải web app. Vì vậy
cvFit chỉ port **ý tưởng, rule và workflow**, không port implementation.

### Nên lấy

-   Factual grounding: không thêm kỹ năng, công ty, mốc thời gian, số
    liệu, thành tích hoặc credential không có nguồn.
-   Requirement coverage: requirement phải được matched, gapped hoặc
    đánh dấu chưa xác minh; không im lặng bỏ qua.
-   Trust boundary: JD/posting là dữ liệu không đáng tin, không phải
    instruction.
-   Drafter → Reviewer → Revision, nhưng reviewer là thao tác tùy chọn.
-   Application archive/snapshot: giữ đúng JD, CV và cover letter thực
    tế đã dùng cho từng application.
-   Tracker status và logic follow-up.
-   Interview prep dựa trên đúng application snapshot.
-   Tư duy multi-job ranking và cross-JD skill gap.

### Không port vào MVP

-   Claude Code command system.
-   Python/Bun runtime.
-   LaTeX pipeline.
-   Crawler Đan Mạch.
-   Gmail sync.
-   Notion sync.
-   Salary tool.
-   HTML report.
-   Tự động gửi email/hồ sơ.
-   Company research cache.
-   Tự hiệu chỉnh xác suất tuyển dụng từ outcome ít.

## 3. Nền tảng cvFit hiện tại

cvFit đã có nền tảng tốt để tích hợp mà không viết lại core:

-   `ParsedCV`, canonical analysis, requirement comparison, evidence và
    format assessment.
-   `ComparisonItem` đã có `requirement`,
    `status: matched | partial | missing`, `cvEvidence`,
    `priority: required | nice-to-have`.
-   Canonical `matchScore` là authority; `passProbability` được suy ra
    từ score.
-   Parsed CV đã chạy độc lập/sớm hơn analysis.
-   Full CV rewrite đã có fidelity guard, numeric guard, raw-JD guard và
    validation/fallback.
-   Candidate và Recruiter đã thống nhất requirement-status authority.
-   JD hiện hỗ trợ text, `.txt`, `.md`, `.pdf`, `.docx`.
-   Gemini chạy phía server; shared business logic nằm trong
    `_server-lib/`.
-   History không phù hợp làm kho application lâu dài vì có
    lifecycle/limit riêng.
-   R2 cleanup và account deletion đã tồn tại nên application documents
    phải được đưa vào cùng lifecycle.
-   API/function budget đang bị giới hạn; ưu tiên mở rộng handler hiện
    có bằng `action`, không tạo endpoint mới nếu không cần.

### Hệ quả đối với plan cũ

P0 cũ không còn được triển khai nguyên xi. Một phần factual guard đã
được Stage 3.x giải quyết. P0 mới phải bắt đầu bằng audit trạng thái
production hiện tại để tránh làm lại guard đã ship.

## 4. Tác động dự kiến lên web

### P0--P1B

Tác động nhỏ. Khoảng 85--90% information architecture candidate hiện tại
có thể giữ nguyên.

Flow:

`Upload CV + JD → Analyze → Results → Requirements / Suggestions / Optimized CV / Cover Letter`

Không cần thay homepage, upload flow hoặc Recruiter flow.

### P2 trở đi

Từ P2, cvFit bắt đầu chuyển từ CV analyzer thành application workspace.

Navigation candidate dự kiến:

`Analyze | Applications | History | Account`

Có thể tiếp tục tối giản mobile navigation sau khi test usage; không bắt
buộc đưa History thành primary tab nếu không đủ nhu cầu.

Recruiter nằm ngoài scope của integration này và không được thay đổi
behavior trong MVP.

## 5. Roadmap cập nhật

## P0 --- Authority & Reliability Audit

**Mức tác động:** Backend trung bình, DB thấp, UI thấp.\
**Mục tiêu:** bổ sung phần authority còn thiếu mà không làm lại Stage
3.x.

**Trạng thái (01/11/2026):** DEPLOYED / PRODUCTION VERIFIED ✅.
PR [#59](https://github.com/nghiepnguyen/CVCompareTN/pull/59) merge
`bca3174`. Production smoke đã cover đủ ba nhánh `Đạt` / `Không đạt` /
`Chưa xác minh`, gồm shortfall deterministic và nguyên tắc
`missing ≠ unmet`. P0 đóng — không cần benchmark/test thêm. Authority:
`docs/12_canonical_scoring.md` (mục "Requirement verification (P0)").

Kết quả:

-   Factual/numeric/skills/raw-JD guard, full-CV validation + retry +
    fidelity fallback, probability authority đã có từ Stage 3.x → giữ
    nguyên, gỡ khỏi backlog.
-   `verification` (met/unmet/unknown) được derive **deterministic sau**
    canonical Gemini response (`deriveRequirementVerification`), không do
    model sinh; không đổi status/matchScore/category/probability.
-   `jdEvidence`: REMOVED (UI dùng requirement + cvEvidence + verification).
-   Unicode sanitizer: SHIPPED. Fence JD/CV: REMOVED (benchmark cho thấy
    calibration shift). Untrusted prose rule: DEFERRED. `systemInstruction`:
    DEFERRED (experiment riêng có calibration benchmark).
-   Debt chuyển tiếp (không chặn P1A): trust boundary mức prompt
    (`systemInstruction`) cần benchmark calibration riêng; verifier mới hỗ
    trợ IELTS + số năm; `met` kế thừa authority `matched` của canonical.
-   Benchmark PRE `8590a6f` vs final: full set 17 fixture (19 cặp
    sample×ngôn ngữ UI) × 3 run median Δ 0, MAD 1.18, max 3.0, không |Δ|>5;
    focused 12 cặp × 5 run MAD 1.03 so với PRE gộp. Model-generated verification (P0/P0.1) và prose rule bị loại vì
    làm lệch score.

### Công việc

-   [x] Chốt baseline CV/JD Việt--Anh và các production fixtures hiện
    có. *(`scripts/benchmark-gemini-fixtures.ts`, gồm case P0)*
-   [x] Audit lại rewrite/analyze guards sau Stage 3.x: factual
    fidelity, numeric, skills, raw-JD, full-CV validation, fallback.
-   [x] Xóa khỏi backlog các guard đã có authority tương đương.
-   [x] Bổ sung mandatory-requirement verification bằng field optional,
    không mở rộng union `status`.
-   [x] Candidate field: `verification?: 'met' | 'unmet' | 'unknown'`
    (deterministic). `jdEvidence` đã thử và bỏ.
-   [x] Phân biệt rõ:
    -   `missing` = CV chưa match requirement.
    -   `unmet` = có bằng chứng không đạt.
    -   `unknown` = thiếu dữ liệu để xác minh.
-   [x] Không suy đoán bằng cấp, chứng chỉ, ngoại ngữ, quyền làm việc,
    địa điểm hoặc số năm kinh nghiệm khi source không đủ.
-   [x] Audit trust boundary của analyze/rewrite: instruction phải tách
    khỏi JD/CV data.
-   [x] Với text JD, lọc zero-width, bidi và Unicode tag trước AI call.
-   [x] Với PDF multimodal, coi posting là untrusted data và dựa vào
    instruction hierarchy/schema/guard thay vì tuyên bố có thể sanitize
    hoàn toàn.
-   [x] Giữ backward compatibility với history cũ.
-   [x] Cập nhật normalizer, persistence, fixtures và UI tests khi thêm
    field.

### UI

Không tạo screen mới. Requirement detail có thể hiển thị:

-   `Đạt`
-   `Không đạt`
-   `Chưa xác minh`

kèm JD evidence và CV evidence khi có.

### Exit criteria

-   Không regression canonical scoring.
-   Không phát sinh claim mới không có source trong benchmark.
-   Payload cũ vẫn đọc được.
-   Mandatory requirements có trạng thái xác minh rõ ràng.
-   Không làm tăng đáng kể latency analyze.

------------------------------------------------------------------------

## P1A --- Cover Letter

**Mức tác động:** Backend trung bình, DB thấp--trung bình, UI trung
bình.\
**Ưu tiên:** cao.

**Trạng thái (01/11/2026):** COMPLETED LOCALLY / BENCHMARK VERIFIED (chưa
push). Authority: `docs/13_cover_letter.md`. `rewrite-cv` + `action:
'cover_letter'`, CV = `parsedCV` serialize server-side, JD = JD của session
(History disable), validator deterministic riêng + 1 retry không JD +
fallback, cap theo giờ riêng (½ bucket rewrite), không migration, function
count 9. Benchmark 10 fixture × 5: 0 claim cấm/injection, 2 fallback. Chưa
làm: edit/save (P2A), quota riêng ở DB.

### Công việc

-   [ ] Thêm `Cover Letter` vào candidate result.
-   [ ] Dùng CV/JD đã có trong analysis context.
-   [ ] Hỗ trợ Việt/Anh theo ngôn ngữ phù hợp với application.
-   [ ] Grounding rule giống Full CV: chỉ dùng facts có source.
-   [ ] Cho phép edit, copy, regenerate và save.
-   [ ] Không tự thêm metric, certification, company knowledge hoặc
    achievement không có source.
-   [ ] Reuse handler hiện có, ví dụ `rewrite-cv` với
    `action: 'cover-letter'`.
-   [ ] Không tạo Vercel function mới chỉ cho cover letter.
-   [ ] Chốt quota riêng cho cover letter; không vô tình thừa hưởng miễn
    quota của rewrite hiện tại.
-   [ ] Log latency/model/guard metrics tương tự AI actions khác.
-   [ ] Timeout/retry phải idempotent ở tầng persistence.

### UI

Result navigation dự kiến:

`Overview | Requirements | Suggestions | Optimized CV | Cover Letter`

Không thay upload/analyze flow.

### Exit criteria

-   Cover letter tạo được từ analysis hiện tại.
-   Có thể sửa/copy/lưu.
-   Không có unsupported claims trong benchmark.
-   Lỗi AI không ảnh hưởng analysis result đã có.

------------------------------------------------------------------------

## P1B --- Optional Application Review

**Mức tác động:** Backend trung bình, DB thấp, UI thấp--trung bình.\
**Nguyên tắc:** không chạy mặc định.

### Công việc

-   [ ] Thêm action `Kiểm tra bản viết lại`.
-   [ ] Reviewer chạy request riêng sau khi draft đã có.
-   [ ] Review:
    -   unsupported claims;
    -   requirement chưa được phản ánh;
    -   claim quá mạnh;
    -   nội dung chung chung;
    -   inconsistency giữa CV và cover letter.
-   [ ] Reviewer chỉ trả critique/structured findings.
-   [ ] Revision chỉ chạy khi user yêu cầu áp dụng.
-   [ ] Không kéo reviewer vào critical path của Analyze.
-   [ ] Có guard chống reviewer tự bổ sung facts mới.

### Exit criteria

-   Analyze latency không đổi vì reviewer.
-   Review có thể retry độc lập.
-   Revision vẫn qua factual guard.

------------------------------------------------------------------------

## P2A --- Save Application + Immutable Snapshot

**Mức tác động:** Backend/DB trung bình--cao, UI trung bình.\
**Đây là bridge giữa analyzer và tracker.**

### Data model

Tạo tối thiểu:

-   `applications`
-   `application_documents`
-   `application_events` có thể tạo ở P2A hoặc P2B nhưng schema phải
    được thiết kế trước.

`applications` chứa metadata như:

-   user
-   company
-   role
-   source URL
-   status
-   deadline
-   applied date
-   last contact
-   created/updated timestamps

`application_documents` lưu snapshot logical của:

-   JD
-   CV submitted
-   cover letter submitted

### Quy tắc snapshot

Snapshot là immutable đối với phiên bản đã đánh dấu submitted. User có
thể tạo version mới nhưng không âm thầm ghi đè tài liệu đã gửi.

Interview/follow-up sau này phải dùng đúng snapshot của application,
không dùng CV/JD mới nhất của user.

### UI

Cuối Analysis/Result thêm CTA:

`Save as application`

Có thể tạo application ở trạng thái `drafted`.

### Storage & security

-   [ ] RLS theo owner.
-   [ ] Purpose riêng cho R2 application snapshots.
-   [ ] `pg_cron` không được xóa snapshot còn thuộc application.
-   [ ] Account deletion phải xóa application rows và documents.
-   [ ] Xóa history analysis không được xóa application snapshot.
-   [ ] Kiểm tra cross-account read/write/delete.

### Exit criteria

-   Tạo application từ analysis mà không nhập lại CV/JD.
-   Snapshot tồn tại độc lập với history.
-   Xóa history không phá application.
-   Xóa account không để orphaned files.

------------------------------------------------------------------------

## P2B --- Application Tracker

**Mức tác động:** Backend/DB/UI cao.\
**Đây là stage làm thay đổi IA rõ nhất.**

### Status authority

Canonical status:

-   `drafted`
-   `applied`
-   `interview`
-   `offer`
-   `hired`
-   `rejected`
-   `no_response`
-   `offer_declined`
-   `withdrawn`

Final:

-   `hired`
-   `rejected`
-   `no_response`
-   `offer_declined`
-   `withdrawn`

`drafted` là open nhưng chưa submitted, vì vậy không bao giờ được coi là
chờ phản hồi.

### UI

Thêm màn `Applications`.

MVP ưu tiên list/card, chưa cần Kanban.

Mỗi application hiển thị tối thiểu:

-   company
-   role
-   status
-   deadline
-   applied date
-   last contact
-   next action/follow-up indicator

Application detail:

`Overview | Documents | Timeline`

Không đưa Interview Prep vào cho đến P3.

### Events

`application_events` ghi lịch sử:

-   created
-   submitted/applied
-   status changed
-   interview
-   follow-up
-   offer
-   rejected
-   withdrawn
-   notes

Không chỉ lưu current status; phải giữ timeline.

### Exit criteria

-   Desktop/mobile cập nhật status ổn định.
-   Timeline không mất khi đổi status.
-   Không truy cập chéo account.
-   Application có thể được tạo từ result hoặc nhập tay.

------------------------------------------------------------------------

## P2C --- Follow-up Workflow

**Mức tác động:** Backend trung bình, UI trung bình.

### Logic

Follow-up chỉ áp dụng khi:

-   application đã submitted;
-   status chưa final;
-   status không phải `drafted`;
-   đủ threshold kể từ last contact;
-   chưa vượt giới hạn follow-up đã chốt.

Deadline vẫn có thể cảnh báo cho `drafted`, nhưng follow-up không áp
dụng vì chưa có hồ sơ nào được gửi.

### Công việc

-   [ ] Hiển thị application cần follow-up.
-   [ ] Draft follow-up dựa trên submitted snapshot.
-   [ ] Không cho follow-up thêm claim mới ngoài tài liệu đã gửi.
-   [ ] User phải xác nhận đã gửi trước khi ghi event.
-   [ ] Không tự động gửi email trong MVP.
-   [ ] Có thể bổ sung stale/no-response sweep sau khi tracker có usage
    thực tế.

### Exit criteria

-   Không nhắc follow-up cho draft.
-   Follow-up draft dùng đúng application language/context.
-   Log follow-up không bị duplicate khi retry.

------------------------------------------------------------------------

## P3 --- Interview Preparation

**Mức tác động:** Backend trung bình, DB trung bình, UI trung bình.

Chỉ triển khai sau khi P2 snapshot ổn định.

### Công việc

-   [ ] Thêm `Interview Prep` trong Application Detail.
-   [ ] Dùng đúng JD/CV/cover letter đã submitted.
-   [ ] Sinh likely questions theo role và interview stage.
-   [ ] Map câu hỏi sang experience thật.
-   [ ] Gợi ý STAR từ evidence có thật.
-   [ ] Nếu thiếu example, đánh dấu gap; không tạo story giả.
-   [ ] Cho user lưu feedback sau từng vòng.
-   [ ] Feedback có thể được dùng cho vòng prep tiếp theo nhưng không tự
    động trở thành canonical profile fact nếu chưa xác nhận.

### Exit criteria

-   Không lấy CV mới nhất thay cho submitted CV.
-   STAR có traceable evidence.
-   Feedback từng vòng được lưu theo application.

------------------------------------------------------------------------

## P4A --- Multi-JD Intelligence

**Mức tác động:** Backend/DB/UI cao.

Đây là hướng mở rộng phù hợp core cvFit hơn crawler.

### Công việc

-   [ ] Rank nhiều JD dựa trên canonical scoring.
-   [ ] Reuse analysis đã có khi version/input tương thích.
-   [ ] Tổng hợp requirement gaps qua nhiều JD.
-   [ ] Skill-gap heatmap.
-   [ ] Phân biệt gap phổ biến với hard requirement.
-   [ ] Learning priorities chỉ dựa trên đủ sample; không overfit vài
    JD.
-   [ ] Không tự hiệu chỉnh pass probability bằng outcome ít.

### Exit criteria

-   Không tạo scoring authority thứ hai.
-   Rank giải thích được bằng canonical score/evidence.
-   Chi phí AI được kiểm soát.

------------------------------------------------------------------------

## P4B --- Job Discovery

**Mức tác động:** rất cao.\
**Không thuộc MVP.**

Chỉ thử khi dữ liệu chứng minh user muốn tìm việc ngay trong cvFit.

### Trước khi triển khai phải đánh giá

-   nguồn phù hợp thị trường Việt Nam;
-   ToS/quyền truy cập;
-   bot protection;
-   stale postings;
-   deduplication;
-   source legitimacy;
-   crawling cost;
-   maintenance burden;
-   URL/JD trust boundary.

Bắt đầu tối đa với một source/pilot. Không port crawler Đan Mạch của
upstream.

Job Discovery phải là module riêng; không được làm phức tạp Analyze nếu
user chỉ muốn upload JD thủ công.

------------------------------------------------------------------------

## P5 --- Output/PDF Verification (optional)

Không bắt buộc dùng LaTeX.

Đánh giá output hiện tại từ browser print/export:

-   text extraction;
-   ATS-readable text layer;
-   contact information;
-   reading order;
-   Vietnamese Unicode;
-   page breaks;
-   overflow;
-   missing sections.

Chỉ đầu tư pipeline PDF riêng nếu production evidence cho thấy
`window.print()` không đủ ổn định.

## 6. Information Architecture đề xuất

### Trước P2

Giữ candidate IA hiện tại, chỉ mở rộng Result.

### Sau P2

Candidate primary areas:

-   Analyze
-   Applications
-   History
-   Account

Có thể giảm số primary tab sau usability/analytics; không quyết định chỉ
dựa trên roadmap.

### Result actions

Sau analysis nên có nhóm next actions rõ ràng:

-   Optimize CV
-   Create Cover Letter
-   Review Application
-   Save as Application

Không bắt user vào tracker rồi nhập lại dữ liệu.

## 7. API và function strategy

Không tạo một API file cho mỗi feature.

Ưu tiên action routing trong handler hiện có, ví dụ:

-   `rewrite-cv`
    -   `rewrite`
    -   `cover-letter`
    -   `review`
    -   `revise-after-review`

Application CRUD ưu tiên route/handler phù hợp với architecture hiện tại
hoặc Supabase RPC/direct client khi RLS đủ an toàn; phải audit function
count trước khi thêm server handler mới.

Mọi AI action cần:

-   auth;
-   input validation;
-   deadline/abort;
-   schema validation;
-   structured error;
-   observability;
-   quota policy rõ;
-   idempotency khi persistence liên quan.

## 8. Data authority

### Canonical authorities

-   Match: `matchScore`.
-   Pass probability: derived từ canonical score theo version hiện hành.
-   Requirement match: canonical requirement comparison/status.
-   Requirement verification: field riêng, không overload match status.
-   Candidate facts: parsed/source-backed CV/profile facts đã xác nhận.
-   Application current status: `applications.status`.
-   Application history: `application_events`.
-   Submitted materials: immutable `application_documents` snapshot.

Không tạo duplicate authority trong UI hoặc AI output.

## 9. Trust boundary và factual grounding

JD/posting, CV upload và external content đều là data, không phải
instruction.

AI rules phải nằm ở instruction layer riêng. Không nối raw JD vào vị trí
có thể cạnh tranh trực tiếp với system rules nếu SDK/model hỗ trợ tách
instruction.

Không tuyên bố posting guard là sandbox. Filter deterministic chỉ giảm
risk.

Grounding rule áp dụng cho:

-   optimized CV;
-   cover letter;
-   reviewer revision;
-   follow-up;
-   interview STAR suggestions.

Nếu fact không có source:

-   hỏi user xác nhận/bổ sung;
-   đánh dấu unknown/gap;
-   hoặc bỏ claim.

Không tự "làm đẹp" bằng số liệu giả.

## 10. Quota và chi phí

Trước P1 phải chốt policy:

-   Analyze: giữ policy hiện tại.
-   Rewrite CV: audit policy hiện tại.
-   Cover Letter: quota riêng hoặc cùng nhóm generation.
-   Review: chỉ tính khi user chủ động chạy.
-   Revision: xác định có tính như generation mới hay bundled.
-   Interview Prep: quota riêng sau P3.

Không để việc reuse handler vô tình đồng nghĩa reuse quota behavior.

Theo dõi:

-   AI calls/application;
-   latency;
-   retry;
-   guard failure;
-   cost per completed application package;
-   tỷ lệ user dùng reviewer;
-   tỷ lệ save application.

## 11. Rollout và test

### P0

-   CV/JD Việt--Anh.
-   Missing/unknown/unmet requirement.
-   Malicious/instruction-like JD.
-   Old history payload.
-   Invalid AI schema.
-   Regression canonical score.

### P1

-   Unsupported cover-letter claim.
-   Rewrite/review timeout.
-   Retry.
-   Quota.
-   Language.
-   Reviewer hallucination.
-   Revision guard.

### P2

-   RLS cross-account.
-   Snapshot immutability.
-   History deletion.
-   Account deletion.
-   R2 lifecycle.
-   Duplicate retry.
-   Status transition.
-   ICT display/UTC storage.
-   Mobile/desktop.

### P3+

-   Submitted snapshot correctness.
-   STAR evidence.
-   Multi-JD canonical authority.
-   Cost/concurrency.

Mỗi stage phải chạy tests liên quan, lint, API lint và build theo gate
hiện hành của repo. Migration phải backward compatible và có
rollback/repair plan trước production.

## 12. Metrics

Thiết lập baseline trước khi đặt target.

Theo dõi:

-   tỷ lệ tạo Cover Letter sau analysis;
-   tỷ lệ chạy optional Reviewer;
-   tỷ lệ Save as Application;
-   tỷ lệ quay lại Applications;
-   application status updates/user;
-   follow-up usage;
-   interview-prep usage;
-   AI edits sau generation;
-   unsupported-claim guard rate;
-   timeout/error rate;
-   AI cost per application package.

Không dùng outcome ít để kết luận model scoring tốt/xấu hoặc tự động
hiệu chỉnh pass probability.

## 13. Điểm dừng MVP

MVP hoàn thành khi user có thể:

1.  Phân tích CV/JD bằng canonical scoring.
2.  Xác định requirement nào đạt/không đạt/chưa xác minh.
3.  Tạo CV tối ưu và Cover Letter có factual grounding.
4.  Review hồ sơ nếu muốn.
5.  Lưu application cùng immutable snapshot.
6.  Theo dõi trạng thái.
7.  Nhận/draft follow-up hợp lý.

Interview Prep và Multi-JD Intelligence là expansion sau MVP.

## 14. Thứ tự triển khai đề xuất

``` text
P0   Authority & Reliability Audit        ✅ deployed (PR #59)
 ↓
P1A  Cover Letter                         ✅ local (benchmark verified)
 ↓
P1B  Optional Application Review
 ↓
P2A  Save Application + Snapshot
 ↓
P2B  Application Tracker
 ↓
P2C  Follow-up
 ↓
P3   Interview Preparation
 ↓
P4A  Multi-JD Intelligence
 ↓
P4B  Job Discovery
 ↓
P5   PDF/Output Verification nếu cần
```

## 15. Đánh giá khả năng tích hợp

  Stage              Backend      DB         UI/UX        Tác động flow hiện tại   Risk
  ------------------ ------------ ---------- ------------ ------------------------ -----------------
  P0 Authority       Trung bình   Thấp       Thấp         Rất thấp                 Thấp
  P1A Cover Letter   Trung bình   Thấp--TB   Trung bình   Thấp                     Thấp
  P1B Reviewer       Trung bình   Thấp       Thấp--TB     Rất thấp                 Thấp
  P2A Snapshot       TB--Cao      Cao        Trung bình   Thấp--TB                 Trung bình
  P2B Tracker        Cao          Cao        Cao          Trung bình               Trung bình
  P2C Follow-up      Trung bình   TB         Trung bình   Thấp                     Trung bình
  P3 Interview       Trung bình   TB         Trung bình   Thấp                     Thấp--TB
  P4A Multi-JD       Cao          Cao        Cao          Trung bình               Trung bình--Cao
  P4B Discovery      Rất cao      Cao        Cao          Cao                      Cao

Đánh giá tổng thể: tích hợp khả thi và phù hợp hướng phát triển cvFit.
P0--P1 có thể triển khai mà gần như không phá UX hiện tại. P2 là ranh
giới sản phẩm quan trọng, nơi cvFit bắt đầu trở thành application
workspace. Job Discovery nên để cuối để tránh crawler/search làm lệch
core value của cvFit.

## 16. Nguồn tham khảo upstream

-   README/workflow: https://github.com/ai-job-search-dev/ai-job-search
-   Apply workflow:
    https://github.com/ai-job-search-dev/ai-job-search/blob/master/.claude/commands/apply.md
-   Job evaluation framework:
    https://github.com/ai-job-search-dev/ai-job-search/blob/master/.claude/skills/job-application-assistant/04-job-evaluation.md
-   Outcome/tracker:
    https://github.com/ai-job-search-dev/ai-job-search/blob/master/.claude/commands/outcome.md
-   Posting guard:
    https://github.com/ai-job-search-dev/ai-job-search/blob/master/tools/posting_guard.py

## 17. Giới hạn và checkpoint trước implementation

Plan này là roadmap sản phẩm/kỹ thuật, không phải xác nhận rằng mọi
schema/API production hiện tại vẫn giống snapshot nghiên cứu 27/10.

Trước mỗi stage phải audit lại:

-   production SHA/main;
-   schema + RLS production;
-   function count/routing;
-   quota behavior;
-   current AI contracts;
-   storage lifecycle;
-   tests/gates;
-   upstream revision nếu port rule/prompt.

Không triển khai theo assumption cũ nếu authority hiện tại đã thay đổi.
