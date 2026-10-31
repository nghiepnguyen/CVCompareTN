# Đánh giá Administration — Users & Report

**Ngày:** 2026-10-31
**Phạm vi:** tab Administration (`/vi/admin`), sub-tab **Users** và **Report**
**Cách làm:** đọc code + migration + test hiện có; chạy baseline lint/test; dựng test tạm để tái hiện bug (đã xoá sau khi xác nhận). **Chưa** chạy trên staging/production.

> **Cập nhật triển khai (2026-10-31):** Phase 0 (A1–A6) và B7 (DB CHECK admin-only unlimited) đã được sửa trong working tree. A7 production audit trả **0** row legacy; xem §12 để biết trạng thái từng task và phần còn lại.

---

## 0. Tóm tắt điều hành

**Kết luận ngắn:** phần **quyền/nền tảng khá ổn**, phần **logic biên (edge case) và khả năng mở rộng chưa ổn**.

- Tầng bảo vệ đã tốt: RLS admin-only, trigger khoá cột đặc quyền, role/plan/delete đi qua backend `service_role` có double-guard + audit, xoá user là hard delete kèm dọn storage.
- Nhưng có **3 việc nên xử lý ngay**:
  1. **Legacy `custom=true, limit=NULL`** (không còn hợp lệ sau khi chốt admin-only) → reset về mặc định là **no-op**; UI vẫn hiển thị trạng thái này (đã tái hiện bằng test).
  2. **Load more có thể bỏ qua 50 user** nếu request lỗi (page tăng trước khi fetch), và có thể **nhân đôi dòng** khi refresh/loadMore chồng nhau.
  3. **Search/filter tải toàn bộ bảng `profiles`**, và tải lại toàn bộ mỗi khi có realtime event — mỗi lượt phân tích của bất kỳ user nào cũng bump `profiles` và kích hoạt refetch.
- **Đã chốt (2026-10-31):** "unlimited" **chỉ dành cho admin** (admin vốn đã unlimited theo role); Report đo **volume gọi analyze** và bổ sung **quota đã dùng**; preset plan là **cộng dồn** (DB đang đúng, chỉ cần sửa copy UI); cần **audit UI, bulk actions, CSV export**. Chi tiết ở §10.
- Report đang **kéo toàn bộ row `analysis_log`** trong range về client rồi tự aggregate; 30 ngày với vài chục nghìn row sẽ chậm và tốn bộ nhớ. Nên chuyển sang RPC aggregate.

### Scorecard (thang 10, theo code hiện tại)

| Hạng mục | Điểm | Nhận xét |
|---|---:|---|
| Bảo mật / phân quyền | 8 | RLS + service_role + trigger + audit; thiếu audit UI, thiếu rate limit ở Vercel, global setting chưa audit |
| Đúng logic — Users | 6 | Legacy unlimited no-op, loadMore skip/dup, count lệch, global limit stale |
| Đúng logic — Report | 7 | Timezone/pricing tốt; metric tháng dễ gây hiểu nhầm; aggregate ở client |
| Hiệu năng / scale | 4 | Full-table fetch, full log download, thiếu index `profiles.created_at` |
| UX vận hành | 6 | Thiếu skeleton/toast/URL state; confirm copy kém; i18n lỗi nhãn |
| Maintainability | 5 | `AdminView.tsx` 893 dòng; logic Express/Vercel trùng; dead code |
| **Tổng thể** | **6.5** | Nền tảng tốt, cần gia cố edge case + scale trước khi traffic tăng |

---

## 1. Phạm vi & phương pháp

### File đã đọc

| Nhóm | File |
|---|---|
| UI | `src/components/views/AdminView.tsx`, `src/components/views/AdminReportTab.tsx`, `src/app/AppContent.tsx`, `src/components/layout/Header.tsx` |
| State / hook | `src/hooks/useAdminUsers.ts`, `src/context/AuthContext.tsx`, `src/context/UIContext.tsx` |
| Service | `src/services/userService.ts`, `src/services/adminReportService.ts`, `src/services/appSettingsService.ts` |
| API | `api/admin.ts`, `server/routes/admin.ts`, `server.ts`, `_server-lib/admin/deleteUser.ts`, `_server-lib/admin/audit.ts` |
| DB | `supabase/migrations/*` (profiles RLS, privileged columns, admin RPCs, analysis_log, app_settings, audit) |
| Test | `src/__tests__/components/AdminView.test.tsx`, `AdminReportTab.test.tsx`, `src/__tests__/hooks/useAdminUsers.test.tsx`, `src/__tests__/services/adminReportService.test.ts` |

### Baseline đã chạy

```text
npm run lint                         → PASS
npx vitest run <4 file admin>        → 18/18 test PASS
```

Test tạm để tái hiện bug unlimited: **FAIL đúng như dự đoán** (`resetUserToGlobalAnalyticsLimit` không được gọi), sau đó đã xoá file test tạm.

> Lưu ý: các kết luận về DB/RLS dựa trên migration trong repo, chưa đối chiếu schema production. Cần chạy lại trên staging trước khi kết luận "đã sửa".

---

## 2. Những điểm đang làm tốt

1. **Phân quyền nhiều lớp**: UI ẩn action + RLS + trigger `profiles_guard_privileged_columns` + API kiểm tra `profiles.role` bằng `service_role`. Role/plan RPC chỉ grant cho `service_role`, không gọi trực tiếp từ client.
2. **Hard delete đúng**: xoá `auth.users` (cascade profile/history/payments/saved_cvs), dọn storage, audit trước khi xoá, chặn tự xoá và chặn xoá admin.
3. **Audit log**: các action role/plan/delete/permission/limit đều có ghi audit; client không insert trực tiếp được vào `admin_audit_log` nữa.
4. **Timezone nhất quán**: quota cycle, report day bucket, hiển thị ngày đều neo `Asia/Ho_Chi_Minh` (`src/lib/vnTime.ts`), có test cho boundary 23:30 UTC.
5. **Report có tư duy đúng**: pricing theo từng model, cảnh báo model chưa có giá thay vì đoán, phân trang PostgREST để tránh truncate 1000 row, chống race khi đổi range (`requestIdRef`).
6. **Realtime có kiểm soát**: debounce 1s, refresh định kỳ 5 phút và khi tab visible; report có lazy load; test cho các hành vi này.
7. **`effective_usage_count`** là computed column thông minh, tránh việc admin nhìn số usage cũ do lazy rollover.

---

## 3. Findings — Users

### Bảng tổng hợp

