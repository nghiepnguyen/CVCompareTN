# Kế hoạch khắc phục lỗi bảo mật Supabase

> Nguồn: Supabase Security Advisor report (project `pgchcnmpuknbgyljdlyp`)

## Trạng thái (đã triển khai trong repo + remote)

| Hạng mục | Trạng thái |
|----------|------------|
| Fix 1–5 (SQL revoke RPC, bucket, `search_path`) | Đã gộp vào `supabase/migrations/20260601110000`–`20260601150000` |
| Re-apply grants sau `activate_pro_plan` idempotent | `20260602100000_security_reapply_function_grants.sql` — **đã apply remote** |
| `resolve_monthly_analytics_limit` + PUBLIC execute | `20260602110000_security_revoke_resolve_limit_public.sql` — **đã apply remote** |
| Cảnh báo `anon_security_definer_*` | **Đã hết** trên Security Advisor (2026-05-26) |
| Cảnh báo `authenticated_security_definer_*` | Còn — **chấp nhận** (RPC client có guard `auth.uid()` / `is_admin()`) |
| Leaked password protection | **Thủ công Dashboard** — xem mục Auth bên dưới |

**Không** chạy lại các block SQL `fix_01`…`fix_05` trong SQL Editor nếu migration timestamp ở trên đã có trên DB. Dùng `supabase db push` hoặc MCP `apply_migration` cho migration mới.

### Auth — Leaked password protection (bạn cần bật một lần)

