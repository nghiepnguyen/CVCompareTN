# Hướng dẫn Triển khai (Deployment Guide)

Dự án **CV Matcher & Optimizer** được triển khai theo mô hình **Vercel Native**, tích hợp cả Frontend (React/Vite) và Backend (Serverless Functions) trên cùng một hạ tầng Vercel.

## 1. Triển khai trên Vercel

Vercel phục vụ cả ứng dụng React và các hàm API trong thư mục `/api`.

### Các bước thực hiện:

1.  **Kết nối GitHub:** Đẩy mã nguồn lên GitHub và kết nối project với Vercel.
2.  **Cấu hình Environment Variables:** Trong Dashboard của Vercel, hãy thiết lập các biến môi trường sau:
    -   `GEMINI_API_KEY`: API Key từ Google AI Studio.
    -   `RECAPTCHA_SECRET_KEY`: Secret Key cho reCAPTCHA v3.
    -   `RESEND_API_KEY`: API Key từ Resend.com.
    -   `RESEND_FROM_EMAIL`: Email gửi đi (phải được verify trên Resend).
    -   `FEEDBACK_RECIPIENT_EMAIL`: Email nhận thông báo góp ý.
    -   `VITE_ADMIN_EMAIL`: Email có quyền truy cập trang Admin.
    -   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`: Project Supabase (client).
3.  **Cấu hình Frontend (Client-side):** Các biến có tiền tố `VITE_` sẽ được nhúng vào mã nguồn khi build.
4.  **Tự động triển khai:** Vercel sẽ tự động nhận diện thư mục `/api` và triển khai chúng dưới dạng Serverless Functions dựa trên cấu hình trong `vercel.json`.

## 2. Cấu hình Supabase (Bắt buộc)

Ứng dụng dùng **Supabase** cho xác thực (OAuth Google), cơ sở dữ liệu PostgreSQL và Storage (bucket file CV).

### Các bước thực hiện:

1.  **Tạo project Supabase:** Truy cập [Supabase Dashboard](https://supabase.com/dashboard).
2.  **Authentication:** Bật nhà cung cấp **Google**. Trong URL Redirect / Site URL, thêm domain production (ví dụ `https://cv.thanhnghiep.top`) và URL preview của Vercel (`https://*.vercel.app`) cùng `http://localhost:5173` (hoặc cổng dev bạn dùng).
3.  **Database:** Áp dụng migration mẫu trong `supabase/migrations/` (khuyến nghị: Supabase CLI `supabase db push`, hoặc chạy lần lượt trong SQL Editor). File `20260516120000_cv_matcher_core_schema.sql` tạo `profiles`, `history` (kèm cột **`parsed_cv` kiểu `jsonb`**), `saved_jds`, RPC `increment_usage_count`, RLS và bucket Storage **`cv-files`**. Nếu bạn đã có bảng `history` cũ, chạy thêm `20260516120100_history_add_parsed_cv.sql`.
4.  **Storage:** Migration đã tạo bucket **`cv-files`** (public đọc; authenticated được upload/xóa). Đổi tên bucket chỉ khi bạn chỉnh `src/services/storageService.ts`.
5.  **Biến môi trường:** Trên Vercel và trong `.env` local, thiết lập ít nhất `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY`. Với tác vụ server-side hoặc migration, dùng `SUPABASE_SERVICE_ROLE_KEY` (không đưa vào frontend).

### Edge Functions (tùy chọn)

Thư mục `supabase/functions/` có thể triển khai qua Supabase CLI khi bạn dùng `supabase.functions.invoke(...)` từ client — không còn phụ thuộc Firebase Functions.

## 3. Chế độ Phát triển (Local Development)

- **`npm run dev`:** Chỉ Vite (frontend); gọi API production hoặc `vercel dev` nếu cần `/api/*`.
- **`npm start`:** Express (`server.ts`) + Vite middleware — PDF extraction dùng **`POST /api/extract-pdf/extract`** (khác Vercel: **`POST /api/extract-pdf`**).

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
| **Client (`VITE_*`)** | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_RECAPTCHA_SITE_KEY` | Được nhúng vào bundle build — chỉ dùng khóa **public** |
| **Server / Vercel** | `GEMINI_API_KEY`, `RECAPTCHA_SECRET_KEY`, `RESEND_API_KEY` | Cấu hình trên Vercel Dashboard hoặc `.env` local (không commit) |
| **Server-only** | `SUPABASE_SERVICE_ROLE_KEY` | Migration, script admin — **không** thêm tiền tố `VITE_` |

Sao chép `.env.example` → `.env` khi dev local. Chỉ `.env.example` được theo dõi trên Git.

### `.gitignore` (không đưa lên Git)

- `.env*`, trừ `!.env.example`
- `supabase/.temp/` — cache Supabase CLI (project ref, pooler URL, …)
- `.vercel/` — liên kết project local
- Khóa & credential: `*.pem`, `*.p12`, `id_rsa*`, `credentials.json`, `service-account*.json`
- Backup local có thể chứa PII: `users_backup.json`, `*-backup.json`
- **`graphify-out/cache/`** — cache AST của [Graphify](https://github.com/) (tái tạo bằng `graphify update .`). Có thể commit `graphify-out/GRAPH_REPORT.md`, `graph.json`, `graph.html` nếu team muốn chia sẻ báo cáo; **không** commit thư mục `cache/` (nhiều file JSON, thay đổi theo máy).

Nếu đã commit nhầm secret: xoá khỏi lịch sử Git, **rotate** key trên Google / Supabase / Resend / Vercel, rồi cập nhật biến môi trường mới.

### Supabase CLI

Sau `supabase link`, thư mục `supabase/.temp/` được tạo tự động — **không** add vào repo. Migrations trong `supabase/migrations/` vẫn được commit bình thường.