| ID | Mức | Finding | Bằng chứng | Ảnh hưởng |
|---|---|---|---|---|
| U-01 | **Medium** | Legacy `custom=true, limit=NULL` (không còn hợp lệ sau khi chốt admin-only) → reset về mặc định là no-op; UI vẫn hiển thị trạng thái này | `AdminView.tsx:212-219`, `839-851`; `userService.ts:25-28` | Dữ liệu legacy bị kẹt; admin tưởng đã reset nhưng DB không đổi |
| U-02 | **High** | `loadMore` tăng page trước khi fetch; lỗi → mất 1 trang; refresh/loadMore chồng nhau → duplicate row | `useAdminUsers.ts:52`, `64-69` | Thiếu user trong danh sách; React duplicate key; số liệu sai |
| U-03 | **High** (khi đông user) | Search/filter tải toàn bộ `profiles`; effect phụ thuộc `allUsers` nên tải lại mỗi realtime event | `AdminView.tsx:82-92`, `userService.ts:87-104` | Với 5k user + traffic, mỗi giây có thể tải cả bảng; tốn RAM/CPU |
| U-04 | Medium | Lần load đầu hiện "Không có người dùng nào khớp" thay vì skeleton | `AdminView.tsx:648-657` | Flash sai trạng thái; admin tưởng mất dữ liệu |
| U-05 | Medium | `newUsersCount`/banner chỉ tính trong 50 user đã tải; Header dùng count DB-wide | `AdminView.tsx:38`, `336`; `AuthContext.tsx:111-118` | Hai nơi hiển thị hai số khác nhau; user mới ngoài trang 1 không thấy |
| U-06 | Medium | Load global limit lỗi → state giữ 5; admin bấm Save có thể ghi đè mặc định thật bằng 5 | `AdminView.tsx:47-48`, `59-67`, `131-149`; `appSettingsService.ts:16-29` | Sai cấu hình toàn hệ thống, không có cảnh báo |
| U-07 | Medium | Non-admin vào `/admin` nhận vùng nội dung trống (null) thay vì redirect/403 | `AppContent.tsx:275-285` | UX xấu, khó debug; che giấu lỗi phân quyền |
| U-08 | Medium | Trộn phân trang server (50) + client (10) + "Tải thêm"; tổng trang chỉ tính trên window đã tải | `AdminView.tsx:104-108`, `664-676`; `useAdminUsers.ts:6` | Không thể nhảy tới user thứ 500; số "tổng" gây hiểu nhầm |
| U-09 | Medium | Plan + limit là 2 write riêng, không atomic; double-click có thể cộng 2 lần duration, usage đã reset không phục hồi | `AdminView.tsx:208-226`, `872`; `admin_set_user_plan` reset `usage_count=0` (`20261101050000:68`) | Mất quota oan, cộng dư ngày, trạng thái nửa vời khi request 2 lỗi |
| U-10 | Medium | Xoá user chỉ dùng `window.confirm` chung chung, không nêu email/hậu quả; không có audit UI | `AdminView.tsx:248-259`; `translations/admin.ts:311-314` | Xoá nhầm không cứu được; admin không tra được ai đã làm gì |
| U-11 | Medium | Thiếu filter role/status; nhãn cột role sai ("Định dạng"); role hiển thị raw `admin/user` | `AdminView.tsx:524`, `555`; `translations/admin.ts:179-182` | UI khó dùng, sai nghĩa với người Việt |
| U-12 | Medium | Admin bị giáng quyền bởi admin khác vẫn thấy tab Admin đến khi reload | `AuthContext.tsx` không subscribe row của chính mình; chỉ load lúc bootstrap | Trải nghiệm mơ hồ; an toàn vẫn do RLS/API chặn |
| U-13 | Low | User từng là admin (đã demote) mà từng lưu `app_settings` thì không xoá được do FK `updated_by` không `ON DELETE SET NULL` | `20260523100000_app_settings_analytics_default.sql:7`; `deleteUser.ts:65-67` | Xoá thất bại 500, thông báo chung chung |
| U-14 | Low | Search chỉ theo email, không theo tên/id; không sort; không bulk action; không toast/optimistic update | `AdminView.tsx:94-103` | Vận hành chậm khi có nhiều user |
| U-15 | Low | Modal thiếu `role="dialog"`, `aria-modal`, focus trap, đóng bằng Esc; table thiếu `scope` | `AdminView.tsx:756-889` | Accessibility kém |

### U-01 — Legacy unlimited & validation (đã tái hiện)

Hợp đồng dữ liệu (`src/services/userService.ts:25-28`):

```text
monthlyAnalyticsLimitCustom = false  → inherit app_settings.default_monthly_analytics_limit
monthlyAnalyticsLimitCustom = true,  monthlyAnalyticsLimit = N     → custom N
monthlyAnalyticsLimitCustom = true,  monthlyAnalyticsLimit = NULL  → unlimited (chỉ admin; legacy non-admin cần chuyển đổi)
```

Nhưng UI đang dùng **một chuỗi rỗng** cho hai nghĩa:

```ts
// AdminView.tsx:212
const oldLimit = target.monthlyAnalyticsLimitCustom
  ? (target.monthlyAnalyticsLimit === null ? '' : String(target.monthlyAnalyticsLimit))
  : '';

// 216-218
const ok = newLimit === ''
  ? (target.monthlyAnalyticsLimitCustom ? await handleResetToGlobalLimit(target) : true)
  : await handleSaveMonthlyLimit(target, newLimit);
```

Ma trận hành vi hiện tại:

| Trạng thái user | Admin bấm "Dùng mặc định" | Kết quả |
|---|---|---|
| custom = false | Không có nút | — |
| custom = true, limit = 20 | draft `''` ≠ `'20'` → gọi reset | ✅ đúng |
| custom = true, limit = null (unlimited) | draft `''` = old `''` → **không gọi gì** | ❌ no-op (legacy) |
| custom = true, limit = 20, admin xoá trắng | draft `''` → gọi **reset về default** | ✅ đúng (không còn "unlimited") |

Hệ quả: UI vẫn hiển thị trạng thái "unlimited" (nếu dữ liệu có) và không có cách sửa, trong khi chính sách đã chốt là **chỉ admin được unlimited**. Với dữ liệu legacy `custom=true, limit=NULL`, bấm "Dùng mặc định" không gọi service nào; admin không có cách sửa từ UI. Admin thật không cần custom limit vì `resolveEffectiveMonthlyAnalyticsLimit` và DB đều trả NULL cho `role='admin'`.

**Hướng sửa (theo chốt admin-only):**
- User thường: UI chỉ có **2 trạng thái** `inherit | custom N`; **không** hiện "unlimited".
- Admin: limit luôn ∞ theo role; ẩn/disable ô custom limit kèm tooltip.
- Legacy `custom=true, limit=NULL`: hiện cảnh báo "Dữ liệu cũ: không giới hạn — cần chuyển về mặc định hoặc số cụ thể"; khi admin chọn, gọi `resetUserToGlobalAnalyticsLimit` hoặc `updateUserMonthlyAnalyticsLimit(uid, N)`; **không tự động đổi âm thầm**.
- Thêm validation ở service/RPC: từ chối `null` cho non-admin (defense-in-depth). Sau khi audit dữ liệu legacy, có thể thêm DB CHECK `NOT (monthly_analytics_limit_custom AND monthly_analytics_limit IS NULL) OR role = 'admin'`; migration phải xử lý các row legacy trước.
- Bỏ placeholder "Trống = không giới hạn"; test 2 nhánh user + legacy + admin.

### U-02 — Load more / refresh race

```ts
// useAdminUsers.ts:64
const loadMore = useCallback(() => {
  if (isLoading || !hasMore) return;
  const next = page + 1;
  setPage(next);                    // ← tăng trước
  fetchRange(next * PAGE_SIZE, ...); // ← nếu lỗi, page đã tăng
}, ...);
```

Các kịch bản:

1. **Fetch lỗi**: `fetchRange` chỉ `console.error` rồi return (`:45-49`). `page` đã tăng; lần bấm "Tải thêm" sau tải trang kế tiếp → **mất đúng 50 row**.
2. **Double click**: `isLoading` là state, hai click trong cùng tick có thể cùng lọt qua guard → cùng page được append 2 lần.
3. **Refresh chồng loadMore**: `refresh()` fetch `0..(page+1)*50-1` và `replace`; một `loadMore` đang bay có thể append lại đúng vùng đó → **duplicate id** (`setUsers([...prev, ...mapped])`, `:52`).
4. Đổi filter/page không reset `page` server; refresh giữ `pageRef` cũ nên vẫn tải window lớn.

**Hướng sửa:** dùng `requestSeqRef` + `loadingRef`; chỉ tăng page sau khi fetch thành công; merge theo `Map<id, UserProfile>` thay vì spread; invalidate loadMore đang bay khi refresh; lý tưởng hơn là bỏ offset pagination, dùng keyset hoặc RPC server-side.

### U-03 — Full table scan khi filter

```ts
// AdminView.tsx:84
useEffect(() => {
  if (!isFiltering) return;
  fetchAllProfiles()...
}, [isFiltering, allUsers]);   // ← allUsers đổi mỗi lần refresh
```

- Mỗi lượt phân tích thành công gọi `increment_usage_count` → UPDATE `profiles` → realtime event → `refresh()` → `allUsers` là array mới → effect chạy lại → **tải toàn bộ profiles**.
- `fetchAllProfiles` phân trang 1000/lần, không giới hạn; 5.000 user = 5 request mỗi lần; 50.000 user = 50 request.
- Không có debounce cho search; dù filter local, lần đầu gõ ký tự nào cũng kéo cả bảng.
- Nếu `fetchAllProfiles` reject, `allProfiles` mãi `null`; UI hiện spinner vô hạn (`AdminView.tsx:426-430`, `648-657`) và không có retry.

**Hướng sửa:** server-side query (RPC/PostgREST) với `search`, `plan`, `role`, `status`, `sort`, `limit/offset`, trả `rows + total`; debounce 300ms; abort request cũ; bỏ `fetchAllProfiles` khỏi AdminView. Thêm index phù hợp (xem X-02).

### U-04 → U-07 (ngắn)

