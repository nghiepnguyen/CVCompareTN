# Applications (P2A — Save Application + immutable snapshots; P2B — Tracker; P2C — Follow-up)

> P2C (follow-up workflow): **IMPLEMENTED — NOT YET PRODUCTION VERIFIED.** Migration
> `20261105000000` **chưa áp production**. Có blocker mở trước release, xem
> [P2C](#p2c--follow-up-workflow) (mục "Open before release").

> P2B (Application Tracker + `application_events`): **DEPLOYED / PRODUCTION VERIFIED**
> (03/11/2026). PR #70 squash merge `fa1a45f`; migration `20261104000000` áp production
> trước khi merge. Xem mục [P2B](#p2b--application-tracker--application_events) bên dưới.

Trạng thái: **DEPLOYED / PRODUCTION VERIFIED** (02/11/2026). PR #67, squash merge
`171e8a8` (production chạy `171e8a8`). Migration `20261103000000_applications_snapshots.sql`
đã áp production **trước** khi deploy app. Production smoke: PASS (case 1–8).

## Contract đã ship

| Mục | Giá trị |
|---|---|
| Bảng | `applications` + `application_documents` (immutable) |
| CV snapshot | bắt buộc |
| JD snapshot | bắt buộc |
| Cover Letter snapshot | tùy chọn |
| Status | `drafted` — Save ≠ Applied |
| Atomic save | có (một RPC, một transaction) |
| Idempotency | có, key UUID theo Save intent |
| Phụ thuộc History | không |
| Trần số application | không |
| AI call khi Save | 0 |
| Vercel function mới | 0 (tổng 9) |

Snapshot là authority lịch sử, không phụ thuộc History còn tồn tại.

## Production verification (02/11/2026)

Smoke trên cvfit.pro bằng tài khoản thường + CV/JD tổng hợp:

| Case | Kết quả |
|---|---|
| 1. Basic Save (cv + jd, không thư) | PASS |
| 2. Toàn vẹn snapshot CV/JD (JD đủ, không phải 100 ký tự `jdTitle`; metadata khớp UI) | PASS |
| 3. Remount (History → mở lại result) / idempotency: vẫn "Đã lưu", không trùng | PASS |
| 4. Cover Letter snapshot = đúng thư đang hiển thị (so SHA-256) | PASS |
| 5. Immutability (catalog: không có quyền UPDATE, trigger enabled) | PASS |
| 6. Save ≠ Applied (wording VI/EN, status `drafted`) | PASS |
| 7. History: Save disable kèm lý do | PASS |
| 8. Mobile 375 px: nút wrap, không tràn ngang | PASS |

Toàn vẹn dữ liệu: orphan 0, trùng `document_type` 0, application trùng ngoài ý muốn 0.

Bảo mật xác minh trên production (catalog, read-only): RLS chỉ owner; `anon` không
EXECUTE `save_application`; `authenticated` chỉ ghi qua RPC (không INSERT/UPDATE
trực tiếp, không DELETE document); không có `user_id` do caller cung cấp; account
lock giữ nguyên (trigger + policy restrictive); trigger UPDATE bất biến enabled.

Dữ liệu smoke tổng hợp có thể giữ tạm để đối chiếu, hoặc owner xoá qua luồng xoá
application thông thường; không dùng migration/script đặc quyền.

## Known debt

- Không copy file CV gốc.
- Không snapshot Optimized CV (`fullRewrittenCV`).
- `application_events` / tracker: P2B (xem bên dưới).
- Ghi chú disabled trên result History bị lặp ở 2 nút (LOW).
- `r2_storage.test.sql` lỗi sẵn trên base, không liên quan P2A.
- Sentry sanitization lỗi save mới có unit test, chưa gặp lỗi thật trên production.

## Authority

| Khái niệm | Bảng | Tính chất |
|---|---|---|
| Working state (CV/JD/Cover Letter/analysis hiện tại) | session (`AnalysisRunContext`, `CoverLetterAction`) | mutable |
| Application | `applications` | mutable workflow (P2B thêm đổi status) |
| Application Document | `application_documents` | **immutable** snapshot |

**P2A không có canonical analysis-record identity.** `AnalysisResult.id` chỉ tồn tại ở client và trong `history` (client ghi, bị purge/giới hạn); `analysis_log` không lưu id này. Vì vậy `source_analysis_id` là **provenance tùy chọn do client khẳng định**: không FK, không xác minh, không dùng cho phân quyền, idempotency hay render. Snapshot là authority lịch sử. P2A không đọc `history`/`analysis_log` ở bất kỳ đâu.

## Schema

`applications`: `id, user_id → auth.users (cascade), idempotency_key, source_analysis_id?, company_name?, role_title?, language vi|en, status, created_at, updated_at`.
- `status CHECK IN ('drafted')` — dùng status authority của roadmap P2B; `drafted` = mở, **chưa nộp**. Save ≠ Applied. P2B mở rộng CHECK.
- `UNIQUE (user_id, idempotency_key)` → retry-safe. Không index/unique trên `source_analysis_id`.
- Index `(user_id, created_at DESC)`.
- Không có trần số lượng application: không plan/quota canonical nào định nghĩa. Nếu cần chống lạm dụng → quyết định sản phẩm riêng qua plan/quota.

`application_documents`: `id, application_id, user_id, document_type cv|jd|cover_letter, content jsonb, metadata jsonb, created_at`.
- FK tổ hợp `(application_id, user_id) → applications(id, user_id) ON DELETE CASCADE` → không thể lệch owner.
- `UNIQUE (application_id, document_type)` (một snapshot mỗi loại ở P2A; cũng là index theo application).
- CHECK kích thước: `content` ≤ 256 KB, `metadata` ≤ 64 KB.

## Snapshot contract (`snapshotVersion: 1`)

| Loại | Bắt buộc | `content` | `metadata` |
|---|---|---|---|
| `cv` | có | `{ parsedCV }` | `{ snapshotVersion, fileName? }` |
| `jd` | có | `{ text }` (JD session đầy đủ) | `{ snapshotVersion, analysis: { matchScore, passProbability, scoreVersion?, probabilityVersion?, requirements[] } }` |
| `cover_letter` | không | `{ text }` (bản đang hiển thị, kể cả bản "Dùng bản đã chỉnh") | `{ snapshotVersion, language }` |

- CV authority = `parsedCV` (cùng nguồn P1A/P1B dùng). Raw CV text không có ở client với file upload; **không copy file gốc** (PDF/DOCX) — đủ cho P2 MVP, ghi nợ nếu cần tải lại đúng file.
- Optimized CV (`fullRewrittenCV`) **không** được snapshot: "CV submitted" ở P2A = CV gốc đã parse.
- Score/requirements: chỉ đóng băng giá trị tại thời điểm lưu (requirement, status, priority, cvEvidence, verification), không copy toàn bộ payload, không tạo scoring thứ hai.
- `role_title` = `roleTitle` đã verify của Cover Letter, hoặc `jobTitle` của analysis (bỏ literal fallback `'Job Position'`). `company_name` chỉ có khi Cover Letter có `employerName` đã verify; không đoán.
- Không có Cover Letter → không tạo. Lưu rồi tạo/chỉnh thư sau → snapshot cũ **không đổi**, thư mới không tự gắn vào application đã lưu (cần workflow "cập nhật tài liệu" tương lai).
- Metadata score/requirements là bối cảnh lịch sử mô tả, **không** phải authority hiện tại; không tính lại, không gọi model.

## Write path

Một RPC: `public.save_application(...)` → `{ id, created }`, gọi trực tiếp từ client (`src/services/applicationService.ts`). Không thêm Vercel function (vẫn 9), không gọi Gemini, không trừ quota.

- `SECURITY DEFINER`, `search_path = ''`, owner = `auth.uid()` (không nhận `user_id` từ client); `REVOKE` anon, `GRANT EXECUTE` authenticated. Lint "SECURITY DEFINER executable by authenticated" là **chấp nhận có chủ đích**: đây là đường ghi duy nhất.
- Validate: `idempotency_key` bắt buộc, `source_analysis_id` null hoặc 1–100 ký tự, `language`, parsedCV là object khác rỗng ≤ 200 KB, JD không rỗng ≤ 50 000 ký tự, analysis có `matchScore` number + `requirements` array ≤ 60 KB, letter ≤ 10 000 ký tự + language hợp lệ. Lỗi → `22023 invalid_application` (UI chỉ hiện thông báo chung).
- Idempotency: key do client sinh (UUID) cho **một Save intent**, scope `auth.uid() + key`. Cùng key (double click, network/RPC retry, `withAuthRetry`) → cùng application, `created:false`, không ghi gì, snapshot gốc giữ nguyên **kể cả khi payload replay khác**. Gọi song song cùng key: lần hai chờ unique index rồi trả về application của lần một (không lộ lỗi unique). Save intent mới (key mới) từ cùng analysis → application mới: không dedupe theo provenance.
- Một function plpgsql = một transaction: lỗi bất kỳ (kể cả letter sai sau khi CV/JD hợp lệ) → không còn row nào.

## Production schema preflight (read-only, 02/11/2026, `pgchcnmpuknbgyljdlyp`, PG 17.6)

Migration chỉ phụ thuộc: `auth.users(id)`, `auth.uid()`, `auth.role()`, `public.profiles(id uuid, role text, has_permission boolean)`, `public.enforce_account_unlocked()` (SECURITY INVOKER, `search_path=""`), roles `anon/authenticated/service_role`, `gen_random_uuid()`. Tất cả đã xác minh tồn tại trên production; `applications`, `application_documents`, `save_application` chưa tồn tại. Không phụ thuộc `history`/`analysis_log` (đã bỏ). Không có mutation production.

## Rollout / rollback

Thứ tự (app gọi RPC chưa tồn tại → mọi lần Save báo lỗi):

1. Áp `20261103000000_applications_snapshots.sql` lên production (`BEGIN/COMMIT`, sau review).
2. Verify read-only: 2 bảng tồn tại + RLS bật; `has_function_privilege('anon', 'public.save_application(uuid,text,text,text,text,jsonb,text,text,jsonb,text,text)', 'EXECUTE') = false`, `authenticated = true`; `authenticated` không có INSERT/UPDATE trên 2 bảng; trigger `application_documents_immutable` enabled.
3. Merge + deploy app.

Preview deploy dùng Supabase production → Save trên preview lỗi cho tới bước 1; đây là dự kiến, không phải lỗi CI.

Rollback: revert app trước; sau đó `DROP FUNCTION public.save_application(uuid, text, text, text, text, jsonb, text, text, jsonb, text, text); DROP TABLE public.application_documents; DROP TABLE public.applications; DROP FUNCTION public.application_documents_immutable();` — chỉ xoá dữ liệu P2A, không đụng bảng/hàm khác.

## Quyền

- `authenticated`: `SELECT, DELETE` trên `applications` (của mình); `SELECT` trên `application_documents` (của mình). Không INSERT/UPDATE trực tiếp.
- Trigger `application_documents_immutable` chặn UPDATE với **mọi role** (kể cả service_role) — invariant DB nghiêm ngặt, có chủ đích. Phục hồi vận hành chỉ qua migration được review, chạy bằng table owner: `ALTER TABLE public.application_documents DISABLE TRIGGER application_documents_immutable; … ENABLE TRIGGER …` (đường này có test).
- Account lock: trigger `account_unlocked` + policy RESTRICTIVE `account_unlocked_read` như các bảng user khác.
- Xoá application → documents cascade. Xoá account (`auth.users`) → cả hai cascade. Xoá history → không ảnh hưởng.

## UI

`Lưu ứng tuyển / Save application` cạnh `Tạo Cover Letter` trên header Result (`SaveApplicationAction`). States: idle → saving (chặn double click bằng ref + disabled) → saved (`Đã lưu ứng tuyển`, giữ `applicationId`) / error. Một key cho mỗi result trong phiên trang (Map ở module scope, sống qua việc unmount Result khi mở History/Profile; reload trang thì mất); giữ nguyên khi lỗi (không chắc đã commit hay chưa) nên bấm lại là replay an toàn — nếu lần đầu đã commit, trả application đó với snapshot gốc. Kết quả đã lưu giữ trạng thái khi chuyển qua lại giữa các result. Không dùng chữ "nộp". Từ History: unavailable (thiếu JD gốc), cùng lý do như Cover Letter. Chưa có màn Applications (P2B).

Telemetry: GA `application_saved { created, has_cover_letter }`; Sentry chỉ nhận `save_application failed: <code>` (không gửi object lỗi PostgREST vì `details` có thể lặp lại giá trị row).

## Tests

- SQL: `supabase/tests/applications.test.sql` — quyền, owner, spoof, provenance tùy chọn, RPC không đọc history, immutability (owner + service_role + đường migration), cross-user, replay cùng key (payload khác không đổi snapshot), save intent riêng, rollback khi lỗi ở cv/jd/cover_letter, locked account, history delete, không có cap ẩn (600+ application), cascade, account delete.
- SQL song song: `supabase/tests/applications_concurrency.test.sql` (dblink, 2 session cùng key → 1 application, 2 documents, snapshot A).
- Chạy: `supabase/tests/local/run.sh "$PWD" /repo/tests/applications.test.sql /repo/tests/applications_concurrency.test.sql`.
- Client: `SaveApplicationAction.test.tsx`, `CoverLetterAction.test.tsx` (letter propagation).

## Future

- ~~P2B: `GRANT UPDATE (status, ...)` theo cột~~ — superseded: P2B không cấp UPDATE nào; mọi mutation qua RPC (xem mục P2B).
- P3 Interview Prep: đọc `application_documents` (cv/jd/cover_letter + requirements trong metadata JD), không dùng CV hiện tại.
- Nếu cần "cập nhật tài liệu": tạo snapshot/version mới (bỏ UNIQUE theo type, thêm version), không UPDATE.

---

# P2B — Application Tracker + `application_events`

Trạng thái: **DEPLOYED / PRODUCTION VERIFIED** (03/11/2026). PR
[#70](https://github.com/nghiepnguyen/CVCompareTN/pull/70) squash merge `fa1a45f`
(production chạy `fa1a45f`, Vercel deployment `7506246116` success).

## Production rollout (03/11/2026, `pgchcnmpuknbgyljdlyp`, PG 17.6)

| Bước | Kết quả |
|---|---|
| CI PR #70 (Lint/Test/Build, CodeQL ×3, GitGuardian, Vercel ×2) | 7/7 PASS, HEAD `5ef1262` |
| Preflight read-only | PASS: `20261104000000` chưa ghi; `applications_status_check = CHECK ((status = 'drafted'::text))`; 2 application (đều `drafted`), 5 document; cột/constraint P2A đủ; chưa có `deadline`/`applied_at`/`application_events`/6 hàm P2B; trigger documents enabled; thân `save_application` md5 = bản P2A; phụ thuộc đủ |
| Dry-run `supabase db push --linked --dry-run` | đúng 1 migration: `20261104000000_application_tracker.sql` |
| Áp migration | `supabase db push --linked`, 2026-11-02T23:34:53Z (UTC) |
| Verify DB (read-only) | PASS: status CHECK 9 giá trị; `deadline date`, `applied_at timestamptz`; constraints/index/RLS/policy RESTRICTIVE/trigger immutable + account lock trên `application_events`; 3 RPC DEFINER + `search_path=""`, anon không EXECUTE; helper không cho client; `authenticated` không UPDATE applications, không INSERT/UPDATE/DELETE events; backfill 2 `created` (khớp `created_at`), 0 orphan/trùng/lệch owner; fingerprint applications + documents **không đổi** |
| Merge + deploy | squash `fa1a45f`; Vercel production success (GitHub deployment `7506246116`); cvfit.pro phục vụ chunk `ApplicationsView` |
| Function / AI | Vercel function 9 (PR không đổi `api/`; build PASS — không phải đếm từ Vercel). AI call của P2B: 0 (smoke dùng 1 lần Analyze có sẵn để tạo application mới, không phải call của P2B) |

## Production smoke (tài khoản thật, dữ liệu tổng hợp)

| Case | Kết quả |
|---|---|
| List VI/EN, reload `/vi/applications`, `/en/applications` | PASS |
| Application P2A cũ: Overview / Documents (snapshot, "Điểm khi lưu: 72/100" + giải thích) / Timeline (`created` backfill) | PASS |
| Analyze tổng hợp → Lưu ứng tuyển: `drafted`, cv + jd, JD đầy đủ, đúng 1 `created` | PASS |
| drafted → applied (Nộp lần đầu được ghi) → interview (applied_at giữ nguyên) | PASS |
| interview → rejected → interview: hộp xác nhận rời trạng thái kết thúc; event cũ giữ nguyên | PASS |
| Sửa company/role/deadline; xoá deadline; no-op không tạo event | PASS |
| Hai tab: tab A lưu, tab B lưu bản cũ → `stale_application` VI, dữ liệu mới tải lại, tab A không bị ghi đè, 0 event của tab B | PASS |
| Ghi chú (có `<b>`) hiển thị dạng text, status không đổi | PASS. Riêng tư: tracker không gửi analytics event; Sentry chỉ nhận thông báo chung cho lỗi không xác định (theo code + test); console cuối sạch. Không chặn/kiểm tra lưu lượng mạng độc lập khi gửi ghi chú |
| Timeline: 4 loại event, câu có nghĩa, không JSON/không giá trị DB thô | PASS |
| Sort: chỉ allowlist, không score; mặc định hoạt động gần nhất | PASS |
| Mobile 375 px (phiên thật, tài khoản thường 5 mục nav): list, detail, 3 tab, form status/details/note — không tràn ngang | PASS |
| Lỗi runtime | Smoke owner: 0 lỗi RLS/RPC ngoài dự kiến. Lần tải cuối: 0 lỗi console, mọi request đọc tracker 200. Kết quả các mutation (status, correction, details, note, stale của tab B — 4xx dự kiến) xác minh qua UI + timeline DB, không qua log mạng |
| Integrity sau smoke: 3 application, 7 document, 11 event; orphan/trùng/lệch owner 0; snapshot P2A không đổi; timeline smoke khớp đúng thao tác | PASS |

Smoke chỉ đi qua một số transition tiêu biểu; authority cho toàn bộ 29 cạnh / 81 cặp là SQL test.

Bảo mật đã xác minh trên production (catalog, read-only): cấu hình RLS, grant RPC, SECURITY DEFINER, `search_path` rỗng, chặn ghi trực tiếp, trigger bất biến, cấu hình account lock.

**Khoảng trống xác minh (rủi ro thấp, không phải lỗi chức năng):**
- Cross-user isolation: covered by SQL tests and verified production policy/grant configuration; not independently smoke-tested with a second production account.
- Nav mobile 6 mục của admin ở 375 px: chưa smoke production (chỉ đo bằng harness local).
- Header 1024 px của admin có badge Pro/Recruiter: chưa smoke production.

Application smoke (`P2B Smoke Corp`, status `interview`) được giữ lại để đối chiếu.

**Rollback từ nay:** production đã có status khác `drafted` ⇒ app rollback = promote/redeploy build trước đó (tương thích P2A); giữ nguyên schema additive và lịch sử event P2B. Không khôi phục status CHECK cũ, không `DROP application_events`.

## Phạm vi đã chốt

| Mục | Quyết định |
|---|---|
| Tạo application | **Chỉ** từ Analysis Result → Save Application (P2A). Tạo tay: **DEFERRED** — yêu cầu roadmap "create from a result **or by hand**" còn mở một phần. Không nới snapshot CV/JD bắt buộc. |
| Final status | `hired`, `rejected`, `no_response`, `offer_declined`, `withdrawn` là kết cục sản phẩm, **không** phải ngõ cụt DB: sửa sai = transition mới + event mới; event cũ bất biến. UI bắt xác nhận khi rời final. |
| Sửa thông tin | `company_name`, `role_title`, `deadline` (metadata workflow, mutable). Không đụng snapshot, analysis metadata, score, requirements. |
| Next action | **DEFERRED → P2C** (chưa có model persisted; không sinh bằng AI). |
| Last contact | Không có event "contact" ở P2B → hiển thị **Last activity** = `applications.updated_at` (mọi mutation P2B đều bump). P2C có thể thêm event contact/follow-up. |
| `no_response` | Chỉ user chọn thủ công. Không cron/timer/suy luận theo số ngày (P2C). |
| Score | Chỉ trong Application Detail → Documents, nhãn "Điểm khi lưu / Score at save time" + giải thích không phải điểm hiện tại. Không ở list card, không sort/rank/so sánh/trend (P2A.2 MODEL_VARIANCE 75–88). |
| AI call | 0. Vercel function: 9 (không thêm route; dùng Supabase RPC). |

## Status authority

Nguồn duy nhất: `supabase/application_status_transitions.json`.
- DB: `public.application_status_transition_allowed(from, to)` (IMMUTABLE, không cấp cho client). SQL test đọc file JSON (`pg_read_file`) và so **cả 81 cặp** — lệch là FAIL (đã thử: thêm `hired→rejected` vào JSON làm test fail).
- Client: `src/services/applicationTypes.ts` import cùng file JSON (chỉ để hiện lựa chọn; server vẫn là authority). Vitest khẳng định danh sách status client = JSON.

Statuses: `drafted, applied, interview, offer, hired, rejected, no_response, offer_declined, withdrawn` (không alias).

| Từ | Được phép sang | Lý do của nhánh sửa sai |
|---|---|---|
| drafted | applied, withdrawn | — |
| applied | interview, rejected, no_response, withdrawn, **drafted** | drafted: bấm "đã ứng tuyển" nhầm |
| interview | offer, rejected, no_response, withdrawn, **applied** | applied: ghi phỏng vấn nhầm |
| offer | hired, offer_declined, rejected, withdrawn, **interview** | rejected: offer bị rút; interview: ghi offer nhầm |
| hired | offer | ghi nhận việc nhầm |
| rejected | applied, interview, offer | ghi nhầm / quy trình mở lại (offer: hoàn tác `offer→rejected`) |
| no_response | applied, interview, rejected | đánh dấu quá sớm / phản hồi muộn (mời PV hoặc từ chối) |
| offer_declined | offer | từ chối nhầm / cân nhắc lại |
| withdrawn | drafted, applied, interview, offer | rút nhầm: user chọn lại giai đoạn trước (không suy từ lịch sử) |

Mọi cạnh đi **vào** một final đều có cạnh hoàn tác ngược lại. Same-state (kể cả `interview→interview`) bị từ chối; vòng phỏng vấn thêm thuộc event mở rộng sau này. Không có `drafted→offer/hired`, `no_response→hired`.

## Schema (migration `20261104000000_application_tracker.sql`, additive)

`applications`:
- `applications_status_check` mở rộng 9 status (DROP + ADD cùng tên; tên auto của P2A đã được xác nhận local, test khẳng định tên).
- `deadline date NULL` (CHECK 2000-01-01..2100-12-31), `applied_at timestamptz NULL`.
- Index `(user_id, updated_at DESC, id DESC)` cho list mặc định.
- Không thêm cột score.

`applied_at` = `occurred_at` của **lần đầu** chuyển sang `applied` (set khi `applied_at IS NULL`); không bao giờ ghi đè khi sửa trạng thái. Vì vậy có thể tồn tại `drafted` + `applied_at` (vd `drafted→applied→withdrawn→drafted`): đó là ngày nộp lịch sử, **không** phải tín hiệu "đang nộp". UI gọi là **"Nộp lần đầu / First applied"** (list, Overview, sort); Overview có một dòng chú thích nhỏ hiển thị sẵn (không chỉ hover, vì mobile không có hover): "Ngày ứng tuyển được ghi nhận lần đầu. Không thay đổi khi trạng thái được chỉnh sửa." / "The first recorded application date. It does not change when the status is corrected later." (P2B.1, quyết định của product: giữ nguyên hành vi DB). P2C không được dùng `applied_at` một mình để quyết định follow-up. Client không ghi trực tiếp.

`application_events` (append-only):
`id, application_id, user_id, event_type created|status_changed|note|details_updated, from_status?, to_status?, note? (1–2000), metadata jsonb object ≤ 16 KB (đủ cho 4 giá trị 200 ký tự kể cả escape JSON tệ nhất), occurred_at, idempotency_key uuid, created_at`.
- FK tổ hợp `(application_id, user_id) → applications(id, user_id) ON DELETE CASCADE`.
- `UNIQUE (user_id, idempotency_key)`; partial unique `(application_id) WHERE event_type='created'` (đúng 1 created/app).
- CHECK hình dạng theo loại: `status_changed` có from/to khác nhau; `note` có note; `details_updated` có `metadata.changedFields` array; `created` không có from/to/note.
- Index timeline `(application_id, occurred_at DESC, created_at DESC, id DESC)` = đúng thứ tự trang timeline.
- Trigger `application_events_immutable` chặn UPDATE với **mọi** role (giống documents). DELETE chỉ qua cascade khi xoá application/account.

Backfill: `INSERT … SELECT` một `created` event cho mỗi application có sẵn (`occurred_at = created_at = applications.created_at`, key = `applications.idempotency_key`), `ON CONFLICT (application_id) WHERE event_type='created' DO NOTHING` → chạy lại không trùng. Không đổi id/status/snapshot; `applied_at`/`deadline` = NULL. Không hardcode id production.

## RPC (SECURITY DEFINER, `search_path=''`, owner = `auth.uid()`, anon không EXECUTE)

| RPC | Việc |
|---|---|
| `save_application(...)` (signature P2A giữ nguyên) | Thêm `created` event trong cùng transaction. Replay cùng key: cùng app, `created:false`, không thêm document/event. |
| `transition_application_status(p_application_id, p_expected_status, p_to_status, p_occurred_at, p_note, p_idempotency_key)` | Thứ tự: caller (auth + account lock) → validate input → `pg_advisory_xact_lock(user,key)` → replay lookup → `FOR UPDATE` theo owner → CAS `expected_status` → matrix → UPDATE status/`updated_at`/`applied_at` + INSERT `status_changed` (from_status lấy từ server). |
| `add_application_note(p_application_id, p_note, p_idempotency_key)` | Trim, 1–2000 ký tự; bump `updated_at`; không đổi status. |
| `update_application_details(p_application_id, p_expected_updated_at, p_company_name, p_role_title, p_deadline, p_idempotency_key)` | Optimistic concurrency (P2B.1): caller → validate (version bắt buộc) → advisory lock → **replay** → `FOR UPDATE` theo owner → so `updated_at = p_expected_updated_at`, khác ⇒ `stale_application`, không update, không event. Version = cả row (mọi mutation P2B — sửa thông tin, đổi status, ghi chú — đều bump `updated_at`), không versioning theo field. Trả về `application {company_name, role_title, deadline, updated_at}` hiện tại. Thay toàn bộ 3 trường (blank/NULL = xoá), ≤ 200 ký tự, deadline là `date`. No-op → `changed:false`, không event, không bump. Metadata chỉ trường đổi: `{"changedFields":["deadline"],"deadline":{"from":null,"to":"2026-11-15"}}`. Không đụng `source_analysis_id, language, idempotency_key, created_at, applied_at, status`. |

Helper nội bộ (không cấp cho client): `application_tracker_caller()` (INVOKER: `not_authenticated` / `account_locked` kiểm tra **trước** mọi lookup, nên user bị khoá không biết app tồn tại hay intent đã ghi), `application_status_transition_allowed()`.

`occurred_at`: lưu UTC; NULL = `now()`; từ chối > now + 5 phút (clock skew) hoặc < now − 10 năm; cho phép quá khứ (cập nhật tracker sau sự kiện). UI: chọn ngày ICT; hôm nay → NULL (server now), ngày quá khứ → `YYYY-MM-DDT12:00:00+07:00`.

Error vocabulary (message = code; UI map sang VI/EN, không hiện SQL/constraint/row):

| Code | SQLSTATE |
|---|---|
| `not_authenticated`, `account_locked` | 42501 |
| `application_not_found` | P0002 |
| `stale_status`, `stale_application`, `invalid_transition` (matrix) | P0001 (không dùng 40001 để client không coi là retryable) |
| `invalid_transition` (status lạ), `invalid_occurred_at`, `invalid_note`, `invalid_details` | 22023 |

## Idempotency

Mỗi intent (đổi status / ghi chú / sửa thông tin) một `crypto.randomUUID()`, scope `auth.uid() + key` trong `application_events`. Không dùng content hash hay app+status.
- Server: advisory lock theo (user, key) **trước** replay lookup ⇒ retry sau khi lần đầu đã commit (kể cả `expected_status` đã cũ) trả về kết quả gốc (`replayed:true`) thay vì `stale_status` / `stale_application` (replay luôn thắng CAS); hai request song song cùng key ⇒ một event, không lộ lỗi unique. Payload replay khác ⇒ giữ kết quả gốc.
- Client (`useTrackerMutation`): key ở module scope theo `action:applicationId` (sống qua remount); giữ khi lỗi không chắc chắn (`unknown`: network/5xx) ⇒ bấm lại = replay an toàn; xoá khi thành công, khi server từ chối dứt khoát (mọi code trong vocabulary — không có gì đã commit) và khi user bấm Hủy. Double click bị chặn bằng ref + disabled. Nếu user sửa nội dung rồi retry sau lỗi không chắc chắn và lần đầu thật ra đã commit, server trả bản gốc; timeline sau reload cho thấy bản đã ghi.
- Sửa thông tin (P2B.1): form giữ `updatedAt` lúc mở làm version kỳ vọng (gửi nguyên chuỗi server, không qua `Date` để không mất micro giây). Thành công ⇒ áp ngay row server trả về rồi reload. `stale_application` ⇒ key bị xoá (bị từ chối dứt khoát, không phải retry mạng), reload, form thay giá trị bằng dữ liệu mới nhất + version mới và hiện "Ứng tuyển này đã được cập nhật ở nơi khác. Dữ liệu mới nhất đã được tải lại, vui lòng kiểm tra và thử lại." / EN tương ứng; bản sửa bị từ chối không được gửi lại. Lần lưu tiếp theo (user chủ động sau khi xem) = intent mới, key mới. Lỗi mạng vẫn giữ key cũ.

## Quyền / RLS / account lock

- `application_events`: RLS bật; policy owner SELECT; RESTRICTIVE `account_unlocked_read`; trigger `account_unlocked`. `authenticated`: chỉ SELECT. `anon`: không gì. `service_role`: mặc định.
- `applications`: grant P2A giữ nguyên (`SELECT, DELETE`); **không** cấp UPDATE.
- Account lock: user bị khoá không đọc applications/documents/events, không gọi được 3 RPC. `account_lock.test.sql` khẳng định danh sách bảng tường minh (8 bảng public) + số trigger 8 / policy 9.
- Note là dữ liệu riêng tư: không gửi Gemini/Sentry/analytics, không log. Sentry chỉ nhận `application tracker mutation failed` (không message lỗi gốc, không code chi tiết) cho lỗi `unknown`; lỗi nghiệp vụ không báo Sentry. Note render dạng text (React escape), không HTML.

## UI

- Tab `applications`: `/vi/applications`, `/en/applications` (reload trực tiếp OK — rewrite SPA sẵn có). Desktop header + MobileBottomNav (nav mobile thu nhỏ `min-w` 64→56px để 6 mục của admin vừa 375px; đã đo: 375/375).
- List (`ApplicationsView`): card công ty / vị trí (fallback "Chưa có công ty / Company not set", "Chưa có vị trí / Role not set"), status (nhãn bản địa, không hiện giá trị DB thô), hạn nộp, ngày ứng tuyển, hoạt động gần nhất. Không Kanban. Phân trang `.range()` 20/trang (+1 dòng look-ahead), "Tải thêm". Sort allowlist: `updated_at` (mặc định, desc) / `created_at` / `applied_at` (desc) / `deadline` (asc) / `company_name` (A–Z); NULL cuối; tie-break `id`. `status` không có trong sort (thứ tự chữ cái của giá trị DB vô nghĩa). Score không phải sort authority (test).
- Detail: `Overview | Documents | Timeline` (motion `layoutId`). Overview: trường workflow + 3 action (đổi status, sửa thông tin, thêm ghi chú). Documents: snapshot CV (`parsedCV` tóm tắt), JD, Cover Letter hoặc "Không có Cover Letter khi lưu", điểm + requirements tại thời điểm lưu (chỉ đọc, không tính lại, không so với Analyze hiện tại); không có action sửa/tạo lại. Timeline: newest-first `occurred_at DESC, created_at DESC, id DESC` (id phá hoà thời gian ⇒ ổn định), câu có nghĩa (VI/EN), không JSON thô. Phân trang `.range()` 50/trang + 1 dòng look-ahead, nút "Xem thêm / Load more"; không tải toàn bộ, không cắt im lặng. Event append-only nên event mới giữa hai lần tải chỉ đẩy dòng xuống (trùng, không thiếu) ⇒ client gộp theo id. Mutation ⇒ reload từ trang đầu. Rỗng ⇒ "Chưa có hoạt động nào."
- Ngày: helper trong `src/lib/vnTime.ts` (`formatVnDate`, `formatVnDateTime`, `formatPlainDate` cho `date` không dịch múi giờ, `vnTodayYmd`). Không có module định dạng thứ hai.
- Xoá application: P2A không có UI xoá → P2B không thêm (grant DELETE vẫn có, chưa dùng ở client).

## Tests

- SQL `application_tracker.test.sql`: catalog (grants, DEFINER/search_path, helper không lộ, trigger/policy, không cột score), matrix = JSON (81 cặp), **81 cặp qua RPC** (allowed → 1 event đúng from/to; rejected → status không đổi, 0 event), alias status, CAS, `applied_at` lần đầu + không ghi đè, occurred_at, note, details (một/nhiều trường, no-op, clear, blank→NULL, giới hạn, không đụng cột khác/snapshot), INSERT/UPDATE/DELETE trực tiếp bị chặn, cross-user, khoá tài khoản, immutability service_role, FK tổ hợp, 1 created/app, shape CHECK, cascade, xoá account, details CAS (đúng version ⇒ 1 event + row trả về; sai version ⇒ `stale_application`, 0 event; retry intent đã commit ⇒ replay, không stale; note làm version cũ; version NULL ⇒ invalid), atomicity (lỗi chèn event ⇒ rollback save/transition/details/note).
- SQL `application_tracker_concurrency.test.sql` (dblink): cùng key song song cho transition (payload khác) / note / details ⇒ 1 event, kết quả gốc; hai intent khác nhau đua nhau ⇒ cái cũ nhận `stale_status`; hai lần sửa thông tin khác key cùng version ⇒ một thắng, cái kia `stale_application`, không event.
- SQL backfill: `FIXTURE_BEFORE=20261104000000:/repo/tests/fixtures/pre_p2b_applications.sql supabase/tests/local/run.sh "$PWD" /repo/tests/applications_backfill.fixture-test.sql` (25 application P2A trước migration ⇒ giữ nguyên + đúng 1 created event; chạy lại backfill = 0 row). Hook `FIXTURE_BEFORE` mới trong `run.sh`.
- P2A regression: `applications*.test.sql` PASS không sửa; `account_lock.test.sql` cập nhật.
- Client: `applicationTracker.test.ts` (matrix/status, sort allowlist + score bị từ chối, range/order, lỗi sanitize), `ApplicationsView.test.tsx`, `ApplicationDetailView.test.tsx` (tabs, documents, score label, timeline, status/note/details: double click, key reuse qua remount, stale, final confirm VI/EN, no-op).

## Rollout (chưa làm — cần review)

1. Preflight **read-only** production (mọi mục phải đúng; sai ⇒ dừng, không áp):
   - `supabase_migrations.schema_migrations` chưa có version `20261104000000`.
   - `pg_get_constraintdef` của `public.applications.applications_status_check` = `CHECK ((status = 'drafted'::text))` (tên đúng, định nghĩa P2A); `SELECT DISTINCT status FROM public.applications` chỉ có `drafted`.
   - `public.applications` có các cột P2A (`id, user_id, idempotency_key, source_analysis_id, company_name, role_title, language, status, created_at, updated_at`), **chưa** có `deadline`, `applied_at`; constraint `applications_user_idempotency_unique` (dùng bởi `ON CONFLICT ON CONSTRAINT`) và `applications_id_user_unique` (đích FK tổ hợp) tồn tại; index `applications_user_updated_idx` chưa tồn tại.
   - `public.application_documents` tồn tại; trigger `application_documents_immutable` enabled.
   - `to_regclass('public.application_events') IS NULL`; các hàm `application_status_transition_allowed(text,text)`, `application_events_immutable()`, `application_tracker_caller()`, `transition_application_status(...)`, `add_application_note(...)`, `update_application_details(...)` chưa tồn tại.
   - `public.save_application(uuid,text,text,text,text,jsonb,text,text,jsonb,text,text)` tồn tại, SECURITY DEFINER, thân = bản P2A (so với `supabase/rollback/20261104000000_save_application_p2a.sql`).
   - Phụ thuộc: `public.enforce_account_unlocked()` (INVOKER), `public.profiles(id, role, has_permission)`, `auth.uid()`, `auth.role()`, roles `anon/authenticated/service_role`, `gen_random_uuid()`, `hashtextextended()` (PG ≥ 11; production PG 17.6).
   - Ghi lại `SELECT count(*) FROM public.applications` để so với số `created` event sau backfill.
2. Áp `20261104000000_application_tracker.sql` (`BEGIN/COMMIT`) **trước** deploy app (app cũ vẫn chạy: chỉ thêm cột/bảng; `save_application` giữ signature).
3. Verify read-only: số `created` event = số application; `has_function_privilege` anon=false / authenticated=true cho 3 RPC; authenticated không INSERT/UPDATE/DELETE events, không UPDATE applications; trigger `application_events_immutable` enabled.
4. Merge + deploy app; smoke production: list (2 app smoke P2A hiện có, company/role NULL fallback), detail 3 tab, đổi status drafted→applied (applied_at), ghi chú, sửa deadline, final correction có xác nhận, mobile 375 px, `/vi/applications` reload.

## Rollback

App và schema rollback **tách biệt**:
- Lỗi ứng dụng ⇒ rollback deployment app; **để schema P2B ở trạng thái ngủ** (additive, app P2A không dùng tới). `save_application` mới vẫn tương thích app P2A.
- Không tự động `DROP application_events`, thu hẹp status CHECK hay xoá timeline sau khi user đã có dữ liệu P2B: khi đã có status khác `drafted`, CHECK P2A **không thể** khôi phục an toàn.
- Chỉ revert riêng phần tích hợp `save_application`: `supabase/rollback/20261104000000_save_application_p2a.sql` (thân P2A nguyên văn, đã chạy thử local: P2A tests PASS sau khi áp). Save sau đó sẽ không có created event.
- *(Không còn áp dụng từ 03/11/2026: production đã có dữ liệu P2B.)* Gỡ toàn bộ chỉ khi **chưa** có dữ liệu P2B (0 event ngoài `created`, mọi status = `drafted`): `DROP FUNCTION` 3 RPC (`update_application_details(uuid, timestamptz, text, text, date, uuid)`) + 2 helper + `application_events_immutable()`; áp rollback script trên; `DROP TABLE public.application_events`; `ALTER TABLE public.applications DROP COLUMN deadline, DROP COLUMN applied_at`; khôi phục CHECK `IN ('drafted')`; `DROP INDEX applications_user_updated_idx`.

## Known debt (P2B)

- Tạo application thủ công: deferred.
- Next action / follow-up / last contact: P2C.
- Application detail has no persistent deep link. Reloading detail returns to Applications list. (Chấp nhận, không chặn P2B.)
- ~~Timeline tối đa 200 event~~ — P2B.1: phân trang 50/trang.
- ~~Details không có CAS~~ — P2B.1: `p_expected_updated_at` + `stale_application`.
- Version của details là cả row: một ghi chú/đổi status ở tab khác cũng làm bản sửa thông tin đang mở thành stale (an toàn, user xem lại rồi lưu).
- ~~Chưa smoke UI có đăng nhập thật~~ — đã smoke production 03/11/2026 (xem Production smoke; khoảng trống xác minh liệt kê riêng ở đó).
- `no_response` tự động: không triển khai (chỉ user chọn).

---

# P2C — Follow-up workflow

Trạng thái: **IMPLEMENTED — NOT YET PRODUCTION VERIFIED.** Nhánh `feat/p2c-contact-events`
(HEAD `5988756` + commit docs này). Migration `20261105000000_application_follow_up.sql`
**chưa áp production**. Fallback P2C.0 (Timeline hiển thị event type lạ bằng title chung)
đã deploy trước: PR #72, merge `b6e3c47` = **SHA rollback tối thiểu** cho schema P2C
(không phải `3a3a5bb`). Plan: `docs/superpowers/plans/2026-11-03-p2c-follow-up-workflow.md`.

Không có Vercel function mới (tổng 9), không đổi file Analyze (so với `b6e3c47`), không có
quota tháng cho follow-up (xem [Quota](#quota-p2c)).

## Event authority

| Mục | Giá trị |
|---|---|
| Event type mới | `follow_up_sent`, `contact_received` (CHECK `application_events_event_type_check` mở rộng, additive) |
| Shape (`application_events_shape`) | `from_status IS NULL AND to_status IS NULL`; `note` tùy chọn; nhánh P2B giữ nguyên, type lạ fail closed (`ELSE false`) |
| Writer duy nhất | RPC `log_application_contact(p_application_id, p_event_type, p_occurred_at, p_note, p_idempotency_key) → jsonb {event_id, replayed}` |
| Bảo mật RPC | SECURITY DEFINER, `search_path=''`, owner = `auth.uid()`; anon không EXECUTE, authenticated có |
| Status cho phép | `applied`, `interview`, `offer` (allow-list). `drafted` và mọi status final ⇒ `contact_not_allowed` |
| Idempotency | cùng namespace `(user, key)` với P2B (`pg_advisory_xact_lock` → replay → khóa row → ghi) |
| Ghi chú | tối đa 2000 ký tự; `occurred_at` null = `now()`, cho phép quá khứ tới 10 năm, tương lai tối đa 5 phút |

Mã lỗi RPC: `invalid_contact` (22023; id/key/type null hoặc type ngoài 2 giá trị),
`invalid_note` (22023), `invalid_occurred_at` (22023), `application_not_found` (P0002; cross-account
giống không tồn tại), `contact_not_allowed` (P0001). Client map hai mã mới thành **từ chối
dứt khoát** (`isDefiniteRejection`), xoá intent key.

UI chỉ mở ghi event cho `applied`; RPC vẫn nhận `interview`/`offer` (UI không lộ, xem nợ chấp nhận).

## Derivation (view `application_follow_up_state`)

Một row cho mỗi application `status = 'applied'`; không có cột nào lưu trên `applications`.

- **Anchor** = event `status_changed` được **chèn mới nhất** (`created_at DESC, id DESC`) có
  `to_status = applications.status`. `stage_entered_at` = `occurred_at` của anchor (re-apply
  backdate vẫn neo ở episode mới).
- **Episode scope (Task 3):** event contact chỉ tính khi `e.created_at >= anchor.created_at`
  (cả `last_contact_at` lẫn đếm follow-up). Nếu không, một reply/follow-up của episode cũ có
  `occurred_at` muộn hơn sẽ điều khiển episode re-apply mới.
- **Known limit:** `created_at` là thời điểm bắt đầu transaction, nên khi một contact đua với
  một transition trên cùng app, event có thể bị gán vào episode kề bên (cả hai chiều: contact
  đua với re-apply; follow-up thời `interview` đua với sửa `interview → applied`). Tác động
  tối đa một event.
- `last_contact_at = greatest(stage_entered_at, max(occurred_at) của mọi contact trong episode)`.
- `follow_ups_since_reset` = số `follow_up_sent` trong episode có `occurred_at` **strictly
  after** `greatest(stage_entered_at, max(occurred_at) của contact_received)` (reply thắng khi hoà).
  Follow-up có `occurred_at` tại/trước mốc reset (`greatest(stage_entered_at, reply)`) **không dời timer và không được đếm** (không thể là max của `last_contact_at`); nó chỉ xuất hiện trên Timeline.
- `follow_up_due_at = last_contact_at + 7 ngày`.
- `follow_up_state`: `limit_reached` nếu `follow_ups_since_reset >= 2`; ngược lại `due` nếu
  `now() >= follow_up_due_at`; ngược lại `waiting`.
- App `applied` không có anchor (chỉ xảy ra khi ghi trực tiếp bằng service) ⇒ **không có row**.
  Consumer đọc là "không có chỉ báo", không phải lỗi, không tự tính lại ở client.
- Ngưỡng 7 ngày và giới hạn mềm 2 follow-up là hằng số trong view. Giới hạn mềm không chặn
  log: lần thứ ba vẫn được ghi (UI vẫn hiện nút).

`contact_received` (Employer replied): reset đồng hồ (7 ngày tính lại từ reply) và reset bộ
đếm follow-up về 0. Hệ thống không suy luận nội dung phản hồi; không đổi status.

## View, security_invoker và grants

`CREATE VIEW ... WITH (security_invoker = true)`: RLS của bảng gốc (owner + RESTRICTIVE
`account_unlocked_read`) áp cho người gọi. `REVOKE ALL FROM PUBLIC, anon, authenticated`, rồi
`GRANT SELECT TO authenticated, service_role` (authenticated chỉ SELECT). View không có cột
`user_id`; server (service_role) chứng minh ownership bằng query `applications` có
`user_id` ngay trước đó. `security_invoker` cần PG >= 15 (production PG 17.6; **phải kiểm lại
trong preflight Phase C**).

## Index: NO INDEX NEEDED (Task 4)

Đo trên DB local dựng từ migration, 5.600 application, 108.410 event (lịch sử lớn nhất 250
event), chạy bằng role `authenticated` có RLS, `EXPLAIN (ANALYZE, BUFFERS)`, 2 lần chạy
độc lập. Cả 3 lateral dùng `application_events_timeline_idx` với Index Cond
`application_id = a.id`: công việc tỉ lệ với lịch sử của chính app và số app `applied` của
caller, không với cả bảng. Ba dạng query: một app (median 0,148 ms, 39 buffers), lô 20 id
(0,569 ms, 394 buffers), trang "due" `LIMIT 21` (median 4,85 ms, 5.548 buffers, tuyến tính
theo số app `applied`, khoảng 13 buffers mỗi app). Ứng viên
`(application_id, event_type, occurred_at DESC)` được planner chọn cho 2/3 lateral, giảm
buffer 5,5% (due page) và 14% (lô), không giảm thời gian ⇒ không thêm index (tránh index thứ
năm trên bảng append-only mọi RPC đều ghi). Xem lại nếu một caller có hàng nghìn app
`applied`. Giới hạn của phép đo: seed làm `created_at ≈ occurred_at`; chỉ đo custom plan
(không generic plan); chi phí ghi/lưu của index không được đo; comment tripwire trong SQL test
còn câu chữ cũ. Test `application_follow_up.test.sql` vẫn khẳng định không có index
`%contact%`; nếu sau này thêm index đó phải sửa test.

## AI boundary (`action: 'follow_up'`)

- **Body allowlist:** chỉ `action`, `applicationId` (UUID), `language` (`vi|en`, tùy chọn).
  Key lạ ⇒ 400 (client không gửi được CV/JD/thư/ghi chú).
- **Server tự nạp snapshot** (`_server-lib/rewriteCv/followUpContext.ts`), lọc theo `user_id` cho `applications` (`id, status, language, company_name, role_title`) và
  `application_documents` (`document_type, content, language:metadata->>language`); view
  `application_follow_up_state` (chỉ `follow_ups_since_reset`) không có cột `user_id`, ownership
  đến từ query `applications` ngay trước đó.
- **Đầu vào tới Gemini:** CV (parsedCV đã serialize), JD đầy đủ, thư xin việc đã nộp (chỉ làm
  ngữ điệu, không phải nguồn sự thật), company/role, thứ tự follow-up (1/2/3 bằng chữ, từ lần 4 là "lần tiếp theo"/"another").
- **Loại trừ:** `metadata` của JD snapshot (kết quả analyze, score) **không bao giờ được select**
  (chỉ lấy scalar `language` qua alias, trên mọi row); loader không bao giờ select nội dung
  event/ghi chú (chỉ đọc `follow_ups_since_reset` từ view, view tự tổng hợp `application_events` trong DB); ngày tracker không phải đầu vào; không điểm/matchScore.
- **Ngôn ngữ:** body `language` > `language` trong metadata của snapshot thư > `applications.language` > `vi`. UI chỉ gửi
  `language` sau khi người dùng chủ động bấm đổi.
- **Chỉ `applied`** (khác ⇒ 409). Không ghi gì ngoài hàng `analysis_log`; không event, không đổi status, không lưu bản nháp.
- **Guard:** bản nháp bắt buộc bắt đầu bằng lời chào cố định (VI "Kính gửi Anh/Chị phụ trách tuyển dụng,", EN "Dear Hiring Team,"), tối đa 1500 ký tự, không honorific + tên viết hoa (Mr/Mrs/Ms/Miss/Dr, Ông/Bà/Cô), cộng `validateCoverLetter` dùng chung (số, số viết chữ, raw-JD, thuật ngữ không có trong CV, JD copy, strength claim; company/role là `allowedPhrases`). Tối đa một retry (JD bị giấu), sau đó fallback `content: ''` + `fidelityFallback: true`. Bản nháp lỗi không bao giờ được trả.

### Quota (P2C)

- **Trần tài liệu theo giờ dùng chung** với cover letter và application review: một nửa trần
  rewrite (`ceil(hourlyAiLimit/2)`), đếm hàng `kind='rewrite'` có một trong ba marker (xem
  [11_guard_metrics.md](./11_guard_metrics.md)). Kiểm tra trước khi nạp context và trước Gemini (429).
- **Không dùng quota phân tích tháng:** không gọi `check_analytics_quota`/`increment_usage_count`;
  `profiles.usage_count` không đổi. Mọi nỗ lực AI (kể cả lỗi) ghi một row nên đều tính vào trần giờ.

## Rollout (thứ tự)

Mỗi phase là một checkpoint do người dùng duyệt; executor dừng và báo trước A, C, D, E, F.

| Phase | Hành động | Cổng |
|---|---|---|
| A. Fallback trước | P2C.0 (#72) đã merge `b6e3c47` và deploy; smoke VI/EN PASS | Timeline production hiện title chung cho type lạ. **`b6e3c47` là target rollback** |
| B. PR triển khai | PR Task 2–12, CI xanh, migration **không** áp. Preview dùng Supabase production nên: list hiện một thông báo nhỏ `role=status` "Không tải được trạng thái follow-up." và không có chỉ báo; detail không có Field Follow-up (lỗi im lặng); ghi contact và soạn nháp báo lỗi. Đây là kỳ vọng (như preview P2A/P2B) | Review đạt **và** đã xử lý mục 1 (Cancel duplicate) + các blocker do whole-branch review quyết định (theo controller/ledger). Mục 3–5 (alias PostgREST, Gemini thật, browser) chỉ kiểm được ở Phase E; mục 3 có phương án dự phòng (chưa làm) |
| C. Migration | Preflight read-only: `20261105000000` chưa có trong `schema_migrations`; `pg_get_constraintdef` của CHECK event_type và `application_events_shape` bằng định nghĩa P2B; `to_regclass('public.application_follow_up_state') IS NULL`; `log_application_contact` chưa có; **PG >= 15 (`security_invoker`)**; ghi số event theo type. `supabase db push --linked --dry-run` liệt kê đúng 1 migration, rồi áp. Verify read-only: CHECK mới; `reloptions` có `security_invoker=true`; anon không SELECT view, authenticated chỉ SELECT; RPC DEFINER `search_path=""`, anon EXECUTE false, authenticated true; số event theo type không đổi; `count(*)` view = `count(*)` applications `status='applied'` | Mọi check đạt, sai lệch ⇒ dừng |
| D. Merge + deploy | Squash merge, Vercel production | Deployment success |
| E. Production verification | Bên dưới | Mỗi case PASS hoặc ghi là gap |
| F. Docs closeout | Bên dưới | — |

**Vì sao migration trước deploy app:** app mới đọc view và gọi RPC. App cũ (Phase A) không ghi
type mới, CHECK mở rộng là additive, Timeline xử lý type lạ bằng fallback ⇒ rollback chỉ app là an toàn
kể cả sau khi user đã log contact.

**Rollback schema:** để schema ngủ (additive). Chỉ DROP view + RPC và khôi phục CHECK khi có
**0** event `follow_up_sent`/`contact_received`; khi đã có event thì `REVOKE EXECUTE` thay vì khôi phục CHECK.

## Production verification (kế hoạch — CHƯA CHẠY)

Dùng tài khoản smoke có kiểm soát + application tổng hợp. Mọi trạng thái thời gian tạo qua date
picker UI (backdate). **Không ghi SQL trên production**; DB chỉ kiểm bằng query read-only.

1. Application P2B (`P2B Smoke Corp`) vẫn load ở list và detail.
2. Timeline vẫn render; mọi event P2B giữ title.
3. Analyze → Save → `drafted → applied` (hôm nay): detail hiện `waiting` với hạn 7 ngày sau; thẻ ở list hiện **chỉ báo chữ nhẹ "Đang chờ phản hồi"/"Waiting" (không chip)**.
4. App smoke mới `drafted → applied` backdate 8 ngày: badge và detail `due`; nằm trong "Cần follow-up", xếp theo hạn.
5. Soạn follow-up: văn bản bám snapshot CV/JD; payload (network) chỉ có `action`, `applicationId` và có thể `language`. **Trả 200, không 503**: đây là bằng chứng thật đầu tiên cho alias PostgREST `language:metadata->>language` (xem Open before release).
6. Sau khi sinh, số event Timeline không đổi (`count(*)` read-only theo app).
7. "Đánh dấu đã gửi" tạo đúng một `follow_up_sent`; double click không trùng.
8. Trạng thái về `waiting`.
9. "Nhà tuyển dụng đã phản hồi" tạo đúng một `contact_received`.
10. Sau reply, `follow_ups_since_reset = 0` (query view read-only).
11. Hai follow-up sau reply ⇒ `limit_reached`: badge muted, app không còn trong "Cần follow-up".
12. Lần Mark as sent thứ ba vẫn được ghi, event hiển thị.
13. App `rejected`: không Field follow-up, không nút contact, không nút soạn.
14. App `drafted`: tương tự, không UI follow-up.
15. Cross-account: account thứ hai gọi `applicationId` của account đầu ⇒ 404 và không thấy ở view. Nếu không có account thứ hai, ghi là gap (đã có SQL/server test), như P2B.
16. Mobile 375 px và desktop: badge list, filter, Field detail, ba panel, không tràn ngang. **Chưa từng kiểm bằng browser thật** (hoãn từ Task 6, 7, 11).
17. Vercel liệt kê 9 function.
18. Một lần Analyze hoạt động như cũ (monthly usage +1); soạn follow-up không đổi `profiles.usage_count`.

Toàn vẹn sau smoke: không orphan event; số event theo type khớp thao tác; snapshot P2A/P2B không đổi (fingerprint như smoke P2B).

## Documentation closeout (sau khi verification đạt)

PR docs-only: đánh dấu P2C DEPLOYED / PRODUCTION VERIFIED kèm ngày, PR, SHA merge, thời điểm
áp migration, bảng 18 case (PASS hoặc gap), các gap; xác nhận `docs/9_api_routes.md` và
`docs/11_guard_metrics.md` khớp production. Không đánh dấu verified cho thứ chưa smoke.

## Bằng chứng hồi quy (pre-merge)

- SQL, một lần chạy harness: **7/7 PASS** (`application_follow_up`, `application_follow_up_concurrency`,
  `application_tracker`, `application_tracker_concurrency`, `applications`, `applications_concurrency`,
  `account_lock`); fixture backfill PASS. Hai dòng `MIGRATION-ERR activate_pro_plan` (migration
  `20260602100000`) là noise có sẵn của harness, tái hiện trên `b6e3c47`.
- Vercel functions: 9. File Analyze: 0 thay đổi so với `b6e3c47`.
- Chưa chạy: Gemini thật, browser 375 px/desktop, PostgREST thật.

## Nợ

### (a) Nợ chấp nhận được

- Transition sửa lỗi (ví dụ `interview → applied`) tạo anchor mới nên nhắc muộn hơn. Fail safe.
- Ngày user tự backdate được tin cậy. Follow-up có ngày tại/trước mốc reset không dời timer và không được đếm (chỉ hiện trên Timeline).
- Race `created_at` (Known limit ở mục Derivation): tối đa một event gán nhầm episode.
- `company_name`/`role_title` là metadata sửa được và dùng làm allowed phrase; một thuật ngữ owner tự gõ trong đó không bị guard bắt.
- Văn bản follow-up đã gửi không được lưu (chỉ ghi chú riêng tùy chọn).
- Tự động hoá follow-up cho interview/offer và bản nháp cho chúng: hoãn. RPC nhận log cho chúng, UI không lộ.
- Detail không có deep link (nợ chấp nhận có sẵn).
- `FollowUpGuardMetrics` đang là alias của `CoverLetterGuardMetrics` (Minor): phải tách thành type riêng trước khi thêm field chỉ của follow-up.
- Metrics không phân biệt lỗi độ dài/lời chào với vi phạm khác (violations rỗng).
- `FollowUpRow` kiểu non-null trong khi catalog view cho phép null (giá trị non-null theo cấu trúc).
- Detail nuốt lỗi tải follow-up state (không Field, không thông báo); list thì có thông báo. Đây là ruling của controller: plan Task 7 coi việc tải follow-up ở detail là non-fatal.
- Vài Minor UI hoãn: live region mount có điều kiện, sequence guard chỉ phòng thủ, alert fallback nằm dưới bản nháp cũ, panel `draft` còn mở khi status rời rồi quay lại `applied`.
- Parked P2B: `details_updated` thiếu `changedFields` qua được CHECK (NULL); client không tới được.

### (b) Open before release (chặn hoặc chưa xác minh — KHÔNG phải nợ chấp nhận)

1. **[Important, BLOCKER] Cancel sau kết quả không xác định có thể tạo event trùng.** Kế hoạch ghi
   "retry không thể trùng" là **không đúng như đã ship**. Retry và remount phát lại cùng key
   (intent nằm ở module-scope), nên an toàn. Nhưng bấm **Cancel** sau một lỗi `unknown`
   gọi `cancel → clearIntent` (`useTrackerMutation.ts`), nên lần lưu lại dùng key mới; nếu request
   đầu thực ra đã commit thì sinh thêm một event. Hook dùng chung với form status/note/details của
   P2B nên cần regression cho cả bốn form. Chưa sửa.
2. **Copy kết quả không xác định.** `trackerErrGeneric` "Chưa lưu được…" ngụ ý thất bại chắc chắn
   trong khi có thể đã lưu. Đề xuất: VI "Chưa xác nhận được kết quả. Bạn có thể thử lại an toàn." /
   EN "The result couldn't be confirmed. You can safely retry." (dùng chung với P2B).
3. **Alias PostgREST chưa xác minh.** `language:metadata->>language` chưa từng chạy trên PostgREST
   thật (mock-only; harness local chỉ là Postgres). Alias bị từ chối ⇒ fail closed 503 retryable,
   nên mọi bản nháp sẽ lỗi. Bằng chứng thật đầu tiên là Production Verification case 5. Fallback:
   select `metadata` và chỉ đọc `language` từ row `cover_letter` (không bao giờ từ JD).
4. **Gemini thật CHƯA CHẠY** (không có môi trường dev được phép). Chất lượng prompt/tỉ lệ fallback chưa biết.
5. **Browser 375 px/desktop chờ** (hoãn từ Task 6, 7, 11).
6. **Lỗ hổng grounding:** tên riêng trơn bịa ra và lời ký tên một từ không bị phát hiện;
   tương tác được tuyên bố (phỏng vấn, offer, giới thiệu, đã liên hệ trước), lời hứa và tính sẵn sàng chỉ
   được chặn bằng prompt; check honorific chạy **trước** khi gỡ `allowedPhrases` (dương tính giả như
   "Bà Rịa", "Cô Tô" ép về fallback). Lỗ hổng regex: bỏ sót "ông Lan" viết thường và "Ms.Lan"; lỗ hổng NFC: văn bản NFD không khớp.
   Đề xuất sửa có giới hạn trong `check` của `followUpService`: danh sách cụm tương tác xác
   định (deterministic), và chạy honorific trên văn bản NFC **sau** khi gỡ `allowedPhrases`.
