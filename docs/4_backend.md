# Kiến trúc Backend (Modular Express Server)

Hệ thống sử dụng **Express** module hoá (`server/routes/`) khi chạy **`npm start`**. Trên **Vercel**, các endpoint tương ứng triển khai dưới dạng Serverless trong `api/*.ts` (rewrite trong `vercel.json`) — đường dẫn chi tiết có thể khác một chút (ví dụ PDF / reCAPTCHA).

## Cấu trúc & Runtime
-   **Entry Point:** `server.ts` (Tích hợp Vite Middleware trong môi trường Dev).
-   **Route Handlers:** `server/routes/*.ts` (Ví dụ: `config.ts`, `pdf.ts`, `feedback.ts`).
-   **Runtime:** Node.js 20.x+.
-   **Ngôn ngữ:** TypeScript.
-   **CI/CD:** GitHub Actions (`.github/workflows/ci.yml`) — lint → test → build trên mỗi push/PR lên `main`.

## Các chức năng chính (Routes)

> **API path đã được thống nhất (2026-05):** Express và Vercel giờ dùng cùng path gốc (e.g., `POST /api/extract-pdf`, `POST /api/verify-recaptcha`). Frontend không còn phân biệt `isLocal` để chọn path suffix khác nhau. Xem [9_api_routes.md](9_api_routes.md) để có ma trận đầy đủ.

### 1. Cấu hình (`/api/config`)
-   **File:** `server/routes/config.ts`
-   Cung cấp các API Key công khai cho Frontend.
-   **Endpoint:** `GET /api/config`.

### 2. Trích xuất PDF

-   **Express (`npm start`, `server.ts`):** `server/routes/pdf.ts` mount tại `/api/extract-pdf`, route **`POST /api/extract-pdf`** (unified path, không còn suffix `/extract`) — body `{ base64Data: string }`, response `{ text: string }`.
-   **Vercel Serverless:** **`POST /api/extract-pdf`** (file `api/extract-pdf.ts`) — cùng body/response.

### 3. Phân tích CV với Gemini AI

-   **Express:** **`POST /api/analyze`** (`server/routes/analyze.ts`).
-   **Vercel:** **`POST /api/analyze`** (`api/analyze.ts`) — timeout 60s.
-   **Logic:** `_server-lib/ai/analysisService.ts` (dùng `_server-lib/ai/geminiClient.ts` với `process.env.GEMINI_API_KEY`).

**Flow server-side:**
1. Verify Bearer token → lấy `userId` (optional — anonymous vẫn được phép)
2. reCAPTCHA verify (bỏ qua nếu authenticated hoặc localhost)
3. `check_analytics_quota` RPC (nếu authenticated)
4. Gọi Gemini API → trả `AnalysisResult` JSON
5. `increment_usage_count` RPC (fire-and-forget)

**Lý do chuyển Gemini lên server:** `VITE_GEMINI_API_KEY` trước đây bị bundle vào client JS — bất kỳ ai mở DevTools đều lấy được key. Sau SEC-4, chỉ `process.env.GEMINI_API_KEY` trên server được dùng; frontend chỉ gọi `/api/analyze`.

**PDF handling:** Frontend dùng `unpdf` (client-side) để extract text từ PDF trước khi gửi — tránh vượt giới hạn body 4.5MB của Vercel. Image (≤ 2MB) vẫn gửi dạng base64 để Gemini xử lý multimodal.

### 4. Xác thực reCAPTCHA

-   **Express:** **`POST /api/verify-recaptcha`** (`server/routes/recaptcha.ts`) — unified path, không còn suffix `/verify`.
-   **Vercel:** **`POST /api/verify-recaptcha`** (`api/verify-recaptcha.ts`).

Tự động bypass trên localhost để thuận tiện phát triển.

**Sử dụng:** (1) `AuthContext.tsx` — verify trước `signInWithEmail()` / `signUpWithEmail()`. (2) `/api/analyze` — verify inline trong endpoint cho anonymous users (không cần gọi `/api/verify-recaptcha` riêng từ analyze flow nữa).

### 5. Thanh toán PayOS (`/api/payment/create` & `/api/payment/webhook`)

-   **Files:** `server/routes/payment.ts` (Express), `api/payment/` (Vercel serverless), shared logic trong `api/payment/lib/`.
-   Dùng **shared handlers** (`api/payment/lib/handlers.ts`) cho cả Express và Vercel — logic đồng nhất.
-   **`POST /api/payment/create`:**
    -   Xác thực Bearer token (Supabase session).
    -   Gọi PayOS API tạo link thanh toán (HMAC-SHA256 signed).
    -   Ghi bản ghi `payments` (status = `pending`) vào Supabase.
    -   Trả về `{ checkoutUrl }` → frontend redirect.