1. [Supabase Dashboard](https://supabase.com/dashboard) → project → **Authentication**
2. **Providers** hoặc **Password security**
3. Bật **Leaked password protection** (Have I Been Pwned)

### Xác minh nhanh sau migrate

```sql
SELECT p.proname, r.rolname,
       has_function_privilege(r.oid, p.oid, 'EXECUTE') AS can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_roles r ON r.rolname IN ('anon', 'authenticated', 'service_role')
WHERE n.nspname = 'public'
  AND p.proname IN ('activate_pro_plan', 'admin_set_user_plan', 'resolve_monthly_analytics_limit')
ORDER BY 1, 2;
```

Kỳ vọng: `activate_pro_plan` — chỉ `service_role` = true; `admin_set_user_plan` — `anon` = false; `resolve_monthly_analytics_limit` — `anon` = false.

Anon gọi RPC (phải bị từ chối): HTTP 401 / `permission denied for function activate_pro_plan`.

---

## Thứ tự ưu tiên (lịch sử / tham khảo)

| # | Vấn đề | Mức độ | File migration |
|---|--------|--------|----------------|
| 1 | `activate_pro_plan` gọi được bởi `anon` | 🔴 Nghiêm trọng | `fix_01_revoke_activate_pro_plan.sql` |
| 2 | `increment_usage_count` gọi được bởi `anon` | 🟡 Cao | `fix_02_revoke_anon_write_functions.sql` |
| 3 | Bucket `cv-files` cho phép listing công khai | 🟡 Cao | `fix_03_bucket_cv_files_policy.sql` |
| 4 | Các hàm đọc thông tin user gọi được bởi `anon` | 🟡 Trung bình | `fix_04_revoke_anon_read_functions.sql` |
| 5 | `search_path` chưa cố định trên 2 hàm | 🟢 Thấp | `fix_05_set_search_path.sql` |

---

## Fix 1 — Revoke `activate_pro_plan` khỏi `anon` và `authenticated`

**Lý do:** Hàm này kích hoạt gói Pro cho user. Nếu `anon` (chưa đăng nhập) gọi được, kẻ tấn công có thể tự nâng cấp tài khoản bất kỳ mà không cần thanh toán. Hàm này chỉ nên được gọi từ backend server dùng `service_role` key.

**Tạo file:** `supabase/migrations/fix_01_revoke_activate_pro_plan.sql`

```sql
-- Fix 1: Revoke quyền gọi activate_pro_plan từ anon và authenticated
-- Hàm này chỉ nên được gọi từ server-side dùng service_role key

REVOKE EXECUTE ON FUNCTION public.activate_pro_plan(
  p_user_id uuid,
  p_order_code bigint,
  p_duration_days integer,
  p_payos_data jsonb
) FROM anon;

REVOKE EXECUTE ON FUNCTION public.activate_pro_plan(
  p_user_id uuid,
  p_order_code bigint,
  p_duration_days integer,
  p_payos_data jsonb
) FROM authenticated;
```

**Sau khi chạy SQL — cập nhật phía backend:**

Mọi chỗ gọi `activate_pro_plan` trong code phải dùng Supabase client khởi tạo bằng `SUPABASE_SERVICE_ROLE_KEY`, không dùng `anon key`.

```typescript
// server/routes/payment.ts (hoặc tương đương)
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // service_role, không phải anon key
);

// Gọi hàm từ server-side
const { error } = await supabaseAdmin.rpc('activate_pro_plan', {
  p_user_id: userId,
  p_order_code: orderCode,
  p_duration_days: durationDays,
  p_payos_data: payosData,
});
```

---

## Fix 2 — Revoke `increment_usage_count` và `sync_profile_usage_month` khỏi `anon`

**Lý do:** `increment_usage_count` cho phép bất kỳ ai (chưa đăng nhập) tăng usage count của user bất kỳ nếu biết UUID → có thể spam làm hết quota tháng của người khác.

**Tạo file:** `supabase/migrations/fix_02_revoke_anon_write_functions.sql`

```sql
-- Fix 2: Revoke quyền gọi các hàm ghi từ anon

REVOKE EXECUTE ON FUNCTION public.increment_usage_count(user_id uuid) FROM anon;

REVOKE EXECUTE ON FUNCTION public.sync_profile_usage_month(p_user_id uuid) FROM anon;
```

> Giữ nguyên quyền `authenticated` cho 2 hàm này vì app cần user đăng nhập mới gọi.

---

## Fix 3 — Sửa policy bucket `cv-files`

**Lý do:** Policy hiện tại (`cv_files_select_public_bucket`) cho phép ai cũng liệt kê toàn bộ file trong bucket, lộ danh sách CV của tất cả người dùng.

**Tạo file:** `supabase/migrations/fix_03_bucket_cv_files_policy.sql`

```sql
-- Fix 3: Sửa policy SELECT của bucket cv-files
-- Xóa policy cũ cho phép listing toàn bộ bucket
DROP POLICY IF EXISTS "cv_files_select_public_bucket" ON storage.objects;

-- Tạo lại: chỉ cho phép authenticated đọc file trong folder của chính mình
-- Cấu trúc path trong bucket: {user_id}/{filename}
CREATE POLICY "User reads own cv files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'cv-files'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
```

> **Lưu ý:** Nếu các file CV không cần truy cập qua public URL mà chỉ dùng nội bộ, cân nhắc đổi bucket thành private trong Supabase Dashboard → Storage → `cv-files` → Edit bucket → tắt Public.

---

## Fix 4 — Revoke các hàm đọc thông tin user khỏi `anon`

**Lý do:** `check_analytics_quota` và `get_user_plan` có thể rò thông tin plan/quota của user bất kỳ nếu kẻ tấn công biết UUID.

**Tạo file:** `supabase/migrations/fix_04_revoke_anon_read_functions.sql`

```sql
-- Fix 4: Revoke quyền anon gọi các hàm đọc thông tin user

REVOKE EXECUTE ON FUNCTION public.check_analytics_quota(p_user_id uuid, p_additional integer) FROM anon;

REVOKE EXECUTE ON FUNCTION public.get_user_plan(p_user_id uuid) FROM anon;

-- Các hàm helper nội bộ, anon không cần gọi trực tiếp
REVOKE EXECUTE ON FUNCTION public.effective_monthly_analytics_limit(p_custom boolean, p_limit integer) FROM anon;

REVOKE EXECUTE ON FUNCTION public.resolve_monthly_analytics_limit(
  p_effective_plan text,
  p_custom boolean,
  p_stored_limit integer
) FROM anon;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;

-- Hàm đọc config hệ thống — có thể giữ anon nếu muốn hiển thị limit cho guest
-- Uncomment dòng dưới nếu muốn ẩn luôn:
-- REVOKE EXECUTE ON FUNCTION public.get_default_monthly_analytics_limit() FROM anon;
```

---

## Fix 5 — Cố định `search_path` cho 2 hàm còn lại

**Lý do:** Hàm không có `SET search_path` cố định có thể bị tấn công qua schema injection trong một số điều kiện đặc biệt.

**Tạo file:** `supabase/migrations/fix_05_set_search_path.sql`

```sql
-- Fix 5: Thêm SET search_path = public vào các hàm bị cảnh báo

-- Xem định nghĩa hiện tại trước khi sửa:
-- SELECT pg_get_functiondef('public.current_usage_month'::regproc);
-- SELECT pg_get_functiondef('public.effective_plan_from_row'::regproc);

-- Sau khi xem định nghĩa, CREATE OR REPLACE lại với thêm dòng:
-- SET search_path = public

-- Ví dụ template (thay phần body bằng nội dung thực tế từ pg_get_functiondef):

/*
CREATE OR REPLACE FUNCTION public.current_usage_month(...)
RETURNS ...
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public   -- <-- thêm dòng này
AS $$
BEGIN
  -- ... body giữ nguyên ...
END;
$$;
*/

/*
CREATE OR REPLACE FUNCTION public.effective_plan_from_row(...)
RETURNS ...
LANGUAGE sql
SECURITY DEFINER
SET search_path = public   -- <-- thêm dòng này
AS $$
  -- ... body giữ nguyên ...
$$;
*/
```

> Fix 5 cần xem định nghĩa hàm thực tế trước. Chạy 2 câu SELECT comment ở trên trong SQL Editor để lấy body, rồi CREATE OR REPLACE lại với `SET search_path = public`.

---

## Checklist thực hiện

- [ ] Chạy `fix_01_revoke_activate_pro_plan.sql` trong SQL Editor
- [ ] Cập nhật code backend dùng `service_role` key khi gọi `activate_pro_plan`
- [ ] Chạy `fix_02_revoke_anon_write_functions.sql`
- [ ] Chạy `fix_03_bucket_cv_files_policy.sql`
- [ ] Kiểm tra app còn upload/đọc file CV bình thường sau khi đổi policy
- [ ] Chạy `fix_04_revoke_anon_read_functions.sql`
- [ ] Kiểm tra các luồng phân tích CV (`check_analytics_quota`) vẫn chạy đúng với user đã đăng nhập
- [ ] Lấy định nghĩa 2 hàm từ `pg_get_functiondef`, chạy `fix_05_set_search_path.sql`
- [ ] Vào Supabase Dashboard → Security Advisor → chạy lại kiểm tra để xác nhận cảnh báo đã giải quyết

---

## Lưu ý quan trọng

- Tất cả file SQL trên nên đặt vào `supabase/migrations/` với tên bắt đầu bằng timestamp để theo dõi lịch sử, ví dụ: `20260525_fix_01_revoke_activate_pro_plan.sql`.
- Sau mỗi fix, test luồng chính của app (đăng nhập, phân tích CV, xem quota) trước khi chuyển sang fix tiếp theo.
- Fix 1 là ưu tiên cao nhất — nên thực hiện trước tất cả các bước còn lại.