- **U-04**: trong lúc `isLoadingUsers=true`, bảng rỗng → render `adminUsersEmptyState`; cần skeleton hoặc spinner toàn bảng, chỉ hiện empty khi `!isLoading && rows.length===0`.
- **U-05**: banner "Phát hiện N hồ sơ mới" lấy từ window 50; Header badge lấy count toàn DB. Nên dùng **một nguồn** (RPC count hoặc `adminNewUsersCount`), debounce subscribe; thêm "Đánh dấu tất cả đã đọc".
- **U-06**: `globalDefaultLimit` khởi tạo 5, `getDefault...` lỗi chỉ log. Nếu admin bấm Save, ghi 5. Sửa: state `null` khi chưa load, disable Save + hiện lỗi/retry; fallback service là 10 cũng lệch với 5.
- **U-07**: thêm nhánh `activeTab === 'admin' && !isAdmin` → redirect `setActiveTab('analyze')` + toast, hoặc render `NoPermissionView`; không để `null`.

### U-08 — Phân trang lai

- Server tải 50; client chia 10 → tối đa 5 trang cho window đầu.
- Nút "Tải thêm" tăng window lên 100, 150… nhưng `currentPage` không đổi; tổng trang thay đổi sau mỗi lần tải.
- `adminPaginationInfo` hiển thị `total = filteredUsers.length` (window), kèm dòng "tổng N trong hệ thống" — dễ đọc sai.
- Không có sort; luôn `created_at desc`.

**Hướng sửa:** một cơ chế duy nhất — server pagination thật (page + pageSize + total) hoặc infinite scroll; bỏ "Tải thêm" nếu đã có phân trang; hiển thị "Trang X/Y · N user" rõ ràng.

### U-09 — Plan + limit không atomic

`handleSavePlanModal` gọi tuần tự:
1. `handleSaveMonthlyLimit`/`handleResetToGlobalLimit` (direct table update + audit RPC fire-and-forget)
2. `handleAdminPlanChange` (API → RPC)

Nếu bước 2 lỗi, limit đã đổi nhưng modal vẫn mở; retry sẽ ghi lại limit (idempotent) rồi thử plan. Không có rollback. Ngoài ra `admin_set_user_plan` reset `usage_count = 0` khi paid→paid (renew), nên một cú double-click có thể **cộng 2 lần duration**; usage đã về 0 ở lần đầu và không phục hồi được.

**Hướng sửa:** một RPC `admin_update_user(p_user_id, p_plan, p_duration_days, p_limit_mode, p_limit)` chạy trong 1 transaction, có audit bên trong; UI một `isSaving` cho toàn modal; thêm idempotency key nếu cần.

### U-10 — Governance

- `admin_audit_log` đã có dữ liệu nhưng **không có UI** để xem/lọc; admin không thể trả lời "ai đã đổi plan user X tuần trước?".
- Thay đổi **global default limit** (`app_settings`) không được audit; cũng không có action `update_app_setting` trong CHECK constraint.
- `adminConfirmDelete` bản VI: "Xác nhận xóa vĩnh viễn thực thể này?" — không có email, không nói hậu quả (mất CV, lịch sử, thanh toán, không thể hoàn tác).
- Lock/unlock không confirm (có thể chấp nhận được), nhưng role promotion chỉ confirm chung.

**Hướng sửa:** tab Audit (filter admin/action/target/date, phân trang); audit global setting; modal xoá yêu cầu gõ email; toast thành công/thất bại.

### U-11 — i18n / nhãn

| Vị trí | Hiện tại | Nên |
|---|---|---|
| Cột role header | VI "Định dạng", EN "Role" | "Vai trò" |
| Cell role | raw `{u.role}` → `admin`, `user` | `t.adminFilterRoleAdmin/User` |
| Plan Recruiter | hardcode `'Recruiter'` | key riêng |
| Unlimited | hardcode `'∞'` | `t.adminAnalyticsUnlimited` |
| Empty limit | placeholder global default; key nói "Trống = không giới hạn" | bỏ key; "Bỏ trống = dùng mặc định"; không còn unlimited cho user thường |
| Preset plan | "Pro 30 ngày"; DB **cộng dồn** nếu đang còn hạn (đã chốt là đúng) | "Pro +30 ngày" / "Gia hạn thêm 30 ngày"; hiển thị hạn mới sau khi lưu |

Các key `adminFilterRole*` đã có sẵn nhưng filter chưa được implement — có thể làm role filter gần như miễn phí.

### U-12 — Session admin không tự cập nhật

`AuthContext` chỉ load profile lúc bootstrap và khi gọi `refreshUserProfile`; không subscribe row của chính user. Nếu admin A demote admin B:
- B vẫn thấy tab Admin, vẫn mở được UI.
- Mọi query `profiles`/`analysis_log` trả rỗng do RLS; API trả 403.
- B chỉ mất tab sau khi reload.

**Hướng sửa:** subscribe `profiles` row `id = user.id` (hoặc refresh on focus/interval), cập nhật `userProfile`; nếu role đổi khỏi admin → đóng tab, toast. Đây là defense-in-depth/UX, không phải lỗ hổng (server vẫn chặn).

### U-13 — FK `app_settings.updated_by`

`app_settings.updated_by uuid REFERENCES auth.users(id)` **không** `ON DELETE SET NULL`. `adminDeleteUser` chỉ chặn target đang là admin; một user từng là admin, đã demote, từng lưu global limit sẽ làm `auth.admin.deleteUser` fail FK → trả 500 "Không thể xoá tài khoản".

**Hướng sửa:** migration drop/add FK `app_settings.updated_by` với `ON DELETE SET NULL` (cột đã nullable); hoặc set `updated_by=null` trước khi xoá trong `adminDeleteUser`. Cần test.

### U-14/U-15 — Vận hành & accessibility

- Search chỉ email; không search tên/id; không sort; không filter trạng thái/role; không bulk lock/unlock/mark-read.
- Không có toast; action phụ thuộc realtime 1s; nếu realtime trễ/hỏng, bảng stale tới 5 phút.
- Modal: không `role="dialog"`, `aria-modal`, focus trap, Esc, scroll lock; table header thiếu `scope="col"`; report error thiếu `role="alert"`.

---

## 4. Findings — Report

| ID | Mức | Finding | Bằng chứng | Ảnh hưởng |
|---|---|---|---|---|
| R-01 | **High** (scale) | Tải toàn bộ `analysis_log` trong range về client, aggregate bằng JS | `adminReportService.ts:104-111` | 30d nhiều log → payload lớn, chậm, tốn RAM; mỗi lần đổi range tải lại |
| R-02 | Medium (semantics) | "Lượt phân tích / tháng" = success + error, gồm cả 429 quota-exceeded; quota chỉ tăng khi success | `adminReportService.ts:113-123`; `_server-lib/analyze/handler.ts:174`, `193-210` | Admin đọc như "quota đã dùng" sẽ cao hơn thực tế |
| R-03 | Medium | `newUsersCount` của Report **gồm admin**, trong khi Header badge loại admin | `adminReportService.ts:100-103`; `AuthContext.tsx:115-116` | Hai số "user mới" lệch nhau |
| R-04 | Medium | `latency_ms`, `error_message`, `guard_metrics` được ghi nhưng Report không dùng | `_server-lib/analysisLog.ts`; `adminReportService.ts:107` | Mất insight vận hành: p95 latency, lỗi theo loại, model mix |
| R-05 | Medium | Không refresh/realtime, không custom range, không export CSV, không drilldown top user | `AdminReportTab.tsx:17-43`, `205-247` | Report chỉ để xem, không dùng để điều tra |
| R-06 | Medium | Chart 30 ngày có 30 nhãn, không interval/scroll; loading hiển thị 0 thay vì skeleton | `AdminReportTab.tsx:45-48`, `94-120`, `185-200` | Khó đọc trên mobile; 0 giả trong lúc tải |
| R-07 | Low | Avg cost: token của model chưa có giá vẫn vào tử số token nhưng không vào cost; numerator gồm parse/rewrite của cả lượt analyze lỗi | `adminReportService.ts:192-222` | Avg cost bị understate nhẹ; cần ghi chú hoặc tách metric |
| R-08 | Low | Nếu RLS không phải admin, query trả rỗng thay vì lỗi | RLS `admin_analysis_log` | Report hiển thị 0 thay vì "không có quyền", che regression |
| R-09 | Low | Cost tính lại bằng giá hiện tại mỗi lần xem | `adminReportService.ts:37-40` | Sửa bảng giá sẽ thay đổi số liệu lịch sử |

### R-01 — Vì sao nên chuyển aggregate xuống SQL