-   **`POST /api/payment/webhook`:**
    -   Xác thực chữ ký PayOS qua `verifyWebhookPayload()` (sorted-key object signing).
    -   Tra cứu payment theo `orderCode`.
    -   Gọi RPC `activate_pro_plan` -> cập nhật `profiles.plan = 'pro'`, cập nhật `payments.status = 'paid'`.
    -   Idempotent: đã `paid` thì bỏ qua.

### 7. Hệ thống Email (Resend)

Hệ thống gởi 3 loại email qua dịch vụ **Resend**:

| Email | Trigger | Endpoint | reCAPTCHA |
|-------|---------|----------|-----------|
| **Welcome** | User mới đăng ký (Google OAuth hoặc email) | `POST /api/send-welcome-email` | Tuỳ chọn — nếu có token thì verify, không có thì bỏ qua (welcome từ auth event, không phải form public) |
| **Feedback** | User đánh giá kết quả phân tích | `POST /api/send-feedback` | Bắt buộc (score ≥ 0.5) |
| **VIP Upgrade** | Thanh toán PayOS thành công (webhook/confirm) | Server-side (gọi trực tiếp từ `api/payment/lib/`) | Không (server-side, non-blocking) |

- **Files Vercel:** `api/send-feedback.ts`, `api/send-welcome-email.ts`, `api/payment/lib/vipUpgradeEmail.ts`
- **Files Express:** `server/routes/feedback.ts`, `server/routes/welcomeEmail.ts`
- **VIP Upgrade Email:** Tự động phân biệt Pro vs Recruiter — hiển thị danh sách quyền lợi khác nhau (Pro: 5 CV batch, 10 saved CV; Recruiter: 50 CV batch, 50 saved CV, 10 campaigns).
- **Rate limiting:** Express áp dụng `emailLimiter` (5 req/h) cho feedback & welcome.

## Supabase Database Schema

Các bảng chính trong PostgreSQL (Supabase):

| Table | Mô tả |
|-------|-------|
| `profiles` | Hồ sơ người dùng (plan, usage_count, role...) |
| `history` | Lịch sử phân tích (kết quả JSON, parsed_cv) |
| `saved_jds` | Kho JD đã lưu (Free: 3, Pro: không giới hạn) |
| `saved_cvs` | **Kho CV đã lưu** (Free: 1, Pro: 10) — metadata file CV đã upload lên Storage |
| `payments` | Bản ghi thanh toán PayOS |
| `app_settings` | Cấu hình runtime (default_monthly_analytics_limit...) |

Storage bucket: `cv-files` — dùng cho upload CV (kho CV) và lưu file phân tích.

## Biến môi trường (Environment Variables)

Cần cấu hình các biến sau trong file `.env` hoặc hệ thống CI/CD:

```env
GEMINI_API_KEY=          # Google Gemini API Key (server-only — KHÔNG dùng prefix VITE_, không expose ra client)
RECAPTCHA_SECRET_KEY=    # Google reCAPTCHA v3 Secret
RESEND_API_KEY=          # Resend Platform API Key
RESEND_FROM_EMAIL=       # Email gửi đi (ví dụ: noreply@cvfit.pro)
FEEDBACK_RECIPIENT_EMAIL= # Email nhận phản hồi admin

# PayOS (thanh toán Pro)
PAYOS_CLIENT_ID=         # PayOS Client ID
PAYOS_API_KEY=           # PayOS API Key
PAYOS_CHECKSUM_KEY=      # PayOS Checksum Key (HMAC-SHA256)
SUPABASE_SERVICE_ROLE_KEY= # Service role key (để webhook ghi DB)
APP_URL=                 # URL ứng dụng (vd: https://cvfit.pro)
```

## Security & Middleware
-   **CORS:** Cho phép request từ các domain được chỉ định.
-   **Body Parser:** Hỗ trợ `limit: '50mb'` để xử lý các file PDF lớn chứa hình ảnh.
-   **Dev Integration:** Trong môi trường development, server chạy song song với Vite qua `vite.middlewares`.
-   **Secrets:** Chỉ đọc từ biến môi trường (`.env` local, Vercel Dashboard production). Không hard-code API key trong mã nguồn. File `.env` và cache `supabase/.temp/` nằm trong `.gitignore` — mẫu biến tham khảo: `.env.example`.

## Supabase Auth Providers

-   **Google OAuth:** Provider mặc định, cấu hình trong Supabase Dashboard > Authentication > Providers > Google.
-   **Email/Password:** Cần bật trong Supabase Dashboard > Authentication > Providers > Email. Có thể tắt "Confirm email" để user đăng nhập ngay sau khi đăng ký. Email auth được bảo vệ bởi reCAPTCHA v3 ở phía frontend (verify qua `/api/verify-recaptcha` trước khi gọi Supabase `signInWithPassword` / `signUp`).
