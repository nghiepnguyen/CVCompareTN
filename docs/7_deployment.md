# Hướng dẫn Triển khai (Deployment Guide)

Dự án **cvFit** được triển khai theo mô hình **Vercel Native**, tích hợp cả Frontend (React/Vite) và Backend (Serverless Functions) trên cùng một hạ tầng Vercel.

## 1. Triển khai trên Vercel

Vercel phục vụ cả ứng dụng React và các hàm API trong thư mục `/api`.

### Project Vercel đúng (quan trọng)

| | |
|---|---|
| **Project name (Dashboard)** | `cvcompare` |
| **GitHub repo** | `nghiepnguyen/CVCompareTN` |
| **Production domain** | `https://cvfit.pro` (gắn trên project `cvcompare`) |
| **Preview URL (ví dụ)** | `https://cvcompare-<hash>-nghiepnguyens.vercel.app` |

**Không** dùng project `cv-compare-tn` (thường tạo khi `vercel link` / import nhầm). Push lên GitHub chỉ deploy đúng khi repo được gắn vào **`cvcompare`**, không phải `cv-compare-tn`.

#### Sửa khi push GitHub deploy nhầm project

1. Mở [Vercel Dashboard](https://vercel.com/dashboard) → project **`cv-compare-tn`** (nếu có) → **Settings** → **Git** → **Disconnect** repository `CVCompareTN`.
2. Mở project **`cvcompare`** → **Settings** → **Git** → **Connect** → chọn `nghiepnguyen/CVCompareTN`, branch **`main`**.
3. Trên **`cvcompare`**: **Settings** → **Environment Variables** — copy toàn bộ biến từ project cũ (hoặc từ `.env.example`).
4. **Deployments** → chọn deployment mới nhất trên `main` → **Redeploy** (hoặc push một commit nhỏ sau khi đã connect).
5. Local CLI (tùy chọn): trong thư mục repo chạy `vercel link` và chọn project **`cvcompare`** (cập nhật `.vercel/project.json`).

### Các bước thực hiện:

1.  **Kết nối GitHub:** Đẩy mã nguồn lên `nghiepnguyen/CVCompareTN` và kết nối **project Vercel `cvcompare`** (xem bảng trên).
2.  **Cấu hình Environment Variables:** Trong Dashboard của Vercel, hãy thiết lập các biến môi trường sau:
    -   `GEMINI_API_KEY`: API Key từ Google AI Studio.
    -   `RECAPTCHA_SECRET_KEY`: Secret Key cho reCAPTCHA v3.
    -   `RESEND_API_KEY`: API Key từ Resend.com.
    -   `RESEND_FROM_EMAIL`: Email gửi đi (phải được verify trên Resend).
    -   `FEEDBACK_RECIPIENT_EMAIL`: Email nhận thông báo góp ý.
    -   `VITE_ADMIN_EMAIL`: Email có quyền truy cập trang Admin.
    -   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`: Project Supabase (client).
    -   `VITE_GA_MEASUREMENT_ID`: Google Analytics 4 (ví dụ `G-GVTPXY9S3D`) — bắt buộc nếu bật theo dõi hành vi GA4.
-   **PayOS (Pro plan):** Thêm các biến sau để kích hoạt thanh toán:
    -   `PAYOS_CLIENT_ID`: Client ID từ cổng PayOS.
    -   `PAYOS_API_KEY`: API Key từ PayOS.
    -   `PAYOS_CHECKSUM_KEY`: Checksum Key để xác thực webhook (HMAC-SHA256).
    -   `SUPABASE_SERVICE_ROLE_KEY`: Service role key — webhook cần quyền ghi `profiles` và `payments`.
    -   `APP_URL`: URL đầy đủ của ứng dụng (vd: `https://cvfit.pro`), dùng cho `returnUrl`/`cancelUrl` của PayOS.
3.  **Cấu hình Frontend (Client-side):** Các biến có tiền tố `VITE_` sẽ được nhúng vào mã nguồn khi build.
4.  **Tự động triển khai:** Vercel sẽ tự động nhận diện thư mục `/api` và triển khai chúng dưới dạng Serverless Functions dựa trên cấu hình trong `vercel.json`.

## 2. Cấu hình Supabase (Bắt buộc)

Ứng dụng dùng **Supabase** cho xác thực (OAuth Google), cơ sở dữ liệu PostgreSQL và Storage (bucket file CV).

### Các bước thực hiện:

1.  **Tạo project Supabase:** Truy cập [Supabase Dashboard](https://supabase.com/dashboard).
2.  **Authentication:** Bật nhà cung cấp **Google**. Trong URL Redirect / Site URL, thêm domain production (ví dụ `https://cvfit.pro`) và URL preview của Vercel (`https://*.vercel.app`) cùng `http://localhost:5173` (hoặc cổng dev bạn dùng).
3.  **Database:** Áp dụng migration trong `supabase/migrations/` (khuyến nghị: `supabase db push`, hoặc chạy lần lượt trong SQL Editor):

    | Migration | Nội dung chính |
    |-----------|----------------|
    | `20260516120000_cv_matcher_core_schema.sql` | `profiles`, `history`, `saved_jds`, RPC `increment_usage_count`, RLS, bucket **`cv-files`** |
    | `20260516120100_history_add_parsed_cv.sql` | Cột `history.parsed_cv` (jsonb) — nếu DB cũ thiếu cột |
    | `20260520120000_profiles_monthly_analytics_limit.sql` | Hạn mức phân tích/tháng trên `profiles`, `check_analytics_quota` |
    | `20260520130000_profiles_default_monthly_limit_20.sql` | `DEFAULT 20` trên cột limit (thế hệ trước `app_settings`) |
    | `20260523100000_app_settings_analytics_default.sql` | Bảng **`app_settings`** (default **20**, đổi runtime), `monthly_analytics_limit_custom`, RPC effective limit |
    | `20260601000000_add_plan_to_profiles.sql` | Gói Pro: cột `plan`, `plan_expires_at`, `plan_updated_at` trên `profiles`; bảng `payments`; RPC `activate_pro_plan`, `get_user_plan`; cập nhật `check_analytics_quota` plan-aware |
    | `20260601110000`–`20260601150000_security_*.sql` | Security Advisor: revoke `anon` trên RPC nhạy cảm; `activate_pro_plan` chỉ `service_role`; SELECT bucket `cv-files` theo folder user; `search_path` cố định |
    | `20260601200000_admin_set_user_plan.sql` | RPC admin đổi plan free/pro (guard `is_admin()`) |
    | `20260601210000_activate_pro_plan_idempotent.sql` | `activate_pro_plan` idempotent (claim payment trước); **cần** migration security tiếp theo để giữ revoke EXECUTE |
    | `20260602100000_security_reapply_function_grants.sql` | Re-apply revoke `anon`/`authenticated` sau recreate `activate_pro_plan`; revoke `anon` trên `admin_set_user_plan`, `get_default_monthly_analytics_limit` |
    | `20260602110000_security_revoke_resolve_limit_public.sql` | Revoke `PUBLIC` execute trên `resolve_monthly_analytics_limit` (anon kế thừa qua `=X/postgres`) |

    **Auth (Dashboard, không qua SQL):** Bật **Leaked password protection** tại Authentication → Password security ([hướng dẫn](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)).

    Chi tiết hạn mức phân tích (Admin, SQL, không cần redeploy Vercel): [8_analytics.md § Hạn mức phân tích CV/tháng](8_analytics.md#hạn-mức-phân-tích-cvtháng-supabase--không-phải-ga4).
4.  **Storage:** Bucket **`cv-files`** — sau migration security, user **authenticated** chỉ SELECT object trong path `{user_id}/...`. Cân nhắc tắt Public bucket trên Dashboard nếu không cần URL công khai.
5.  **Biến môi trường:** Trên Vercel và trong `.env` local, thiết lập ít nhất `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY`. Với tác vụ server-side hoặc migration, dùng `SUPABASE_SERVICE_ROLE_KEY` (không đưa vào frontend).

### Edge Functions (tùy chọn)

Thư mục `supabase/functions/` có thể triển khai qua Supabase CLI khi bạn dùng `supabase.functions.invoke(...)` từ client — không còn phụ thuộc Firebase Functions.

## 3. Chế độ Phát triển (Local Development)

- **`npm run dev`:** Chỉ Vite (frontend); gọi API production hoặc `vercel dev` nếu cần `/api/*`.
- **`npm start`:** Express (`server.ts`) + Vite middleware — API path đã thống nhất với Vercel (PDF, reCAPTCHA dùng cùng path gốc, không còn suffix `/extract` hay `/verify`).
- **CI/CD:** Push lên `main`/`master` hoặc mở PR sẽ trigger GitHub Actions (`.github/workflows/ci.yml`): `lint` → `test` (78 tests, Vitest) → `build`.

Để mô phỏng đúng serverless Vercel tại máy:

1.  **Cài đặt Vercel CLI:** `npm install -g vercel`
2.  **Chạy lệnh:** `npm run vercel-dev` hoặc `vercel dev`.
3.  Local server (thường cổng do CLI chọn) gần với hạ tầng Vercel.

## 4. Cấu hình điều hướng (vercel.json)

Tệp `vercel.json` ở thư mục gốc đóng vai trò quan trọng trong việc định tuyến:

-   **Rewrites:** Điều hướng các request `/api/:path*` vào đúng thư mục `/api`.
-   **SPA Support:** Đảm bảo các route của React (như `/history`, `/admin`) luôn trả về `index.html` thay vì lỗi 404 khi người dùng tải lại trang.

## 5. Bảo mật mã nguồn và bí mật

### Biến môi trường

| Loại | Ví dụ | Ghi chú |
|------|--------|---------|
| **Client (`VITE_*`)** | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_RECAPTCHA_SITE_KEY`, `VITE_GA_MEASUREMENT_ID` | Được nhúng vào bundle build — chỉ dùng khóa **public** |
| **Server / Vercel** | `GEMINI_API_KEY`, `RECAPTCHA_SECRET_KEY`, `RESEND_API_KEY` | Cấu hình trên Vercel Dashboard hoặc `.env` local (không commit) |
| **Server-only** | `SUPABASE_SERVICE_ROLE_KEY` | Migration, script admin — **không** thêm tiền tố `VITE_` |

Sao chép `.env.example` → `.env` khi dev local. Chỉ `.env.example` được theo dõi trên Git.

### `.gitignore` (không đưa lên Git)

- `.env*`, trừ `!.env.example`
- `supabase/.temp/` — cache Supabase CLI (project ref, pooler URL, …)
- `.vercel/` — liên kết project local
- Khóa & credential: `*.pem`, `*.p12`, `id_rsa*`, `credentials.json`, `service-account*.json`
- Backup local có thể chứa PII: `users_backup.json`, `*-backup.json`
- **`graphify-out/*`** — artifact Graphify (graph.json, cache, …) **không** commit; ngoại lệ: **`!graphify-out/GRAPH_REPORT.md`** (báo cáo đọc được cho agent/CI). Tái tạo local: `graphify update .`. Hook post-commit có thể ghi `~/.cache/graphify-rebuild.log` — lỗi sandbox không chặn push.

Nếu đã commit nhầm secret: xoá khỏi lịch sử Git, **rotate** key trên Google / Supabase / Resend / Vercel, rồi cập nhật biến môi trường mới.

### Supabase CLI

Sau `supabase link`, thư mục `supabase/.temp/` được tạo tự động — **không** add vào repo. Migrations trong `supabase/migrations/` vẫn được commit bình thường.
