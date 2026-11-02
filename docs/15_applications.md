# Applications (P2A — Save Application + immutable snapshots)

Trạng thái: **P2A local implementation** — migration `20261103000000_applications_snapshots.sql`
chưa áp lên production.

## Authority

| Khái niệm | Bảng | Tính chất |
|---|---|---|
| Working state (CV/JD/Cover Letter/analysis hiện tại) | session (`AnalysisRunContext`, `CoverLetterAction`) | mutable |
| Application | `applications` | mutable workflow (P2B thêm đổi status) |
| Application Document | `application_documents` | **immutable** snapshot |

`source_analysis_id` = `AnalysisResult.id` lúc lưu, **chỉ là provenance** (không FK: history bị purge/xoá, `history.id` khác kiểu trên production). Không đọc lại `history`/`analysis_log` để hiển thị application.

## Schema

`applications`: `id, user_id → auth.users (cascade), source_analysis_id, company_name?, role_title?, language vi|en, status, created_at, updated_at`.
- `status CHECK IN ('drafted')` — dùng status authority của roadmap P2B; `drafted` = mở, **chưa nộp**. Save ≠ Applied. P2B mở rộng CHECK.
- `UNIQUE (user_id, source_analysis_id)` → save idempotent theo analysis.
- Index `(user_id, created_at DESC)`.

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
- Không có Cover Letter → không tạo. Lưu rồi tạo/chỉnh thư sau → snapshot cũ **không đổi**; Save lần nữa trả `created:false` và UI báo "Đã lưu trước đó — giữ nguyên tài liệu tại thời điểm lưu".

## Write path

Một RPC: `public.save_application(...)` → `{ id, created }`, gọi trực tiếp từ client (`src/services/applicationService.ts`). Không thêm Vercel function (vẫn 9), không gọi Gemini, không trừ quota.

- `SECURITY DEFINER`, `search_path = ''`, owner = `auth.uid()` (không nhận `user_id` từ client); `REVOKE` anon, `GRANT EXECUTE` authenticated. Lint "SECURITY DEFINER executable by authenticated" là **chấp nhận có chủ đích**: đây là đường ghi duy nhất.
- Validate: analysis id 1–100 ký tự, `language`, parsedCV là object khác rỗng ≤ 200 KB, JD không rỗng ≤ 50 000 ký tự, analysis có `matchScore` number + `requirements` array ≤ 60 KB, letter ≤ 10 000 ký tự + language hợp lệ. Lỗi → `22023 invalid_application` (UI chỉ hiện thông báo chung).
- `source_analysis_id` có trong `history` của user khác → `42501`. Không bắt buộc history row tồn tại (history insert của client là fire-and-forget).
- Một function plpgsql = một transaction: lỗi bất kỳ (kể cả letter sai sau khi CV/JD hợp lệ) → không còn row nào.

## Quyền

- `authenticated`: `SELECT, DELETE` trên `applications` (của mình); `SELECT` trên `application_documents` (của mình). Không INSERT/UPDATE trực tiếp.
- Trigger `application_documents_immutable` chặn UPDATE với **mọi role** (kể cả service_role).
- Account lock: trigger `account_unlocked` + policy RESTRICTIVE `account_unlocked_read` như các bảng user khác.
- Xoá application → documents cascade. Xoá account (`auth.users`) → cả hai cascade. Xoá history → không ảnh hưởng.

## UI

`Lưu ứng tuyển / Save application` cạnh `Tạo Cover Letter` trên header Result (`SaveApplicationAction`). States: idle → saving (chặn double click bằng ref + disabled) → saved (`Đã lưu ứng tuyển`) / error. Không dùng chữ "nộp". Từ History: unavailable (thiếu JD gốc), cùng lý do như Cover Letter. Chưa có màn Applications (P2B).

Telemetry: GA `application_saved { created, has_cover_letter }`; Sentry chỉ nhận lỗi, không có nội dung.

## Tests

- SQL: `supabase/tests/applications.test.sql` (`supabase/tests/local/run.sh "$PWD" /repo/tests/applications.test.sql`) — quyền, owner, spoof, foreign analysis, immutability (owner + service_role), cross-user, idempotency, atomicity/rollback, locked account, history delete, cascade, account delete.
- Client: `SaveApplicationAction.test.tsx`, `CoverLetterAction.test.tsx` (letter propagation).

## Future

- P2B: `application_events (id, application_id, user_id, type, payload, created_at)` cùng FK tổ hợp; mở rộng `status` CHECK; `GRANT UPDATE (status, ...)` theo cột + trigger `updated_at`; màn Applications đọc snapshot, không đọc history.
- P3 Interview Prep: đọc `application_documents` (cv/jd/cover_letter + requirements trong metadata JD), không dùng CV hiện tại.
- Nếu cần "cập nhật tài liệu": tạo snapshot/version mới (bỏ UNIQUE theo type, thêm version), không UPDATE.