Hiện tại mỗi lần đổi `today/7d/30d`:
1. Client gọi `analysis_log` nhiều page 1000 row.
2. Tải `user_id, status, created_at, kind, input_tokens, output_tokens, model` cho **mọi** row.
3. JS group theo ngày/user/model, tính cost.

Với 100k row/tháng, đây là ~100 request + vài chục MB, trong khi thứ cần chỉ là ~31 dòng daily + 10 top user + vài bucket model. Nên có RPC `admin_report_stats(p_start, p_end)`:
- `SECURITY INVOKER`, `is_admin()` guard (hoặc `service_role` qua API).
- Trả JSON: totals, daily (generate_series), top users (join profiles), token/cost theo model/kind, unpriced models.
- Cost có thể tính trong SQL nếu có bảng pricing, hoặc trả token theo model để client tính từ bảng giá nhỏ.
- Thêm `latency` p50/p95 và error category counts.

Lợi ích: 1 request, payload nhỏ, index-friendly, dễ cache, dễ test SQL.

### R-02 — Volume vs quota: công thức và chi phí đọc

**Chốt:** Report hiển thị **cả hai**, nhưng là hai metric khác nhau và không được trộn:

| Metric | Định nghĩa | Phạm vi | Nguồn |
|---|---|---|---|
| **Volume analyze** | Số lần gọi `analyze` (success + error), gồm cả 429 quota-exceeded | Theo range đã chọn (`today/7d/30d` hoặc custom) | `analysis_log` |
| **Quota đã dùng** | Tổng `effective_usage_count` của user không phải admin | **Chu kỳ hiện tại của từng user** — không theo range | `profiles` |

Card volume nên ghi rõ "Lượt gọi analyze (gồm lỗi)"; card quota ghi "Quota đã dùng — chu kỳ hiện tại (tính đến HH:mm)". Không đặt tên "Lượt phân tích / tháng" cho quota vì mỗi user có `quota_reset_day` riêng, không phải tháng dương lịch.

**Mapping UI đề xuất:** giữ card "Tổng lượt analyze (range)" (success + error) làm volume; đổi card "Lượt phân tích / tháng" thành **"Quota đã dùng — chu kỳ hiện tại"**; giữ card Success/Error. Không thêm card thứ 6 nếu không cần.

Lưu ý: 429 quota-exceeded và lỗi AI **có** trong volume nhưng **không** làm tăng quota — chênh lệch giữa hai số chính là "nhu cầu vs tiêu thụ thực".

#### Công thức SQL

```sql
-- 1) Volume trong [p_start, p_end)
SELECT
  count(*) FILTER (WHERE status = 'success') AS analyze_success,
  count(*) FILTER (WHERE status = 'error')   AS analyze_error
FROM public.analysis_log
WHERE kind = 'analyze'
  AND created_at >= p_start
  AND created_at <  p_end;

-- 2) Quota đang dùng (snapshot chu kỳ hiện tại, không theo range)
SELECT COALESCE(sum(effective_usage_count), 0) AS quota_used
FROM public.profiles
WHERE role <> 'admin';
```

- `effective_usage_count` đã xử lý lazy rollover và plan hết hạn (trả 0 khi chu kỳ đổi/plan hết hạn), nên không cần tự tính lại cycle trong report.
- Loại `role='admin'` vì admin unlimited; nếu muốn "số user chạm trần", thêm count dựa trên `resolve_monthly_analytics_limit(...)`, nhưng đó là metric khác.
- Không cố tính "quota tiêu trong range": mỗi user reset theo ngày đăng ký, nên con số đó không có định nghĩa thống nhất. Nếu cần "thành công trong range", đó là `count(success analyze)` — hãy gọi đúng tên.

#### Chi phí đọc: hiện tại vs RPC

Supabase không tính tiền theo kiểu "row read" như BigQuery; chi phí thực tế là DB CPU/I/O, egress và số request PostgREST. Vì vậy "lượt đọc" ở đây nên hiểu là **row/index entry phải quét + dữ liệu phải truyền**.

Giả định 30 ngày có **100.000** row `analysis_log` (con số minh hoạ, chưa đo production):

| Cách | Request | Dữ liệu trả về | DB phải đọc | Ghi chú |
|---|---:|---:|---|---|
| Hiện tại (client aggregate) | ~100 (1000 row/request) | ~100.000 row × 7 cột, ~10–20 MB | index range + heap cho từng page | tốn egress, CPU parse/group ở browser |
| RPC aggregate (đề xuất) | 1 | 1 JSON, ~5–20 KB | scan index range để count + scan `profiles` để sum | bỏ 99% network; DB vẫn đọc index |
| RPC + daily rollup | 1 | ~31 dòng daily + tổng, ~1–5 KB | 31 dòng rollup + `profiles` | cần job/trigger; dữ liệu trễ 1–5 phút |

**Quota card rất rẻ:** `SUM(effective_usage_count)` quét một row/user (5k–50k profile), không đụng `analysis_log`; với 5k user thường chỉ vài ms–vài chục ms. Nếu profile lên hàng trăm nghìn, cân nhắc bảng counter/rollup, nhưng chưa cần ở scale hiện tại.

**Volume card:** `COUNT(*) FILTER` vẫn phải quét các entry trong range. Để tránh heap fetch, thêm index phủ `(kind, created_at, status)` (hoặc `INCLUDE (status)`); khi đó Postgres có thể index-only scan. Nếu count trở thành hot path, dùng bảng `analysis_daily_stats` cập nhật bằng trigger/job — đổi độ tươi lấy tốc độ.

**Khuyến nghị triển khai:** một RPC `admin_report_stats(p_start, p_end)` trả cả volume lẫn quota trong 1 request; cache 60s; nút Refresh thủ công. Đây là cách "cần cả 2" mà không tăng lượt đọc đáng kể: chỉ thêm một phép scan nhỏ trên `profiles`, còn `analysis_log` vẫn được aggregate trong DB thay vì kéo về client.

### R-03 — User mới

Report dùng `.from('profiles').select('id', { count:'exact', head:true }).gte('created_at', startIso)` — không loại admin. Header dùng `.eq('is_new', true).neq('role','admin')`. Nên thống nhất định nghĩa:
- "New registrations" = profile mới, có thể gồm admin (hiếm).
- Badge "new users" = user mới chưa đọc, không gồm admin.
Đặt tên key rõ (`adminReportNewProfiles` vs `adminNewUsersCount`) và test.

### R-04 — Insight bị bỏ phí

`analysis_log` đã có:
- `latency_ms` (từ 2026-10-28)
- `model`
- `error_message` (category marker)
- `guard_metrics` (aggregate)

Report hiện chỉ dùng `model`, `tokens`, `status`. Thêm:
- p50/p95 latency theo ngày/model (percentile_cont).
- Top error categories (không hiển thị raw message nếu có PII; hiện tại message là marker category).
- Model mix (số call, token, cost theo model).
- Tỷ lệ lỗi theo model/kind.

### R-05 → R-09 (ngắn)

- Thêm nút Refresh + auto-refresh 60s khi tab visible; subscribe `analysis_log` nếu muốn realtime (admin RLS).
- Custom range (date picker) + so sánh kỳ trước (% delta).
- Export CSV từ dữ liệu aggregate; nếu export danh sách user thì cần endpoint admin riêng và kiểm soát PII.
- Top user click → chuyển sang Users với search prefill (cần shared state/URL param).
- Chart: `interval="preserveStartEnd"` hoặc `minTickGap`, cho phép scroll ngang; skeleton khi loading.
- Cost: lưu `cost_usd` tại thời điểm ghi log (snapshot) hoặc version pricing; nếu không, ghi rõ "ước tính theo giá hiện tại".

---

## 5. Findings — Cross-cutting

