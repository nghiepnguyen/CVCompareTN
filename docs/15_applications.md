# Applications (P2A — Save Application + immutable snapshots; P2B — Tracker)

> P2B (Application Tracker + `application_events`): **IMPLEMENTED LOCALLY / READY FOR REVIEW**
> (03/11/2026, branch `feat/p2b-application-tracker`). Migration chưa áp production. Xem
> mục [P2B](#p2b--application-tracker--application_events) bên dưới.

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

Trạng thái: **IMPLEMENTED LOCALLY / READY FOR REVIEW** (03/11/2026). Branch
`feat/p2b-application-tracker`, base `origin/main` `9d57fa7`. **Chưa** áp migration
production, chưa push/PR/deploy.

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

`applied_at` = `occurred_at` của **lần đầu** chuyển sang `applied` (set khi `applied_at IS NULL`); không bao giờ ghi đè khi sửa trạng thái. Vì vậy có thể tồn tại `drafted` + `applied_at` (vd `drafted→applied→withdrawn→drafted`): đó là ngày nộp lịch sử, **không** phải tín hiệu "đang nộp". Overview hiển thị kèm tooltip giải thích. P2C không được dùng `applied_at` một mình để quyết định follow-up. Client không ghi trực tiếp.

`application_events` (append-only):
`id, application_id, user_id, event_type created|status_changed|note|details_updated, from_status?, to_status?, note? (1–2000), metadata jsonb object ≤ 4 KB, occurred_at, idempotency_key uuid, created_at`.
- FK tổ hợp `(application_id, user_id) → applications(id, user_id) ON DELETE CASCADE`.
- `UNIQUE (user_id, idempotency_key)`; partial unique `(application_id) WHERE event_type='created'` (đúng 1 created/app).
- CHECK hình dạng theo loại: `status_changed` có from/to khác nhau; `note` có note; `details_updated` có `metadata.changedFields` array; `created` không có from/to/note.
- Index timeline `(application_id, occurred_at DESC, created_at DESC)`.
- Trigger `application_events_immutable` chặn UPDATE với **mọi** role (giống documents). DELETE chỉ qua cascade khi xoá application/account.

Backfill: `INSERT … SELECT` một `created` event cho mỗi application có sẵn (`occurred_at = created_at = applications.created_at`, key = `applications.idempotency_key`), `ON CONFLICT (application_id) WHERE event_type='created' DO NOTHING` → chạy lại không trùng. Không đổi id/status/snapshot; `applied_at`/`deadline` = NULL. Không hardcode id production.

## RPC (SECURITY DEFINER, `search_path=''`, owner = `auth.uid()`, anon không EXECUTE)

| RPC | Việc |
|---|---|
| `save_application(...)` (signature P2A giữ nguyên) | Thêm `created` event trong cùng transaction. Replay cùng key: cùng app, `created:false`, không thêm document/event. |
| `transition_application_status(p_application_id, p_expected_status, p_to_status, p_occurred_at, p_note, p_idempotency_key)` | Thứ tự: caller (auth + account lock) → validate input → `pg_advisory_xact_lock(user,key)` → replay lookup → `FOR UPDATE` theo owner → CAS `expected_status` → matrix → UPDATE status/`updated_at`/`applied_at` + INSERT `status_changed` (from_status lấy từ server). |
| `add_application_note(p_application_id, p_note, p_idempotency_key)` | Trim, 1–2000 ký tự; bump `updated_at`; không đổi status. |
| `update_application_details(p_application_id, p_company_name, p_role_title, p_deadline, p_idempotency_key)` | Thay toàn bộ 3 trường (blank/NULL = xoá), ≤ 200 ký tự, deadline là `date`. No-op → `changed:false`, không event, không bump. Metadata chỉ trường đổi: `{"changedFields":["deadline"],"deadline":{"from":null,"to":"2026-11-15"}}`. Không đụng `source_analysis_id, language, idempotency_key, created_at, applied_at, status`. |

Helper nội bộ (không cấp cho client): `application_tracker_caller()` (INVOKER: `not_authenticated` / `account_locked` kiểm tra **trước** mọi lookup, nên user bị khoá không biết app tồn tại hay intent đã ghi), `application_status_transition_allowed()`.

`occurred_at`: lưu UTC; NULL = `now()`; từ chối > now + 5 phút (clock skew) hoặc < now − 10 năm; cho phép quá khứ (cập nhật tracker sau sự kiện). UI: chọn ngày ICT; hôm nay → NULL (server now), ngày quá khứ → `YYYY-MM-DDT12:00:00+07:00`.

Error vocabulary (message = code; UI map sang VI/EN, không hiện SQL/constraint/row):

| Code | SQLSTATE |
|---|---|
| `not_authenticated`, `account_locked` | 42501 |
| `application_not_found` | P0002 |
| `stale_status`, `invalid_transition` (matrix) | P0001 (không dùng 40001 để client không coi là retryable) |
| `invalid_transition` (status lạ), `invalid_occurred_at`, `invalid_note`, `invalid_details` | 22023 |

## Idempotency

Mỗi intent (đổi status / ghi chú / sửa thông tin) một `crypto.randomUUID()`, scope `auth.uid() + key` trong `application_events`. Không dùng content hash hay app+status.
- Server: advisory lock theo (user, key) **trước** replay lookup ⇒ retry sau khi lần đầu đã commit (kể cả `expected_status` đã cũ) trả về kết quả gốc (`replayed:true`) thay vì `stale_status`; hai request song song cùng key ⇒ một event, không lộ lỗi unique. Payload replay khác ⇒ giữ kết quả gốc.
- Client (`useTrackerMutation`): key ở module scope theo `action:applicationId` (sống qua remount); giữ khi lỗi không chắc chắn (`unknown`: network/5xx) ⇒ bấm lại = replay an toàn; xoá khi thành công, khi server từ chối dứt khoát (mọi code trong vocabulary — không có gì đã commit) và khi user bấm Hủy. Double click bị chặn bằng ref + disabled. Nếu user sửa nội dung rồi retry sau lỗi không chắc chắn và lần đầu thật ra đã commit, server trả bản gốc; timeline sau reload cho thấy bản đã ghi.

## Quyền / RLS / account lock

- `application_events`: RLS bật; policy owner SELECT; RESTRICTIVE `account_unlocked_read`; trigger `account_unlocked`. `authenticated`: chỉ SELECT. `anon`: không gì. `service_role`: mặc định.
- `applications`: grant P2A giữ nguyên (`SELECT, DELETE`); **không** cấp UPDATE.
- Account lock: user bị khoá không đọc applications/documents/events, không gọi được 3 RPC. `account_lock.test.sql` khẳng định danh sách bảng tường minh (8 bảng public) + số trigger 8 / policy 9.
- Note là dữ liệu riêng tư: không gửi Gemini/Sentry/analytics, không log. Sentry chỉ nhận `application tracker mutation failed` (không message lỗi gốc, không code chi tiết) cho lỗi `unknown`; lỗi nghiệp vụ không báo Sentry. Note render dạng text (React escape), không HTML.

## UI

- Tab `applications`: `/vi/applications`, `/en/applications` (reload trực tiếp OK — rewrite SPA sẵn có). Desktop header + MobileBottomNav (nav mobile thu nhỏ `min-w` 64→56px để 6 mục của admin vừa 375px; đã đo: 375/375).
- List (`ApplicationsView`): card công ty / vị trí (fallback "Chưa có công ty / Company not set", "Chưa có vị trí / Role not set"), status (nhãn bản địa, không hiện giá trị DB thô), hạn nộp, ngày ứng tuyển, hoạt động gần nhất. Không Kanban. Phân trang `.range()` 20/trang (+1 dòng look-ahead), "Tải thêm". Sort allowlist: `updated_at` (mặc định, desc) / `created_at` / `applied_at` (desc) / `deadline` (asc) / `company_name` (A–Z); NULL cuối; tie-break `id`. `status` không có trong sort (thứ tự chữ cái của giá trị DB vô nghĩa). Score không phải sort authority (test).
- Detail: `Overview | Documents | Timeline` (motion `layoutId`). Overview: trường workflow + 3 action (đổi status, sửa thông tin, thêm ghi chú). Documents: snapshot CV (`parsedCV` tóm tắt), JD, Cover Letter hoặc "Không có Cover Letter khi lưu", điểm + requirements tại thời điểm lưu (chỉ đọc, không tính lại, không so với Analyze hiện tại); không có action sửa/tạo lại. Timeline: newest-first theo `occurred_at`, câu có nghĩa (VI/EN), không JSON thô. Giới hạn 200 event (shortcut, ghi trong code).
- Ngày: helper trong `src/lib/vnTime.ts` (`formatVnDate`, `formatVnDateTime`, `formatPlainDate` cho `date` không dịch múi giờ, `vnTodayYmd`). Không có module định dạng thứ hai.
- Xoá application: P2A không có UI xoá → P2B không thêm (grant DELETE vẫn có, chưa dùng ở client).

## Tests

- SQL `application_tracker.test.sql`: catalog (grants, DEFINER/search_path, helper không lộ, trigger/policy, không cột score), matrix = JSON (81 cặp), **81 cặp qua RPC** (allowed → 1 event đúng from/to; rejected → status không đổi, 0 event), alias status, CAS, `applied_at` lần đầu + không ghi đè, occurred_at, note, details (một/nhiều trường, no-op, clear, blank→NULL, giới hạn, không đụng cột khác/snapshot), INSERT/UPDATE/DELETE trực tiếp bị chặn, cross-user, khoá tài khoản, immutability service_role, FK tổ hợp, 1 created/app, shape CHECK, cascade, xoá account, atomicity (lỗi chèn event ⇒ rollback save/transition/details/note).
- SQL `application_tracker_concurrency.test.sql` (dblink): cùng key song song cho transition (payload khác) / note / details ⇒ 1 event, kết quả gốc; hai intent khác nhau đua nhau ⇒ cái cũ nhận `stale_status`.
- SQL backfill: `FIXTURE_BEFORE=20261104000000:/repo/tests/fixtures/pre_p2b_applications.sql supabase/tests/local/run.sh "$PWD" /repo/tests/applications_backfill.fixture-test.sql` (25 application P2A trước migration ⇒ giữ nguyên + đúng 1 created event; chạy lại backfill = 0 row). Hook `FIXTURE_BEFORE` mới trong `run.sh`.
- P2A regression: `applications*.test.sql` PASS không sửa; `account_lock.test.sql` cập nhật.
- Client: `applicationTracker.test.ts` (matrix/status, sort allowlist + score bị từ chối, range/order, lỗi sanitize), `ApplicationsView.test.tsx`, `ApplicationDetailView.test.tsx` (tabs, documents, score label, timeline, status/note/details: double click, key reuse qua remount, stale, final confirm VI/EN, no-op).

## Rollout (chưa làm — cần review)

1. Preflight read-only production: `applications_status_check` tồn tại đúng tên; không có `application_events`; các RPC mới chưa tồn tại; số application hiện có.
2. Áp `20261104000000_application_tracker.sql` (`BEGIN/COMMIT`) **trước** deploy app (app cũ vẫn chạy: chỉ thêm cột/bảng; `save_application` giữ signature).
3. Verify read-only: số `created` event = số application; `has_function_privilege` anon=false / authenticated=true cho 3 RPC; authenticated không INSERT/UPDATE/DELETE events, không UPDATE applications; trigger `application_events_immutable` enabled.
4. Merge + deploy app; smoke production: list (2 app smoke P2A hiện có, company/role NULL fallback), detail 3 tab, đổi status drafted→applied (applied_at), ghi chú, sửa deadline, final correction có xác nhận, mobile 375 px, `/vi/applications` reload.

## Rollback

App và schema rollback **tách biệt**:
- Lỗi ứng dụng ⇒ rollback deployment app; **để schema P2B ở trạng thái ngủ** (additive, app P2A không dùng tới). `save_application` mới vẫn tương thích app P2A.
- Không tự động `DROP application_events`, thu hẹp status CHECK hay xoá timeline sau khi user đã có dữ liệu P2B: khi đã có status khác `drafted`, CHECK P2A **không thể** khôi phục an toàn.
- Chỉ revert riêng phần tích hợp `save_application`: `supabase/rollback/20261104000000_save_application_p2a.sql` (thân P2A nguyên văn, đã chạy thử local: P2A tests PASS sau khi áp). Save sau đó sẽ không có created event.
- Gỡ toàn bộ chỉ khi **chưa** có dữ liệu P2B (0 event ngoài `created`, mọi status = `drafted`): `DROP FUNCTION` 3 RPC + 2 helper + `application_events_immutable()`; áp rollback script trên; `DROP TABLE public.application_events`; `ALTER TABLE public.applications DROP COLUMN deadline, DROP COLUMN applied_at`; khôi phục CHECK `IN ('drafted')`; `DROP INDEX applications_user_updated_idx`.

## Known debt (P2B)

- Tạo application thủ công: deferred.
- Next action / follow-up / last contact: P2C.
- Detail không có deep link (`/applications/<id>`); reload ở detail quay về list.
- Timeline tối đa 200 event (không phân trang).
- Details không có CAS (hai tab sửa cùng lúc: lần sau thắng, nhưng event ghi from/to từ server nên timeline vẫn đúng).
- Chưa smoke UI có đăng nhập thật (chỉ đo layout 375 px bằng harness tạm + unit test); cần trong production smoke.
