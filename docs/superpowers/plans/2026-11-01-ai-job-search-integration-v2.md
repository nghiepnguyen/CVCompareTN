# Kế hoạch tích hợp ý tưởng từ ai-job-search vào cvFit

-   Ngày lập ban đầu: 24/10/2026.
-   Cập nhật: 18/11/2026 (M2-Q audit).
-   Trạng thái: P0, P1A, P1B (+ P1B.1), P1C, P2A DEPLOYED / PRODUCTION
    VERIFIED; P2B DEPLOYED / PRODUCTION VERIFIED (PR #70, `fa1a45f`); P2C DEPLOYED / PRODUCTION VERIFIED WITH KNOWN DEBT (PR #73, `15d90c1`).
    - Cập nhật 15/11/2026:
      - M1-B sửa chất lượng P2C: DEPLOYED / PRODUCTION SMOKE PASS (PR #77, `4367f56`).
      - Sửa replay migration A1: DEPLOYED (PR #76, `d1ef961`).
      - P3 Interview Prep: **PAUSED, chưa release**. CP6 ở trạng thái independent review RESOURCE-BLOCKED / PENDING.
      - P4A: vẫn bị gate.
    - Cập nhật 16/11/2026 — **M2 Analyze stabilization (độ tin cậy):**
      - M2-A audit: xong (`docs/audits/2026-11-15-m2a-analyze-stabilization-audit.md`).
      - M2-B: DEPLOYED / PRODUCTION SMOKE PASS WITH KNOWN DEBT (PR #79, `375b13e`).
      - M2-C2 quota tháng nguyên tử: migration `20261116000000` áp production; app DEPLOYED / PRODUCTION SMOKE PASS (PR #80, `f1ced35`). Lỗ hổng vượt quota khi request đồng thời đã đóng.
      - Độ dao động điểm (score variance) **chưa** được xử lý: vẫn là gate của P4A (`docs/16_analyze_score_variance.md`).
    - Triển khai theo từng stage, không port nguyên stack upstream.
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

-   [x] Không regression canonical scoring. *(benchmark PRE vs final: median Δ 0, max 3.0)*
-   [x] Không phát sinh claim mới không có source trong benchmark.
-   [x] Payload cũ vẫn đọc được. *(backward compatibility history cũ)*
-   [x] Mandatory requirements có trạng thái xác minh rõ ràng. *(`Đạt` / `Không đạt` / `Chưa xác minh`,
    smoke production đủ ba nhánh)*
-   [x] Không làm tăng đáng kể latency analyze. *(verification deterministic sau response, không thêm
    Gemini call)*

------------------------------------------------------------------------

## P1A --- Cover Letter

**Mức tác động:** Backend trung bình, DB thấp--trung bình, UI trung
bình.\
**Ưu tiên:** cao.

**Trạng thái (01/11/2026):** DEPLOYED / PRODUCTION VERIFIED ✅.
PR [#61](https://github.com/nghiepnguyen/CVCompareTN/pull/61) merge
`dd0359f`; production smoke trên trình duyệt đạt (VI/EN, copy, regenerate,
History disable). Authority: `docs/13_cover_letter.md`. `rewrite-cv` + `action:
'cover_letter'`, CV = `parsedCV` serialize server-side, JD = JD của session
(History disable), validator deterministic riêng + 1 retry không JD +
fallback, không migration, function count 9. Cap theo giờ: từ P1B dùng chung
document cap với Application Review (`ceil(hourlyAiLimit/2)` request, free
5/giờ). Benchmark 10 fixture × 5: 0 claim cấm/injection, 2 fallback. Chưa
làm: edit/save (P2A), quota riêng ở DB.

### Công việc

-   [x] Thêm `Cover Letter` vào candidate result.
-   [x] Dùng CV/JD đã có trong analysis context (session; History disable).
-   [x] Hỗ trợ Việt/Anh theo ngôn ngữ phù hợp với application.
-   [x] Grounding rule giống Full CV: chỉ dùng facts có source.
-   [ ] Cho phép edit, copy, regenerate và save. *(copy + regenerate đã có; save có từ P2A —
    thư được lưu vào snapshot application; edit trong UI chưa làm)*
-   [x] Không tự thêm metric, certification, company knowledge hoặc
    achievement không có source.
-   [x] Reuse handler hiện có: `rewrite-cv` với `action: 'cover_letter'`.
-   [x] Không tạo Vercel function mới chỉ cho cover letter.
-   [x] Chốt quota riêng cho cover letter; không vô tình thừa hưởng miễn
    quota của rewrite hiện tại. *(document cap theo giờ, chung với P1B)*
-   [x] Log latency/model/guard metrics tương tự AI actions khác.
-   [x] Timeout/retry phải idempotent ở tầng persistence. *(P2A: idempotency key theo Save intent,
    retry replay đúng application)*

### UI

Đã ship: nút `Tạo Cover Letter` ở header Result mở dialog (ngôn ngữ thư
VI/EN, copy, tạo lại) thay vì tab riêng. Không thay upload/analyze flow.

### Exit criteria

-   [x] Cover letter tạo được từ analysis hiện tại.
-   [ ] Có thể sửa/copy/lưu. *(copy ✅; lưu ✅ qua P2A; sửa chưa làm)*
-   [x] Không có unsupported claims trong benchmark.
-   [x] Lỗi AI không ảnh hưởng analysis result đã có.

------------------------------------------------------------------------

## P1B --- Optional Application Review

**Mức tác động:** Backend trung bình, DB thấp, UI thấp--trung bình.\
**Nguyên tắc:** không chạy mặc định.

**Trạng thái (02/11/2026):** P1B — DEPLOYED / PRODUCTION VERIFIED ✅
(PR [#63](https://github.com/nghiepnguyen/CVCompareTN/pull/63) merge
`310e59e`). P1B.1 — DEPLOYED / PRODUCTION VERIFIED ✅ (PR
[#64](https://github.com/nghiepnguyen/CVCompareTN/pull/64) merge `b962502`:
requirement-gap anchoring; production smoke trước fix có gap sai 3/3, sau fix
React/Jest không còn báo gap, gap thật (Figma) vẫn giữ). Authority:
`docs/14_application_review.md`. `rewrite-cv` + `action:
'application_review'`; precheck = guard P1A (không đổi) → reviewer Gemini →
server anchor findings (quote phải có trong thư, gap phải trỏ requirement
matched/partial) + bảng severity + verdict `ready|review` do server tính → tối
đa 1 revision không raw JD → guard P1A lại. Tối đa 2 call, deadline chung,
cap theo giờ chung với cover letter, không migration, function count 9.
Revision được sinh trong cùng request nhưng chỉ áp dụng khi user bấm "Dùng bản
đã chỉnh". Benchmark P1B 17 fixture / 73 run, P1B.1 25 fixture / 113 run:
4 gate = 0, gap sai 0/20.

Known debt còn lại:

-   `Use revised` + Copy bản chỉnh: unit-tested, production UI smoke pending.
-   `rawJdConcepts` partial-caps false positive (task riêng).
-   Puffery recall: đã thấy thực tế trên production.
-   Cross-language semantic coverage còn lexical.
-   Ngôn ngữ finding có thể khác ngôn ngữ UI.
-   `cvEvidence` chưa có canonical server-side source.
-   Supabase 400 chưa xác minh.

### Công việc

-   [x] Thêm action `Kiểm tra hồ sơ ứng tuyển` (trong dialog Cover Letter).
-   [x] Reviewer chạy request riêng sau khi draft đã có.
-   [x] Review:
    -   unsupported claims;
    -   requirement chưa được phản ánh;
    -   claim quá mạnh;
    -   nội dung chung chung;
    -   inconsistency giữa CV và cover letter.
-   [x] Reviewer chỉ trả critique/structured findings.
-   [x] Revision chỉ áp dụng khi user yêu cầu. *(bản chỉnh được sinh trong
    cùng request review — tối đa 1 lần — nhưng chỉ thay thư khi user bấm
    "Dùng bản đã chỉnh")*
-   [x] Không kéo reviewer vào critical path của Analyze.
-   [x] Có guard chống reviewer tự bổ sung facts mới.

### Exit criteria

-   [x] Analyze latency không đổi vì reviewer.
-   [x] Review có thể retry độc lập.
-   [x] Revision vẫn qua factual guard.

------------------------------------------------------------------------

## P2A --- Save Application + Immutable Snapshot

**Mức tác động:** Backend/DB trung bình--cao, UI trung bình.\
**Đây là bridge giữa analyzer và tracker.**

**Trạng thái (02/11/2026):** DEPLOYED / PRODUCTION VERIFIED ✅. PR
[#67](https://github.com/nghiepnguyen/CVCompareTN/pull/67) squash merge
`171e8a8` (production `171e8a8`); migration
`20261103000000_applications_snapshots.sql` áp trước khi deploy app;
production smoke case 1–8 PASS. Authority: `docs/15_applications.md`. RPC `save_application` (SECURITY DEFINER, atomic,
idempotency key theo Save intent; analysis id chỉ là provenance, không đọc history), snapshot CV (`parsedCV`) + JD + Cover Letter tùy
chọn, status `drafted`, không thêm function (9), 0 AI call. Chưa làm: R2 copy
file gốc (không cần cho MVP), snapshot Optimized CV, `application_events` (P2B).

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

-   [x] RLS theo owner. *(policy `*_select_own` / `*_delete_own` + RESTRICTIVE `account_unlocked_read`)*
-   [ ] Purpose riêng cho R2 application snapshots. *(không áp dụng: snapshot lưu trong DB
    (`application_documents.content`), không copy file gốc lên R2 — không cần cho MVP)*
-   [x] `pg_cron` không được xóa snapshot còn thuộc application. *(các job cron chỉ dọn R2 tạm, history
    free và rate limit; không job nào đụng `application_documents`)*
-   [x] Account deletion phải xóa application rows và documents. *(FK `ON DELETE CASCADE` từ
    `auth.users`; SQL test account delete)*
-   [x] Xóa history analysis không được xóa application snapshot. *(không phụ thuộc history; SQL test
    history delete)*
-   [x] Kiểm tra cross-account read/write/delete. *(SQL test cross-user; smoke production bằng account
    thứ hai vẫn là gap)*

### Exit criteria

-   [x] Tạo application từ analysis mà không nhập lại CV/JD. *(smoke production P2A)*
-   [x] Snapshot tồn tại độc lập với history.
-   [x] Xóa history không phá application.
-   [x] Xóa account không để orphaned files. *(snapshot trong DB, cascade; không có file R2 riêng)*

------------------------------------------------------------------------

### Quan sát ngoài phạm vi P2A — Analyze variance (ứng viên điều tra)

Trong production smoke P2A, cùng một CV + JD tổng hợp cho `matchScore` 88 và
72 ở hai lần analyze (lệch 16 điểm). Không do P2A gây ra: Save chỉ lưu điểm
Analyze trả về. Cần theo dõi vì độ lệch lớn hơn rõ so với spread benchmark P0
(median Δ 0, max 3). Hành động: điều tra riêng trước khi đổi scoring/prompt.
Đây là quan sát, chưa có root cause.

------------------------------------------------------------------------

## P2B --- Application Tracker

**Mức tác động:** Backend/DB/UI cao.\
**Đây là stage làm thay đổi IA rõ nhất.**

**Trạng thái (03/11/2026):** DEPLOYED / PRODUCTION VERIFIED ✅. PR
[#70](https://github.com/nghiepnguyen/CVCompareTN/pull/70) squash merge
`fa1a45f`; migration `20261104000000_application_tracker.sql` áp production
trước merge; production smoke PASS (docs/15). Authority: `docs/15_applications.md` (mục P2B). Tóm tắt:
`application_events` append-only (created / status_changed / note /
details_updated), 3 RPC SECURITY DEFINER (transition có CAS
`expected_status`, note, details) + `save_application` ghi `created` event
trong cùng transaction, backfill created event cho application P2A, matrix
transition một nguồn (`supabase/application_status_transitions.json`, SQL test
81 cặp), final status sửa được bằng event mới (UI xác nhận), idempotency key
theo intent, tab Applications (list `.range()` + detail Overview / Documents /
Timeline), 0 AI call, 9 function.

Chênh lệch so với yêu cầu roadmap (có chủ đích):

-   **Tạo tay: DEFERRED** — exit criterion "tạo từ result hoặc nhập tay" mới
    đạt phần "từ result"; không nới snapshot CV/JD bắt buộc.
-   **Next action/follow-up indicator: DEFERRED → P2C.**
-   **Last contact** → hiển thị "Last activity" (`updated_at`, bump bởi mọi
    mutation P2B); event contact thuộc P2C.
-   Events `interview/offer/rejected/withdrawn/submitted` = `status_changed`
    với `to_status` tương ứng (không tạo event type riêng); `follow-up` → P2C.
-   `no_response` chỉ chọn thủ công; không sweep tự động.
-   P2B.1 (pre-PR hardening, local): `applied_at` = "Nộp lần đầu / First
    applied" (lịch sử, không đổi khi sửa status); sửa thông tin có optimistic
    concurrency (`expected_updated_at` → `stale_application`, replay thắng
    CAS); timeline phân trang 50/trang. Detail chưa có deep link (debt chấp nhận).
-   Score: chỉ là bối cảnh lịch sử ("Điểm khi lưu / Score at save time"),
    không xếp hạng/sort/so sánh. P2B **không** giải quyết Analyze variance;
    gate ANALYZE STABILIZATION của P4A vẫn còn nguyên.

### Score policy (P2A.2)

P2B chỉ được hiển thị `matchScore` đã lưu như bối cảnh lịch sử ("điểm lúc
lưu" / "score at save time"). Không xếp hạng, không gợi ý application nào tốt
hơn, không mặc định sort theo score, không tính tỷ lệ thành công, không tổng
hợp chất lượng ứng viên, không coi chênh lệch score giữa các application là
tiến bộ/thụt lùi. Lý do: cùng một request Analyze cho điểm 75–88
(`docs/16_analyze_score_variance.md`).

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

-   [x] Desktop/mobile cập nhật status ổn định. *(smoke production P2B, gồm mobile 375 px)*
-   [x] Timeline không mất khi đổi status. *(`application_events` append-only)*
-   [x] Không truy cập chéo account. *(SQL test cross-user + policy/grant production; smoke bằng account
    thứ hai vẫn là gap)*
-   [ ] Application có thể được tạo từ result hoặc nhập tay. *(từ result ✅; nhập tay DEFERRED)*

------------------------------------------------------------------------

## P2C --- Follow-up Workflow

**Mức tác động:** Backend trung bình, UI trung bình.

**Trạng thái (05/11/2026): P2C — DEPLOYED / PRODUCTION VERIFIED WITH KNOWN DEBT.**
PR #73 squash-merge 2026-11-05T00:06:06Z, merge/production SHA `15d90c1ada1a40cd7af66d593348aa401438ce3e`;
Vercel production deployment `dpl_9LHHxuJ3T7R52vvxav89TrT43B7J` (Ready, 9 function, `rewrite-cv` maxDuration 300);
migration `20261105000000_application_follow_up.sql` đã áp production 2026-11-05 (trước merge, ghi một lần, 88 migration).
Smoke production 2026-11-05 (tài khoản smoke có kiểm soát, dữ liệu tổng hợp): 18 case, 1–14 PASS, 15 GAP
(cross-account CHƯA xác minh, không có account thứ hai), 16 PASS WITH GAPS, 17–18 PASS. Gemini production:
4 bản nháp/5 lần gọi/1 retry/0 fallback, mẫu nhỏ, không phải tỉ lệ hallucination. Nợ mở (Minor/known debt):
cross-account, clipboard success, keyboard focus-visible, thông báo unknown-outcome bị lặp, intent R1 chỉ giữ
trong bộ nhớ trang (reload/tab khác là intent mới, có thể tạo event trùng), độ phủ paraphrase của grounding
(chưa có tỉ lệ hallucination/fallback thống kê). Chi tiết: `docs/15_applications.md`. Fallback P2C.0
đã deploy trước (#72, `b6e3c47` = SHA rollback tối thiểu; lịch sử: trước 05/11 trạng thái là IMPLEMENTED — NOT YET PRODUCTION VERIFIED). Authority:
`docs/15_applications.md` (mục P2C); plan chi tiết:
`docs/superpowers/plans/2026-11-03-p2c-follow-up-workflow.md`. Tóm tắt: 2 event type
(`follow_up_sent`, `contact_received`) ghi bởi RPC `log_application_contact`; view
`application_follow_up_state` (security_invoker) suy ra `waiting | due | limit_reached`
(ngưỡng 7 ngày, giới hạn mềm 2 follow-up); chỉ `applied`; `action: 'follow_up'` trên
`/api/rewrite-cv` với snapshot do server nạp, không nháp lưu, không event khi sinh nháp,
dùng chung trần tài liệu theo giờ, không quota tháng; 9 function.

Chênh lệch so với yêu cầu roadmap (có chủ đích):

-   Follow-up cho `interview`/`offer` và bản nháp cho chúng: **DEFERRED** (RPC nhận log, UI không lộ).
-   Bản nháp không được lưu; user phải tự xác nhận "đã gửi" thì mới ghi event.
-   Stale/no-response sweep: không làm.

**Open before release — lịch sử (trước 05/11/2026), nay đã đóng:**

-   Cancel-after-unknown duplicate: RESOLVED ở R1 (`90157dd`); còn giới hạn intent chỉ giữ trong bộ
    nhớ (xem nợ mở ở trên).
-   Copy kết quả không xác định: RESOLVED ở R3 (`284140a`).
-   Grounding: lớp xác định R2 (`7cbc1ce`) + R4 (`eeaf2aa`, giảm false positive); giới hạn còn lại là
    nợ mở (diễn đạt khác, tên trơn, ký tên một từ).
-   Alias PostgREST `language:metadata->>language`: VERIFIED trên production (E1 parser/projection,
    E2-D real-row + thứ tự ngôn ngữ).
-   Gemini thật VI/EN: VERIFIED bằng smoke giới hạn (E1 local + E2-D production), không phải phép đo tỉ lệ.
-   Browser 375 px/desktop: VERIFIED (E2-D case 16, còn gap clipboard success + focus-visible).
-   Production migration preflight + áp + smoke: DONE (E1, E2-B, E2-D).

Chi tiết: `docs/15_applications.md`.

**Cập nhật 15/11/2026 — M1 (sửa chất lượng P2C, chi phí AI = 0): DEPLOYED / PRODUCTION SMOKE PASS.**

- **Merge và deploy:** PR #77 squash-merge thành `4367f569d52d44f5d511b1dff4157ad8bcd4cf88`. Vercel production `dpl_FXsK465Jw4zav4G95e7KAcs1cz1h` Ready, build từ `main@4367f56`.
- **Không đổi:** không migration, không đổi RPC hay idempotency.
- **Đã sửa:**
  - Thông báo unknown-outcome bị lặp: ba form note, follow_up_sent và contact_received chỉ còn một `role="alert"` giải thích, đặt trên Retry / Close / Abandon. Status và details giữ copy trung tính.
  - Keyboard focus-visible: ring dùng chung cho nút, tab, toggle ngôn ngữ và Load more; input có ring 1px.
- **Nợ intent R1 chỉ giữ trong bộ nhớ trang:** owner chấp nhận (Option A), không có runtime mitigation. Event trùng qua reload hay tab khác vẫn có thể xảy ra và không xoá được.
- **Bằng chứng:**
  - Full suite 1374/1374, lint, lint:api, build.
  - Thêm test T1–T4. Riêng form details: retry tại chỗ dùng lại key; key mới chỉ sau Hủy.
  - Browser local cô lập (Stage 1).
  - Smoke production 15/11 bằng tài khoản smoke: tải trang, focus ring, lưu ghi chú trên S1 `999ab417`, đổi trạng thái trên P2B `f2b28420` (interview → offer, fixture nay ở `offer`). Đều PASS, 0 lỗi console.
- **Còn mở:**
  - Firefox và screen reader: gap đã chấp nhận, không phải PASS.
  - Accessibility của ConfirmDialog: nợ có từ trước, ngoài phạm vi M1-B.
  - Cross-account (case 15), clipboard success, độ phủ paraphrase của grounding.
  - Unknown outcome chưa mô phỏng trên production (có chủ đích); đã kiểm ở local và bằng test.
- **Kèm theo, A1 (PR #76, `d1ef961`):**
  - Bọc guard quanh REVOKE/GRANT `activate_pro_plan` 4 tham số trong `20260602100000`.
  - Fresh replay 88/88; metadata, body MD5 và quyền khớp production.
  - Production không chạy lại migration này (version đã ghi nhận).

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

-   [x] Hiển thị application cần follow-up. *(chỉ báo trên list + bộ lọc "Cần follow-up")*
-   [x] Draft follow-up dựa trên submitted snapshot. *(server nạp snapshot CV/JD/thư)*
-   [x] Không cho follow-up thêm claim mới ngoài tài liệu đã gửi. *(guard CV-only + lớp claim/honorific
    R2/R4; độ phủ paraphrase còn là nợ mở)*
-   [x] User phải xác nhận đã gửi trước khi ghi event. *("Đánh dấu đã gửi follow-up"; sinh nháp không
    ghi event)*
-   [x] Không tự động gửi email trong MVP.
-   [ ] Có thể bổ sung stale/no-response sweep sau khi tracker có usage
    thực tế. *(không làm, có chủ đích)*

### Exit criteria

-   [x] Không nhắc follow-up cho draft. *(smoke production case 14)*
-   [x] Follow-up draft dùng đúng application language/context. *(case 5: snapshot + thứ tự ngôn ngữ
    request → thư → application)*
-   [x] Log follow-up không bị duplicate khi retry. *(case 7 double-click + R1 replay trên production;
    giới hạn: intent chỉ trong bộ nhớ trang)*

------------------------------------------------------------------------

## M2 --- Analyze Stabilization (độ tin cậy)

**Trạng thái (18/11/2026): M2-A, M2-B, M2-C2, M2-D2, M2-D3 RELEASED; M2-Q audit/thiết kế xong, chờ quyết định owner.** Ngoài phạm vi: prompt, model, canonical scoring, probability, ngưỡng.

| Stage | Nội dung | Trạng thái |
|---|---|---|
| M2-A | Audit chỉ đọc pipeline analyze (timeout, 429/5xx, concurrency, retry, cost) + 9 repro offline | Xong. `docs/audits/2026-11-15-m2a-analyze-stabilization-audit.md` |
| M2-B | Guard double-submit, giới hạn Full CV 5 song song, slot giờ nguyên tử fail-closed, 413 JD/CV, Gemini 429/5xx → 503, lỗi client có kiểu + dịch | DEPLOYED / SMOKE PASS WITH KNOWN DEBT — PR #79 `375b13e` |
| M2-C1 | Thiết kế quota tháng reserve/commit/release (owner chọn Option B; D1 = miễn 2 uncertain/chu kỳ, D2 = idempotency key UUID → 409, D3 = fail-closed) | Xong. `docs/audits/2026-11-15-m2c1-monthly-quota-integrity-design.md` (+ amendments) |
| M2-C2 | Ledger `analytics_quota_reservations` + RPC service_role, handler + client | Migration áp production 16/11; app DEPLOYED / SMOKE PASS — PR #80 `f1ced35`. Preflight: `docs/audits/2026-11-16-m2c2a-migration-preflight.md` |
| M2-D2 | Recruiter save-only retry, history trung thực, retry chỉ phần lỗi | RELEASED 16/11 — PR #82 `e05622a`. `docs/audits/2026-11-16-m2d2-reliability-retry-ux.md` |
| M2-D3 | Ownership ứng viên (claim + lease 600 s + fenced save), `analysis_attempt_id` = idempotency key của ledger | RELEASED 16/11 — migration `20261117000000` + PR #83 `095b993`, smoke PASS WITH KNOWN DEBT. `docs/audits/2026-11-16-m2d3-stale-analysis-recovery.md` |
| M2-Q (đề xuất) | Audit ledger + thiết kế Q-1 retention/cleanup + phương án khôi phục kết quả mất | AUDIT XONG 18/11 (chỉ thiết kế). `docs/audits/2026-11-18-m2q-quota-ledger-reliability-audit.md`. GO: Q-1a (test + CI, không migration), Q-L1 (fenced save phía server cho recruiter). NO-GO: xoá ledger trước khi owner chọn retention (Q-D1); sweep toàn cục (Q-D2); kho kết quả server (Q-L2, cần Q-D4 + review privacy) |

**Nợ còn mở (sau M2-C2):**
- Pre-check client (`check_analytics_quota`) chưa tính reservation đang chạy → batch có thể qua pre-check rồi nhận 429 từ server.
- Ledger chưa có job dọn dữ liệu cũ (retention). M2-Q (18/11): chưa cần purge (~350 B/dòng); bất biến bắt buộc — không xoá dòng có `request_key` = `analysis_attempt_id` của ứng viên chưa `done`; chờ owner quyết Q-D1..Q-D4.
- Luồng cá nhân không gửi idempotency key: commit thành công nhưng mất kết quả → bị trừ lượt, retry trừ tiếp (M2-Q P1-2).
- Release `pre_gemini` thất bại → hết TTL thành `uncertain` (tốn lượt miễn hoặc bị trừ).
- Commit thành công nhưng mất phản hồi → user bị trừ lượt mà không nhận kết quả.
- Test DB (SQL + concurrency, `npm run test:db:quota`) chưa chạy trong CI.
- Nhánh commit `over_limit_waived` chỉ test single-session; burst chưa test trên Preview (chỉ Postgres local).
- Slot giờ cửa sổ cố định: burst qua ranh giới giờ được ~2× cap; các action tài liệu (cover letter / review / follow-up) chỉ có cap giờ đếm log.
- Drift production: fallback `get_default_monthly_analytics_limit()` = 20, repo = 5 (vô hại khi `app_settings` = 5).
- Hygiene quyền: `authenticated` còn EXECUTE `increment_usage_count`/`check_analytics_quota` trên chính mình; `anon`/`authenticated` còn TRUNCATE trên `profiles` (PostgREST không với tới).
- Từ M2-A, chưa làm: P2-2 (dòng lỗi tính vào cap giờ), P2-3 (chạy lại batch phân tích lại cả CV đã xong), P2-7 (recruiter ghi lỗi vào `parsed_text`, ứng viên kẹt `analyzing`), P2-8 (banner báo "đã lưu" dù lưu lỗi), K0 (parse vẫn tốn khi analyze lỗi/413).
- Score variance (A2 live benchmark) vẫn BLOCKED; gate P4A không đổi.

## P3 --- Interview Preparation

**Trạng thái (15/11/2026): PAUSED — CHƯA RELEASE.**

- **Code:** P3A (AI, `action: 'interview_prep'`) chỉ nằm trên branch local `feat/p3a-interview-prep`. Branch này chưa từng push và không được merge, mở PR hay cherry-pick vào `main` (quyết định owner D-PAUSE-8 đến 12).
- **CP6** (runner VM cô lập cho benchmark Gemini thật):
  - PAUSED, không được duyệt. Freeze `0871d03`; independent human review **RESOURCE-BLOCKED / PENDING**.
  - D-H7 NOT AUTHORIZED; financial gate BLOCKED; live smoke, CP6 execution và production NO-GO.
- **Interview Prep không AI (deterministic):** khả thi về kỹ thuật, nhưng chỉ mới có tài liệu ranh giới và rủi ro, chưa được duyệt. Cần quyết định go/no-go riêng và waiver demand-gate riêng.
- **Exit criteria P3** (STAR có evidence, feedback từng vòng) vẫn mở.
- **Hồ sơ chi tiết:** `docs/audits/p3a-v2-cp6-pause-record.md` và `docs/superpowers/plans/2026-11-15-roadmap-reprioritization.md`. Cả hai hiện chỉ có trên branch tạm dừng; đưa lên `main` cần owner duyệt.

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

**Gate:** cần ANALYZE STABILIZATION trước (`docs/16_analyze_score_variance.md`):
MODEL_VARIANCE trên request giống hệt. Phương án (temperature, seed, median
nhiều lần chạy, score deterministic) mới là ứng viên điều tra; phương án nào
cũng phải qua calibration benchmark.

**Trạng thái (15/11/2026): NOT STARTED, vẫn gated.**

- Không tìm thấy raw response của chẩn đoán P2A.2, nên không có pha replay $0 trên dữ liệu thật.
- Pha $0 chỉ tới mức decision-ready (so sánh phương án, protocol benchmark, ước lượng chi phí).
- Benchmark thật cần owner duyệt chi tiêu Gemini.
- Đổi cách suy ra điểm là đổi canonical authority (`docs/12_canonical_scoring.md`), cần owner quyết định.
- Usage baseline (§12) chưa đo.

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

Ưu tiên action routing trong handler hiện có. Đã ship trên `rewrite-cv`:

-   `rewrite` (hoặc không có `action`) --- Full CV
-   `cover_letter` --- P1A
-   `application_review` --- P1B (review + tối đa 1 revision trong cùng
    request; không có action `revise-after-review` riêng)
-   `follow_up` --- P2C (body chỉ `action`, `applicationId`, `language`; snapshot do server nạp)

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

Policy đã chốt (02/11/2026):

-   Analyze: giữ policy hiện tại (monthly quota + cap theo giờ).
-   Rewrite CV: cap theo giờ hiện tại, đếm mọi row `kind='rewrite'`.
-   Cover Letter + Review + Follow-up (từ P2C): chung một document cap theo giờ
    `ceil(hourlyAiLimit/2)` request (free 5/giờ), không monthly quota.
-   Review: chỉ tính khi user chủ động chạy.
-   Revision: bundled trong request review (1 request = tối đa 2 Gemini
    call).
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

**Trạng thái (05/11/2026):** cả 7 điểm đã đạt trên production (P0–P2C); MVP hoàn thành kèm nợ đã
biết của P2C (xem mục P2C).

Interview Prep và Multi-JD Intelligence là expansion sau MVP.

## 14. Thứ tự triển khai đề xuất

``` text
P0   Authority & Reliability Audit        ✅ deployed (PR #59)
 ↓
P1A  Cover Letter                         ✅ deployed (PR #61)
 ↓
P1B  Optional Application Review          ✅ deployed (PR #63, #64)
 ↓
P1C  rawJdConcepts structural fix         ✅ deployed (PR #66)
 ↓
P2A  Save Application + Snapshot          ✅ deployed (PR #67)
 ↓
P2B  Application Tracker                  ✅ deployed (PR #70)
 ↓
P2C  Follow-up                            ✅ deployed (PR #73, #74)
 ↓
M1   P2C quality fixes + A1 migration     ✅ deployed (PR #76, #77; 15/11/2026)
 ↓
P3   Interview Preparation                ⏸ paused, not released (CP6 review resource-blocked)
 ↓
P4A  Multi-JD Intelligence                ⛔ gated (Analyze stabilization + usage baseline)
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