| ID | Mức | Finding | Bằng chứng | Ảnh hưởng |
|---|---|---|---|---|
| X-01 | Medium | Vercel `api/admin.ts` **không rate limit**; Express dùng `strictLimiter` 10 req/15 phút/IP | `api/admin.ts`; `server.ts:59`; `server/lib/rateLimiter.ts:24-27` | Hành vi khác nhau giữa deployment; admin sửa vài user là bị 429 khi chạy Express; Vercel không có bound |
| X-02 | Medium | Thiếu index `profiles(created_at DESC)`, `profiles(is_new)` partial, composite `analysis_log(kind, created_at)` | `20260516120000` chỉ có `idx_profiles_role`; `20260703030000` có `created_at`; `20260704000000` có `kind` (index riêng) | Mỗi lần load admin sort toàn bảng; count tháng filter kind+time |
| X-03 | Medium | Global setting không audit; audit log không có UI | `appSettingsService.ts:31-51`; `admin_audit_log` chỉ grant SELECT | Thay đổi ảnh hưởng toàn bộ user nhưng không truy vết được |
| X-04 | Medium | `AdminView.tsx` 893 dòng; Express/Vercel admin trùng logic; dead code `getAllUsers/subscribeToAllUsers` | `AdminView.tsx`; `server/routes/admin.ts` vs `api/admin.ts`; `userService.ts:377-399` | Khó test, dễ drift khi sửa một bên |
| X-05 | Low | Hai realtime channel cùng table `profiles`; badge count không debounce | `AuthContext.tsx:225-230`; `useAdminUsers.ts:86-89` | Mỗi analysis → 2 query + 1 refetch window; tốn tài nguyên |
| X-06 | Low | Search/filter giữ toàn bộ email trong RAM; không có cảnh báo PII khi export (nếu thêm) | `fetchAllProfiles` | Rủi ro rò rỉ qua devtools/extension; cần policy nếu export |
| X-07 | — (đã chốt) | DB **cộng dồn** khi gia hạn là đúng; chỉ có copy UI "Pro 30 ngày" dễ hiểu sai | `admin_set_user_plan` (`20261101050000:60-65`) | Cần đổi copy thành "Pro +30 ngày" và hiển thị hạn mới |

### X-01 — Rate limit

- Express: `app.use('/api/admin', strictLimiter, adminRouter)` — 10 request / 15 phút / IP. Một admin sửa plan (2 request: limit + plan) + xoá vài user có thể chạm 429 rất nhanh. Đây là **giới hạn sai đối tượng** (admin đã authenticated).
- Vercel production: không gọi `enforceRateLimit` trong `api/admin.ts`; chỉ có auth + admin check.
- Nên: thêm bucket `admin` theo **user id** (ví dụ 120 request/15 phút), áp dụng cả hai surface; tách shared handler `handleAdminAction` để không lặp code; validate UUID/duration/plan và trả 400 thay vì 500.

### X-02 — Index đề xuất

```sql
CREATE INDEX IF NOT EXISTS idx_profiles_created_at ON public.profiles (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_is_new ON public.profiles (is_new) WHERE is_new;
CREATE INDEX IF NOT EXISTS idx_profiles_plan_expires ON public.profiles (plan, plan_expires_at);
CREATE INDEX IF NOT EXISTS idx_analysis_log_kind_created ON public.analysis_log (kind, created_at DESC);
-- nếu search server-side bằng ILIKE:
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_profiles_email_trgm ON public.profiles USING gin (email gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_profiles_name_trgm ON public.profiles USING gin (display_name gin_trgm_ops);
```

Cần đo `EXPLAIN ANALYZE` trên dataset thật trước khi thêm trigram; không thêm mù.

### X-03 — Audit & global setting

- Thêm action `update_app_setting` vào CHECK constraint + `log_admin_action` (hoặc ghi audit server-side).
- Tốt hơn: chuyển ghi `app_settings` sang API admin (`service_role`) để có validation + audit + atomic; client không update trực tiếp nữa. Khi đó RLS `app_settings_admin_write` có thể siết lại.
- Xây tab Audit: filter theo `admin_id`, `action`, `target_user_id`, khoảng ngày; join profile để hiện email; phân trang server-side.

### X-04 — Tách component

Đề xuất tách `AdminView` thành:
- `AdminUsersTab` (banner, filters, table, pagination)
- `AdminUserRow` / `AdminUserActions`
- `AdminUserEditModal`
- `AdminGlobalLimitCard`
- `AdminAuditTab`
- hooks: `useAdminUsers` (list query), `useAdminUserMutations` (plan/limit/role/lock/delete), `useAdminNewUsers`.

Mục tiêu: file < 300 dòng, test action riêng, tránh re-render toàn bảng khi modal state đổi.

---

## 6. Brainstorm cải thiện (ngoài bug)

### 6.1 Vận hành user

- **User detail drawer**: click row mở panel phải: profile, plan + expiry, usage theo chu kỳ, 10 lần phân tích gần nhất, payment gần nhất, ngày tạo/đăng nhập gần nhất, nút Resend welcome/verification (nếu có), Reset quota (có confirm).
- **Filter nhanh**: "Mới đăng ký", "Đã khoá", "Sắp hết hạn ≤ 7 ngày", "Hết hạn", "Custom limit", "Admin".
- **Sort**: mới nhất, usage cao nhất, sắp hết hạn, tên A-Z.
- **Bulk actions**: mark read, lock/unlock, gán plan (có preview), export CSV (audit + giới hạn).
- **Saved views**: lưu bộ filter (locked + expiring) để mở nhanh.
- **Keyboard**: `/` focus search, `j/k` di chuyển row, `Enter` mở detail.
- **Empty/error states**: skeleton, "Thử lại", "Xoá filter".

### 6.2 Report & insight

- **Quota vs volume** tách riêng; thêm "active users" (có ít nhất 1 analyze trong kỳ), "retention" (user quay lại), "conversion free→paid" nếu có payment data.
- **Cost guardrail**: ngưỡng cost/ngày, cảnh báo khi vượt; top user theo cost (không chỉ count).
- **Model performance**: latency p95, error rate, token/call theo model; so sánh model.
- **Failure analysis**: nhóm `error_message` theo category; top lỗi; tỷ lệ retry/fallback (từ `guard_metrics`).
- **Custom range + compare**: 7 ngày này vs 7 ngày trước; tháng này vs tháng trước.
- **Export**: CSV/Sheets cho daily/top user; PDF snapshot cho báo cáo tuần.
- **Drilldown**: click ngày → danh sách log (admin-only, có phân trang, không hiện nội dung CV); click user → Users tab.
- **Cache**: cache aggregate 60s theo range; invalidate khi có log mới hoặc theo TTL; giảm tải DB.

### 6.3 Governance / an toàn

- **Audit UI** + export audit; retention policy (ví dụ 12 tháng) và quyền xoá audit (chỉ service role).
- **Atomic privileged actions**: plan+limit+audit trong 1 transaction; ghi audit trước/sau với `request_id`.
- **Two-step destructive**: xoá yêu cầu gõ email; role promotion yêu cầu gõ email; hiển thị cảnh báo "admin có toàn quyền".
- **Idempotency**: `request_id` cho plan/delete để retry an toàn.
- **Rate limit + anomaly detection**: cảnh báo nếu một admin thực hiện > N thao tác/giờ; log IP/user agent vào audit details.
- **Session freshness**: refresh role khi focus; nếu bị demote → đóng admin ngay.
- **Data minimization**: danh sách user chỉ select cột cần; export cần audit + watermark.

### 6.4 UX / i18n

- Sub-tab trên URL: `/vi/admin/users`, `/vi/admin/report` (giữ filter/page trong query nếu muốn share).
- Toast success/error; inline per-row spinner; optimistic update + rollback.
- Confirm modal thay `window.confirm`; copy nêu rõ email, hành động, hậu quả.
- Nhãn role/plan dịch đầy đủ; dùng `adminAnalyticsUnlimited`; sửa "Định dạng" → "Vai trò"; preset plan ghi rõ "gia hạn".
- Mobile: table → card list hoặc horizontal scroll có sticky cột member; action menu.

---

## 7. Plan sửa

### Nguyên tắc

1. **Sửa đúng trước, tối ưu sau**: P0 chỉ sửa bug im lặng/không thể hoàn tác; không refactor lớn.
2. **Một nguồn dữ liệu**: list/filter/count/report đều server-side; client không tự aggregate toàn bảng.
3. **Mọi thay đổi quyền/plan/limit phải atomic + audit**.
4. **Test trước khi merge**: unit cho UI/hook/service; SQL test cho RPC/RLS; manual staging với dataset lớn.

### Phase 0 — Hotfix (2–2.5 ngày)

