# Applications (P2A — Save Application + immutable snapshots)

Trạng thái: **P2A — PR review** — migration `20261103000000_applications_snapshots.sql`
chưa áp lên production.

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

- P2B: `application_events (id, application_id, user_id, type, payload, created_at)` cùng FK tổ hợp; mở rộng `status` CHECK; `GRANT UPDATE (status, ...)` theo cột + trigger `updated_at`; màn Applications đọc snapshot, không đọc history.
- P3 Interview Prep: đọc `application_documents` (cv/jd/cover_letter + requirements trong metadata JD), không dùng CV hiện tại.
- Nếu cần "cập nhật tài liệu": tạo snapshot/version mới (bỏ UNIQUE theo type, thêm version), không UPDATE.