| Task | Nội dung | File chính | Acceptance |
|---|---|---|---|
| A1 | User thường: 2 trạng thái `inherit/custom N`; admin luôn ∞; legacy custom-null hiện cảnh báo và cho chuyển đổi; validation chặn `null` cho non-admin | `AdminView.tsx`, `userService.ts`, `translations/admin.ts` | Không tạo mới unlimited; legacy reset/chuyển được; có test |
| A2 | `loadMore` không tăng page khi lỗi; chặn double click; merge theo id; refresh invalidate loadMore | `useAdminUsers.ts` | Fetch lỗi → page giữ nguyên; double click → 1 request; refresh+loadMore không duplicate |
| A3 | Skeleton lúc load; filter lỗi có error + retry; empty chỉ khi `!loading` | `AdminView.tsx` | Không còn flash "Không có user"; lỗi filter không quay vô hạn |
| A4 | Global limit: state `null` khi chưa load; disable Save + retry khi lỗi | `AdminView.tsx`, `appSettingsService.ts` | Không thể ghi 5 khi load lỗi |
| A5 | Non-admin `/admin` → redirect analyze (hoặc 403 view) | `AppContent.tsx` | Không còn trang trắng |
| A6 | Sửa nhãn "Vai trò", dịch role, dùng key unlimited, đổi preset thành "Pro +30 ngày", sửa copy confirm delete | `translations/admin.ts`, `AdminView.tsx` | Không còn raw `admin/user`/`Recruiter`; copy plan đúng cộng dồn |
| A7 | Query audit số row `custom=true, limit=NULL`; quyết định chuyển về inherit/custom (có log) trước khi siết DB | migration/script | Báo cáo số row; không còn non-admin custom-null |

**Sau Phase 0:** thêm regression test vào 4 file test hiện có; chạy `npm run lint` + `npm test`.

### Phase 1 — Correctness & scale (4–6 ngày)

| Task | Nội dung | File / DB | Acceptance |
|---|---|---|---|
| B1 | RPC `admin_list_profiles(p_search, p_plan, p_role, p_status, p_sort, p_limit, p_offset)` trả rows+total; thay `fetchAllProfiles` + filter client | migration mới, `userService.ts`, `AdminView.tsx`, `useAdminUsers.ts` | 5k user: search 1 request, page 2 đúng, total đúng; không tải full table |
| B2 | Index `profiles(created_at)`, partial `is_new`, composite `analysis_log(kind, created_at)` | migration | `EXPLAIN` dùng index; admin load không sort toàn bảng |
| B3 | Hợp nhất realtime: 1 channel cho Users + badge, debounce; badge dùng count DB-wide | `AuthContext.tsx`, `useAdminUsers.ts` | Một analysis → tối đa 1 refetch + 1 count; banner khớp Header |
| B4 | RPC `admin_report_stats(start,end)` trả **volume** (`analyze` success/error, `[start,end)`) + **quota** (`SUM(effective_usage_count)` non-admin, chu kỳ hiện tại); card riêng, label rõ; loại admin khỏi "new registrations" | migration, `adminReportService.ts`, `AdminReportTab.tsx` | 30d/100k log: 1 request, payload < 20KB, số khớp fixture; quota card có "tính đến HH:mm" |
| B5 | Shared handler admin + rate-limit bucket `admin` (theo user); validate UUID/duration; trả 400 | `_server-lib/admin/handler.ts` (mới), `api/admin.ts`, `server/routes/admin.ts` | Vercel + Express cùng hành vi; không 429 oan; input sai → 400 |
| B6 | RPC `admin_update_user` atomic plan+limit+audit; một `isSaving`; idempotency | migration, `AdminView.tsx`, `userService.ts` | Double click không cộng 2 lần; lỗi plan không để limit nửa vời |
| B7 | DB CHECK admin-only unlimited + backfill legacy non-admin `custom-null` → inherit (sau A7) | migration | Constraint pass; non-admin null không còn; rollback được |

**Lưu ý B4:** nếu chưa muốn làm pricing trong SQL, RPC trả token theo `(model, kind)`; client tính cost từ `GEMINI_PRICING` — payload vẫn nhỏ.

### Phase 2 — Governance & UX (5–6 ngày)

| Task | Nội dung | Acceptance |
|---|---|---|
| C1 | Tab Audit: list/filter/pagination; join target email | Truy vết được role/plan/delete/permission/limit/setting |
| C2 | Audit `update_app_setting`; chuyển ghi global limit sang API admin | Mọi thay đổi global có audit + validation |
| C3 | Confirm modal thay `window.confirm`; xoá yêu cầu gõ email; toast + optimistic update | Xoá nhầm khó xảy ra; action có phản hồi ngay |
| C4 | URL `/vi/admin/users` và `/vi/admin/report` + filter/page trong query | Refresh/back/forward giữ đúng tab |
| C5 | Bulk actions (mark read, lock/unlock) + filter role/status/new/expiring | Thao tác 20 user không cần 20 click |
| C9 | CSV export users/report: audit, giới hạn scope, watermark thời điểm export | Export có truy vết; không lộ ngoài phạm vi admin |
| C6 | Report: refresh/auto-refresh, latency p95, error categories, model mix, custom range | Report dùng để điều tra được, không chỉ để xem |
| C7 | Accessibility: dialog role/focus trap/Esc, table scope, alert role | Keyboard-only dùng được |
| C8 | Session admin: refresh on focus/subscribe own row; demote → đóng tab | Không còn tab Admin "ma" |

### Phase 3 — Product (optional, 5+ ngày)

| Task | Nội dung |
|---|---|
| D1 | User detail drawer: usage, plan, payments, history gần đây, hành động support |
| D2 | CSV nâng cao: export theo lịch/email, template báo cáo tuần |
| D3 | So sánh kỳ trước, custom range, saved report |
| D4 | Cost snapshot/versioned pricing; cost alert theo ngày/tuần |
| D5 | Drilldown log theo ngày/user; link Users ↔ Report |
| D6 | Retention policy cho `analysis_log`/audit; dọn dữ liệu cũ |

**Tổng Phase 0–2:** khoảng **11–14.5 ngày** cho 1 dev (chưa gồm QA/review); Phase 3 optional. Ưu tiên tuyệt đối Phase 0 + B1/B4.

### Thứ tự & dependency

```text
Phase 0 (hotfix, ship ngay)
   └─> Phase 1 (B1/B2/B4/B6) — có thể song song B2/B4
          └─> Phase 2 (C1/C2/C3/C4) — audit & UX
                 └─> Phase 3 (D1–D6)
```

- B1 và B4 độc lập; B2 nên làm trước/đồng thời B1/B4 để đo hiệu năng.
- B5/B6 nên làm cùng nhau vì cùng đụng API/RPC.
- Không làm C5 (bulk) trước B1 (server-side list) — nếu không sẽ bulk trên window 50, sai.

### Definition of Done (chung)

- `npm run lint`, `npm test`, `npm run build` pass; `npm run lint:api` pass nếu đổi API.
- Có test mới cho mỗi bug/feature; test cũ không sửa kỳ vọng một cách che giấu lỗi.
- Migration có rollback/forward-safe; RLS test cho non-admin.
- Manual QA trên staging với: 2 admin, 1 user locked, 1 user custom-unlimited, 1 recruiter còn 300 ngày, 1 pro hết hạn, 1 user mới.
- Không log PII/token ra console; không đưa email vào GA4.

---

## 8. Test plan chi tiết

### Unit / component

| Test | Kỳ vọng |
|---|---|
| Limit user thường | `inherit` gọi reset; `custom 20` gọi update(20); **không** có nút unlimited |
| Admin unlimited | Role admin hiển thị ∞; không cho chỉnh custom limit |
| Legacy custom-null | Cảnh báo; admin chuyển được về inherit/custom; không tạo mới |
| loadMore lỗi | `page` không đổi; retry tải đúng page; không mất row |
| loadMore double click | Chỉ 1 request |
| Refresh + loadMore chồng | Không duplicate id; thứ tự ổn định |
| Initial loading | Skeleton, không empty state |
| Filter fetch lỗi | Error + retry, không spinner vĩnh viễn |
| Global limit load lỗi | Save disabled; không ghi 5 |
| Non-admin `/admin` | Redirect/403, không null |
| Report race | Giữ stats của range mới (test hiện có) |
| Report new users | Loại admin hoặc label rõ |
| Report quota card | Tính từ `effective_usage_count`, không phải analyze count |

### SQL / RLS

- Non-admin gọi `admin_list_profiles`, `admin_report_stats`, `admin_update_user` → `42501`.
- Admin gọi được; kết quả filter/sort/total đúng fixture.
- `admin_update_user` atomic: plan fail → limit rollback.
- Audit row được ghi trong cùng transaction (nếu làm C2).
- `app_settings.updated_by` ON DELETE SET NULL: xoá user từng là admin thành công.
- Index được dùng (`EXPLAIN`), không seq scan trên 5k/100k fixture.

### Manual / performance

- Seed 5.000 profiles + 100.000 analysis_log; đo:
  - Load Users (page 1), search, filter plan, load more.
  - Report 30d; payload size; thời gian render.
  - Mục tiêu: API p95 < 500ms; payload report < 20KB; không giật khi gõ search.
- Realtime: 2 tab admin; user khác analyze → cả hai cập nhật ≤ 2s; không duplicate.
- Xoá user có R2 file (nếu bật): kiểm tra cleanup job + object biến mất; nếu chưa bật R2, ghi chú test sau.
- Demote admin: tab Admin đóng sau refresh/focus.

---

## 9. Rủi ro & lưu ý triển khai

1. **Migration order**: thêm index/RPC trước khi deploy client dùng; RPC mới phải grant đúng (`authenticated` + `is_admin()` guard, hoặc chỉ `service_role`).
2. **RLS**: không dùng `SECURITY DEFINER` cho RPC list/report nếu không cần; nếu dùng, phải tự guard `is_admin()` và `SET search_path`.
3. **Audit atomic**: nếu gộp audit vào RPC, đảm bảo action nằm trong CHECK constraint; migration cần chạy trước.
4. **Rate limit**: bucket `admin` theo user id; không dùng IP cho admin (sau proxy/Vercel có thể khác).
5. **Realtime**: kiểm tra publication `supabase_realtime` còn bật cho `profiles`; nếu thêm `analysis_log`, cân nhắc volume.
6. **R2**: `storage_cleanup_jobs` có trigger dọn prefix khi xoá auth user, nhưng phụ thuộc cron; verify job chạy trước khi coi deletion là "xong".
7. **Không phá backward compatibility**: giữ `fetchAllProfiles` trong lúc rollout B1, hoặc feature flag; xoá sau khi verify.
8. **PII**: export CSV/audit UI cần kiểm soát quyền, không đưa email vào log/analytics.

---

## 10. Quyết định đã chốt & việc còn mở

### Đã chốt (2026-10-31)

| # | Quyết định | Hệ quả triển khai |
|---|---|---|
| 1 | **"Unlimited" chỉ dành cho admin.** Admin vốn đã unlimited theo `role`, không cần custom limit. | User thường chỉ có `inherit` hoặc `custom N`; UI bỏ lựa chọn unlimited. Legacy non-admin `custom-null` phải được cảnh báo và chuyển đổi, không tạo mới. Thêm validation service/RPC, sau đó DB CHECK. |
| 2 | Report đo **volume gọi analyze**, đồng thời hiển thị **quota đã dùng**. | Volume = `COUNT(analyze)` trong range (success + error), tách success/error. Quota = `SUM(effective_usage_count)` non-admin, **chu kỳ hiện tại**, không theo range. Công thức + chi phí đọc ở §4 — R-02. |
| 3 | DB **cộng dồn** khi gia hạn plan là đúng. | Chỉ sửa copy UI: "Pro +30 ngày", "Gia hạn thêm 30 ngày"; hiển thị hạn mới sau khi lưu. Không đổi logic `admin_set_user_plan`. |
| 4 | Cần **audit UI**, **bulk actions**, **CSV export**. | Đưa vào Phase 2 (C1, C5, C9); không để optional. CSV phải có audit + giới hạn scope + watermark thời điểm export. |

### Còn mở (cần chốt trước task tương ứng)

1. ~~Chuyển đổi dữ liệu legacy~~ — **đã đóng:** A7 production audit ngày 2026-10-31 trả **0** row, không cần backfill; B7 thêm CHECK constraint.
2. **Audit retention**: giữ bao lâu (đề xuất 12 tháng) và ai được xoá audit? Chỉ service role/SQL, không qua UI.
3. **CSV export**: ai được export (mọi admin hay chỉ super-admin), có cần watermark + giới hạn số row/lần không?
4. **Quota card**: chỉ snapshot chu kỳ hiện tại, hay thêm breakdown theo plan / số user chạm trần / top user sắp hết quota?
5. **R2**: đã bật cho `saved`/`temp` ở production chưa? Nếu có, verify cleanup job trước khi coi việc xoá user là đủ.

---

## 11. Phụ lục

### A. Luồng dữ liệu hiện tại

```text
Admin Users
  AdminView
    ├─ useAdminUsers ──> PostgREST profiles (RLS is_admin) ──> 50 row + count
    ├─ fetchAllProfiles ──> PostgREST profiles (toàn bảng, khi filter)
    ├─ update permission/limit ──> PostgREST profiles (trigger check is_admin) + audit RPC
    └─ update role/plan/delete ──> /api/admin (service_role) ──> RPC + audit

Admin Report
  AdminReportTab
    └─ getAdminReportStats ──> PostgREST analysis_log (RLS is_admin, toàn bộ row trong range)
                              └─ JS aggregate (daily, top user, token/cost)
```

### B. Trạng thái limit (đề xuất)

| UI | DB custom | DB limit | Effective |
|---|---|---:|---|
| Mặc định hệ thống | false | bất kỳ | `app_settings.default_monthly_analytics_limit` |
| Không giới hạn | true | NULL | ∞ |
| Tuỳ chỉnh | true | N | N |

### C. Kết quả baseline

```text
npm run lint
> tsc --noEmit
(no output) → PASS

npx vitest run src/__tests__/components/AdminView.test.tsx \
  src/__tests__/components/AdminReportTab.test.tsx \
  src/__tests__/hooks/useAdminUsers.test.tsx \
  src/__tests__/services/adminReportService.test.ts
Test Files  4 passed (4)
Tests       18 passed (18)
```

### D. Ghi chú

- Báo cáo này **không** thay thế security audit độc lập; các kết luận RLS dựa trên migration, cần đối chiếu schema production.
- Các ước lượng effort là cho 1 dev đã quen codebase; chưa gồm thời gian chờ review/QA.
- Finding U-01 đã được tái hiện bằng test tạm (fail), không phải suy đoán.

---

## 12. Phase 0 — trạng thái triển khai (2026-10-31)

| Task | Trạng thái | Thay đổi chính | Regression proof |
|---|---|---|---|
| A1 | ✅ Code | Limit user thường còn `inherit/custom N`; admin ∞ theo role; legacy custom-null có cảnh báo và reset được; `updateUserMonthlyAnalyticsLimit` bắt buộc số nguyên ≥ 0, không nhận `null` | `AdminView.test` (3 test limit/legacy), `userServiceAnalyticsLimit.test` |
| A2 | ✅ Code | `useAdminUsers` dùng request sequence + busy refs; chỉ tăng page sau fetch thành công; merge theo id; refresh thắng loadMore cũ | `useAdminUsers.test` (page-failure retry, double-click) |
| A3 | ✅ Code | Skeleton 5 dòng lúc load; filter error + retry; empty state chỉ khi không loading | `AdminView.test` (skeleton, filter error) |
| A4 | ✅ Code | Global limit chỉ load xong mới cho sửa/lưu; lỗi có retry; free user hiển thị `—` thay vì fallback 5 | `AdminView.test` (global load failure) |
| A5 | ✅ Code | Non-admin `/admin` được redirect về analyze; không còn vùng trắng | Type-check + manual path (chưa có test AppContent riêng) |
| A6 | ✅ Code | "Vai trò"; role/plan dịch; preset "Pro +N ngày"; hint cộng dồn; confirm xoá có email; dùng key unlimited | `AdminView.test` (role/plan labels indirectly) |
| A7 | ✅ Done | Production query ngày 2026-10-31: **0** row non-admin `custom=true, limit=NULL` → không cần backfill | Query trong §10/§12 |
| B7 | ✅ Done + **applied production** | Migration `20261101150000_admin_only_unlimited_limit.sql` thêm CHECK; backfill không cần vì A7=0. Production verify 2026-10-31: `profiles_admin_only_unlimited_limit`, `convalidated = true` | `supabase/tests/admin_only_unlimited_limit.test.sql` PASS trên Postgres 16 disposable |

**Đã hoàn tất sau Phase 1/2:** U-03 (full-table fetch), U-05/B3 (new-user count), audit UI, bulk actions và CSV đã có code + test tương ứng (§13/§14).

**Query A7 (chạy trên production trước B7):**

```sql
SELECT count(*) AS legacy_unlimited_non_admin
FROM public.profiles
WHERE role <> 'admin'
  AND monthly_analytics_limit_custom
  AND monthly_analytics_limit IS NULL;
```

**Gate đã chạy:** `npm run lint` pass; `npm test` **703/703** pass; `npm run build` pass; SQL test `supabase/tests/admin_only_unlimited_limit.test.sql` **PASS** trên Postgres 16 disposable (migration replay có 2 lỗi lịch sử đã biết ở `20260602100000`, không liên quan constraint mới).

---

## 13. Phase 1 — trạng thái triển khai (2026-10-31)

| Task | Trạng thái | Thay đổi chính | Regression proof |
|---|---|---|---|
| B1 | ✅ Code | RPC `admin_list_profiles` phân trang/search/filter/sort server-side; `useAdminUsers` nhận query, bỏ `fetchAllProfiles`/load-more lai; AdminView có filter role/status/sort | SQL `admin_list_profiles.test.sql`; `userServiceAdminUsers.test`; `useAdminUsers.test` |
| B2 | ✅ Code | Index `profiles(created_at DESC)`, partial `is_new`, composite `analysis_log(kind, created_at DESC, status)` | Assertion index trong SQL test B1 |
| B3 | ✅ Phần lớn | Banner/new-user count lấy DB-wide từ RPC; Header badge debounce 1s. Vẫn còn 2 subscription `profiles` (Header + Users) — chưa gộp thành một channel | `AdminView.test` banner; không có test tích hợp 2 channel |
| B4 | ✅ Code | RPC `admin_report_stats` trả aggregate (daily zero-fill, top user, token theo model, quota hiện tại); bỏ tải raw `analysis_log`; card "Quota đã dùng" thay "Lượt/tháng" | SQL `admin_report_stats.test.sql`; service/UI tests |
| B5 | ✅ Code | Shared `_server-lib/admin/handler.ts` cho Vercel + Express; bucket rate limit `admin` 120/15 phút theo user; validation UUID/duration/plan; Express bỏ `strictLimiter` 10/15 phút | `api/__tests__/admin.test.ts` (10 test) |
| B6 | ✅ Code (idempotency một phần) | RPC `admin_update_user` atomic plan+limit+audit; UI gọi một lần, guard double-submit bằng ref; service `adminUpdateUser`. Chưa có `request_id` phía server cho retry sau lỗi mạng | SQL `admin_update_user.test.sql`; API test `update-user` |
| B7 | ✅ Applied production | Constraint admin-only unlimited đã verify `convalidated = true` | SQL test + production query |

**Gate đã chạy:**
- `npm run lint` → PASS
- `npm run lint:api` → PASS
- `npm test` → **714/714** PASS (63 files)
- `npm run build` → PASS
- SQL suite (Postgres 16 disposable): `admin_list_profiles`, `admin_report_stats`, `admin_update_user`, `admin_only_unlimited_limit` → PASS

**Production:** migration `20261101150000`–`20261101260000` đã apply; bundle Admin/API đã deploy qua PR #46.

**Ghi chú:**
- B3 chưa gộp hẳn 2 realtime channel; cả hai đã debounce và dùng cùng định nghĩa count (`is_new` + non-admin), nên số không lệch.
- `fetchAllProfiles` đã bị xoá; các hàm legacy `updateUserMonthlyAnalyticsLimit`/`resetUserToGlobalAnalyticsLimit`/`adminUpdateUserPlan` vẫn còn export nhưng Admin UI không còn gọi (có thể dọn ở Phase 2).
- Rate limit admin dùng bảng `api_rate_limits`; cần migration `20261101100000` đã có trên production.

---

## 14. Phase 2 — trạng thái triển khai (2026-10-31)

| Task | Trạng thái | Thay đổi chính | Ghi chú |
|---|---|---|---|
| C1 Audit UI | ✅ Code | RPC `admin_list_audit` + tab **Nhật ký**: filter action, search email/id, phân trang, actor/target email | SQL `admin_phase2.test.sql`; audit service test |
| C2 Audit global setting | ✅ Code | `admin_update_app_setting` validate + audit; appSettingsService gọi API; bỏ RLS write `app_settings` | API test `update-global-limit`; appSettings test |
| C3 Confirm/toast/optimistic | ✅ Phần lớn | `ConfirmDialog` thay `window.confirm`; xoá yêu cầu gõ email; toast; optimistic role/lock/delete; plan refresh | Focus trap chưa đầy đủ |
| C4 URL section | ✅ Phần lớn | `/vi/admin/{users|report|audit}` + popstate; giữ section khi đổi ngôn ngữ | Filter/page chưa encode vào query |
| C5 Bulk actions | ✅ Phần lớn | Bulk mark-read/lock/unlock (RPC + audit); filter role/status | Filter "mới"/"sắp hết hạn" chưa có |
| C6 Report insight | ✅ Phần lớn | Refresh + auto-refresh 60s; latency p50/p95; error categories; model mix & cost | Custom range chưa có |
| C7 Accessibility | ✅ Cơ bản | Dialog role/aria/Esc; table `scope`; report error `role=alert` | Chưa có focus trap |
| C8 Session freshness | ✅ Code | AuthContext refresh profile on focus + 5 phút; demote → AppContent redirect | — |
| C9 CSV export | ✅ Code | Users CSV (cap 1000) + Report CSV; audit `export_data` trước khi tải | Cần apply migration audit action |

**Gate:** `npm run lint`, `npm run lint:api`, `npm test` (**714/714**), `npm run build`; SQL suite gồm `admin_phase2.test.sql` + 4 suite Phase 1 đều PASS trên Postgres 16 disposable.

**Production:** đã apply `20261101200000`–`20261101250000` và deploy bundle; `250000` được apply sau khi bundle mới live.

**Còn lại:** filter page/query trong URL; quick filter new/expiring; custom date range; focus trap; CSV theo lịch; audit export UI.

---

## 15. Fix: giá gói Free không theo global limit (2026-10-31)

**Triệu chứng:** admin đổi `app_settings.default_monthly_analytics_limit` nhưng bảng giá trang chủ vẫn ghi `5`; trang Upgrade chỉ đọc một lần lúc mount, người chưa đăng nhập không đọc được `app_settings` do RLS `authenticated`-only.

**Sửa:**
- Migration `20261101260000_public_plan_limits.sql`: RPC `get_public_plan_limits()` — `SECURITY DEFINER`, grant `anon` + `authenticated`, trả `{free, pro, recruiter}`; free lấy từ `get_default_monthly_analytics_limit()`, pro/recruiter qua `resolve_monthly_analytics_limit`.
- `usePublicPlanLimits` + `publicPlanLimitsService`: cache theo session, refresh khi tab focus; fallback 5/100/500 nếu RPC lỗi.
- `PricingSection` (landing) và `UpgradeView` dùng hook thay vì hardcode `5`/`100`/`500`.
- SQL test `public_plan_limits.test.sql`: gọi bằng role `anon`, assert free đổi theo app_settings.

**Trạng thái:** code + migration đã merge qua PR #47; `20261101260000` đã apply production. `get_public_plan_limits` trả free=3, pro=100, recruiter=500.

---

## 16. Follow-up không blocker (2026-10-31)

| Hạng mục | Trạng thái | Ghi chú |
|---|---|---|
| Filter/page trong URL query | ✅ Code | Users `?q=&plan=&role=&status=&flag=&sort=&page=`; Report `?range=&start=&end=`; Audit `?action=&q=&page=`; dùng `replaceState` + `popstate` |
| Custom date range Report | ✅ Code | `ReportRange='custom'`; ngày ICT inclusive; service chuyển sang `[start, next-day)`; validate start < end |
| Quick filter mới / sắp hết hạn | ✅ Code | RPC `admin_list_profiles_v2` thêm `p_flag` (`new`, `expiring` 7 ngày); RPC cũ giữ nguyên cho bundle đang chạy |
| Focus trap đầy đủ | ✅ Code | `useFocusTrap`: focus ưu tiên, Tab/Shift+Tab cycle, Esc, restore focus; dùng cho ConfirmDialog + plan modal |
| Request-id idempotency | ✅ Code | `admin_action_requests` + `admin_update_user_v2`; UI giữ một `requestId`/modal, retry mạng không stack plan |
| Docs production status | ✅ Updated | `7_deployment.md` + báo cáo ghi trạng thái đã apply/deploy; global default hiện tại 3 |

**Migration mới:** `20261101270000` (list v2), `20261101280000` (idempotency) — **chưa apply production**.

**Deploy:** apply `270000` + `280000` trước → deploy bundle → smoke test quick filter/custom range/idempotent retry.
