# Kiến trúc Backend (Modular Express Server)

Hệ thống sử dụng **Express** module hoá (`server/routes/`) khi chạy **`npm start`**. Trên **Vercel**, các endpoint tương ứng triển khai dưới dạng Serverless trong `api/*.ts` (rewrite trong `vercel.json`). **Cả hai đều dùng cùng path và cùng logic** — toàn bộ business logic nằm trong `_server-lib/`, các route handler chỉ là thin wrappers unpack HTTP request/response.

## Cấu trúc & Runtime
-   **Entry Point:** `server.ts` (Tích hợp Vite Middleware trong môi trường Dev).
-   **Route Handlers:** `server/routes/*.ts` (thin wrappers — Express) và `api/*.ts` (thin wrappers — Vercel).
-   **Shared Business Logic:** `_server-lib/` — mọi logic quan trọng nằm tại đây, dùng chung cho cả hai runtime.
-   **Runtime:** Node.js 20.x+.
-   **Ngôn ngữ:** TypeScript.
-   **CI/CD:** GitHub Actions (`.github/workflows/ci.yml`) — lint → test → build trên mỗi push/PR lên `main`.

## Kiến trúc Thin Handler (Shared Core)

Pattern này (áp dụng từ 2026-06) đảm bảo Express và Vercel **không bao giờ drift** về logic:

```
Express handler → _server-lib/module/handler.ts → _server-lib/services
Vercel handler  → _server-lib/module/handler.ts → _server-lib/services
```

| Module | Shared handler | Mô tả |
|--------|---------------|--------|
| Analyze | `_server-lib/analyze/handler.ts` | `handleAnalyze()` — auth, reCAPTCHA, quota, Gemini call |
| PDF | `_server-lib/pdf/handler.ts` | `handleExtractPdf()` — auth, reCAPTCHA, PDF validation |
| Email | `_server-lib/email/handlers.ts` | `handleSendFeedback()`, `handleSendWelcomeEmail()` |
| Payment | `_server-lib/payment/handlers.ts` | `handlePaymentCreate/Webhook/Confirm()` |
| reCAPTCHA | `_server-lib/recaptcha.ts` | `verifyRecaptcha(token, threshold?)` — shared utility |
| CV rewrite (nền) | `_server-lib/rewriteCv/handler.ts` | `handleRewriteCv()` — auth, reCAPTCHA, wall-clock budget, gọi `_server-lib/ai/rewriteService.ts` |
| CV parse (nền) | `_server-lib/parseCv/handler.ts` | `handleParseCv()` — auth, reCAPTCHA, wall-clock budget, gọi `_server-lib/ai/parseCvService.ts` |
| Timeout | `_server-lib/withTimeout.ts` | `withTimeout(promise, ms, label)` — race một promise với `setTimeout`, dùng bởi analyze/rewriteCv/parseCv handler để bound từng bước (auth, reCAPTCHA, quota) |

## Các chức năng chính (Routes)

> **API path đã được thống nhất (2026-05):** Express và Vercel giờ dùng cùng path gốc (e.g., `POST /api/extract-pdf`, `POST /api/verify-recaptcha`). Frontend không còn phân biệt `isLocal` để chọn path suffix khác nhau. Xem [9_api_routes.md](9_api_routes.md) để có ma trận đầy đủ.

### 1. Cấu hình (`/api/config`)
-   **File:** `server/routes/config.ts`
-   Cung cấp các API Key công khai cho Frontend.
-   **Endpoint:** `GET /api/config`.

### 2. Trích xuất PDF

-   **Express:** `server/routes/pdf.ts` → **`POST /api/extract-pdf`** — body `{ base64Data: string, recaptchaToken?: string }`, response `{ text: string }`. **Auth bắt buộc** (Bearer token hoặc reCAPTCHA).
-   **Vercel:** `api/extract-pdf.ts` → **`POST /api/extract-pdf`** — cùng body/response/auth.
-   **Shared logic:** `_server-lib/pdf/handler.ts` (`handleExtractPdf()`).

### 3. Phân tích CV với Gemini AI

Gemini được gọi qua **3 endpoint** thay vì một call gộp hết (từ 2026-07) — Vercel Hobby plan khoá cứng `maxDuration: 60s` (không nới được), nên một prompt yêu cầu Gemini trả quá nhiều field trong một lần dễ vượt trần và bị Vercel hard-kill giữa chừng (504 không có JSON body, không phải lỗi app tự trả). Chi tiết đầy đủ từng endpoint: [5_api.md](5_api.md).

-   **`POST /api/analyze`** (chính, đồng bộ) — Express: `server/routes/analyze.ts`; Vercel: `api/analyze.ts` (60s timeout). Shared handler: `_server-lib/analyze/handler.ts` → `_server-lib/ai/analysisService.ts` (dùng `_server-lib/ai/geminiClient.ts` với `process.env.GEMINI_API_KEY`). Trả điểm số/so sánh/gợi ý viết lại — **không** trả `fullRewrittenCV`/`parsedCV` đầy đủ (luôn `''`/`undefined`).
-   **`POST /api/rewrite-cv`** (nền, tạo `fullRewrittenCV`) — Express: `server/routes/rewriteCv.ts`; Vercel: `api/rewrite-cv.ts` (60s timeout). Shared handler: `_server-lib/rewriteCv/handler.ts` → `_server-lib/ai/rewriteService.ts`.
-   **`POST /api/parse-cv`** (nền, tạo `parsedCV`) — Express: `server/routes/parseCv.ts`; Vercel: `api/parse-cv.ts` (60s timeout). Shared handler: `_server-lib/parseCv/handler.ts` → `_server-lib/ai/parseCvService.ts`.

**Flow server-side (`/api/analyze`):**

1. Verify Bearer token → lấy `userId`, timeout 4s. **Bắt buộc** (2026-07: đã bỏ nhánh anonymous/reCAPTCHA — không có token hợp lệ trả `401` ngay lập tức). UI cũng chặn hoàn toàn phân tích khi chưa đăng nhập (`DashboardView.tsx`), nên nhánh anonymous trước đây chỉ chạm được qua gọi API trực tiếp, không có quota/rate-limit trên Vercel — coi là lỗ hổng, đã đóng.
2. Tra plan hiệu lực từ `profiles` (`plan`/`plan_expires_at`/`role`, timeout 4s) và validate `batchTotal` (số CV trong batch, client gửi lên từ `analyzeCV(..., batchTotal)`) so với `MAX_BATCH_BY_PLAN` (`src/lib/planLimits.ts`) — vượt hạn mức → `400`. Đây là defense-in-depth: UI (`AnalysisRunContext.handleAnalyze`) đã chặn theo `MAX_BATCH_BY_PLAN` trước khi gọi, bước này chặn caller gọi trực tiếp API. Fail-open nếu lookup plan lỗi/timeout.
3. `check_analytics_quota` RPC, timeout 5s — lỗi/timeout thì fail-open (coi như allowed)
4. Gọi Gemini API → trả `AnalysisResult` JSON (không có `fullRewrittenCV`/`parsedCV` đầy đủ)
5. `increment_usage_count` RPC (fire-and-forget)
6. **Frontend** — khi phân tích nhiều CV, các request `/api/analyze` chạy **song song qua worker pool cố định 5** (`AnalysisRunContext.handleAnalyze`, `CONCURRENCY = 5`), không còn lặp tuần tự từng file; ngay sau khi có kết quả mỗi CV, gọi song song `/api/rewrite-cv` và `/api/parse-cv` trong nền (`generateFullCV` / `generateParsedCVForResult`) để fill `fullRewrittenCV` và `parsedCV`; `FullCVTab`/`ParsedCVTab` hiện spinner cho tới khi xong.

**Timeout — mô hình wall-clock budget:** cả 3 endpoint tính một **deadline duy nhất 50s** kể từ đầu request (thay vì cộng timeout độc lập từng bước, vốn dễ vượt trần nếu mỗi bước chạy gần mức max) — ngân sách còn lại sau auth/quota được truyền thẳng cho lệnh gọi Gemini. Nếu ngân sách còn lại quá thấp (<10s) trước khi gọi Gemini, server trả `504` JSON hợp lệ ngay (`retryable: true`) thay vì cố gọi và bị Vercel giết giữa chừng không JSON body. Utility dùng chung: `_server-lib/withTimeout.ts`.

**Lý do chuyển Gemini lên server:** `VITE_GEMINI_API_KEY` trước đây bị bundle vào client JS — bất kỳ ai mở DevTools đều lấy được key. Sau SEC-4, chỉ `process.env.GEMINI_API_KEY` trên server được dùng; frontend chỉ gọi `/api/analyze` (+ `/api/rewrite-cv`, `/api/parse-cv`).

**PDF handling (cập nhật 2026-07):** Client (`useFileProcessor.ts`) extract text bằng `unpdf` TRƯỚC khi gửi, và gửi kèm cả file gốc (không chỉ text) để Gemini VỪA đọc nội dung chính xác từ text VỪA quan sát layout thật (bảng, nhiều cột, header/footer...) để chấm `formatAssessment`. File gốc ≤ `MAX_INLINE_BINARY_SIZE` (2MB) → base64 inline (`cvPdfInlineData`) như cũ; 2–15MB (`MAX_STORAGE_UPLOAD_SIZE`) → client upload thẳng lên Storage bucket `cv-analyze-tmp` (`uploadTempAnalysisFile`, path `{uid}/{uuid}-{filename}`) và chỉ gửi path (`cvPdfStoragePath`/`cvDataStoragePath`) trong body — né hẳn giới hạn 4.5MB body của Vercel thay vì chỉ né bằng cách giới hạn size upload. Server (3 handler `analyze`/`parseCv`/`rewriteCv`) resolve path này qua `_server-lib/storage/tempFile.ts::resolveStorageRef()` (service-role client tải file + tự check prefix path đúng `userId` — chặn 1 user đọc file tạm của user khác vì service-role bypass RLS) thành base64 rồi truyền y hệt như base64 inline cũ; `analysisService.ts`/`parseCvService.ts`/`rewriteService.ts` không đổi gì. File tạm được **client** xoá (`cleanupTempAnalysisFiles`) sau khi `analyze` + 2 lệnh gọi nền `rewrite`/`parse-cv` đều xong (Promise.allSettled) — không cleanup ngay trong từng handler vì 3 request dùng chung 1 path. PDF dạng scan/ảnh (không extract được text) và ảnh (`.jpg/.png/.webp`) theo cùng logic 2 bậc; chỉ hard-fail khi vượt 15MB.

### 4. Xác thực reCAPTCHA

Shared utility: **`_server-lib/recaptcha.ts`** — `verifyRecaptcha(token, threshold = 0.5)`.

-   Tự động bypass khi `NODE_ENV !== 'production'` (không dùng host header).
-   Missing secret key → trả `{ ok: false, status: 503 }`.
-   Score < threshold → `{ ok: false, status: 403 }`.

**Standalone endpoint (`POST /api/verify-recaptcha`):** Dùng bởi `AuthContext.tsx` trước `signInWithEmail()` / `signUpWithEmail()`.

**Inline verification:** `/api/extract-pdf` verify reCAPTCHA inline (cho anonymous users) qua `_server-lib/recaptcha.ts` — không gọi endpoint riêng. (`/api/analyze`, `/api/rewrite-cv`, `/api/parse-cv` không còn nhánh anonymous/reCAPTCHA từ 2026-07 — Bearer token bắt buộc.)

### 5. Thanh toán PayOS (`/api/payment/*`)

-   **Files:** Vercel serverless — `api/payment.ts` (unified handler, dispatch theo URL segment `/create` | `/webhook` | `/confirm`). Express — `server/routes/payment.ts`. Shared logic: `_server-lib/payment/handlers.ts`. PayOS utilities: `_server-lib/payment/payos.ts`. Supabase admin + JWT cache: `_server-lib/payment/supabaseAdmin.ts`.
-   **`POST /api/payment/create`:**
    -   Xác thực Bearer token (Supabase session) — dùng `getUserFromBearerToken()` với **in-memory cache 5 phút** để tránh gọi `admin.getUserById` trên mỗi request (xem `supabaseAdmin.ts`).
    -   Gọi PayOS API tạo link thanh toán (HMAC-SHA256 signed).
    -   Ghi bản ghi `payments` (status = `pending`) vào Supabase.
    -   Trả về `{ checkoutUrl }` → frontend redirect.
-   **`POST /api/payment/webhook`:**
    -   Xác thực chữ ký PayOS qua `verifyWebhookPayload()` (sorted-key object signing, HMAC-SHA256).
    -   **Replay-attack protection:** sau khi verify chữ ký, kiểm tra `data.transactionDateTime` (format `YYYY-MM-DD HH:mm:ss`, UTC+7) phải nằm trong cửa sổ ±30 phút so với thời điểm hiện tại (`isWebhookTimestampFresh()` trong `payos.ts`). Webhook cũ bị reject với HTTP 400.
    -   Tra cứu payment theo `orderCode`.
    -   Gọi RPC `activate_pro_plan` → cập nhật `profiles.plan`, `payments.status = 'paid'`.
    -   Idempotent: đã `paid` thì bỏ qua.

### 6. Hệ thống Email (Resend)

Hệ thống gởi 3 loại email qua dịch vụ **Resend**:

| Email | Trigger | Endpoint | reCAPTCHA |
|-------|---------|----------|-----------|
| **Welcome** | User mới đăng ký (Google OAuth hoặc email) | `POST /api/send-email` (`type: 'welcome'`) | Production: bắt buộc (score ≥ 0.5); dev: bypass |
| **Feedback** | User đánh giá kết quả phân tích | `POST /api/send-email` (`type: 'feedback'`) | Bắt buộc (score ≥ 0.5) |
| **VIP Upgrade** | Thanh toán PayOS thành công (webhook/confirm) | Server-side (gọi trực tiếp từ `_server-lib/payment/handlers.ts`) | Không (server-side, non-blocking) |

- **Files Vercel:** `api/send-email.ts` (unified dispatcher, type: 'feedback' | 'welcome')
- **Files Express:** `server/routes/feedback.ts`, `server/routes/welcomeEmail.ts` (thin wrappers)
- **Shared logic:** `_server-lib/email/handlers.ts` (`handleSendFeedback()`, `handleSendWelcomeEmail()`)
- **VIP Upgrade Email:** `_server-lib/payment/vipUpgradeEmail.ts` — phân biệt Pro vs Recruiter (Pro: 5 CV batch, 10 saved CV; Recruiter: 50 CV batch, 50 saved CV, 10 campaigns).
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
| `admin_audit_log` | **Audit trail bất biến** cho mọi admin action (thay đổi role, plan, permission, quota, xóa user). Ghi bởi `logAdminAction()` trong `userService.ts` (fire-and-forget). RLS: admin SELECT; authenticated INSERT chính mình. |
| `analysis_log` | Log mỗi lượt gọi `/api/analyze` (thành công/thất bại), dùng cho tab **Report** trong Admin. Ghi bởi `logAnalysisAttempt()` trong `_server-lib/analyze/handler.ts` (fire-and-forget, service role). RLS: chỉ admin SELECT; không có INSERT policy cho `authenticated`. Xem [8_analytics.md](8_analytics.md#admin-report-tab-thống-kê-lượt-phân-tích-theo-ngày). |

Storage bucket: `cv-files` (public=false, RLS scope theo folder `{userId}/...`) — kho CV vĩnh viễn (Free/Pro/Recruiter). `cv-analyze-tmp` (**2026-07**, migration `20260708000000_cv_analyze_tmp_bucket.sql`, `file_size_limit`=15MB) — file tạm 2–15MB trong luồng phân tích, INSERT/DELETE RLS scope theo `{userId}/...`, không có SELECT policy (server đọc qua service-role, bypass RLS — path ownership tự check ở `tempFile.ts`), client tự xoá sau khi dùng xong.

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
-   **Email/Password:** Cần bật trong Supabase Dashboard > Authentication > Providers > Email, "Confirm email" đang bật (user phải xác nhận email trước khi login). `signUpWithEmail()` / `signInWithEmail()` / `resetPasswordForEmail()` trong `AuthContext.tsx` gọi trực tiếp Supabase Auth, không qua reCAPTCHA.
-   **Custom SMTP:** Resend làm SMTP provider cho Supabase Auth (Project Settings > Auth > SMTP Settings, dashboard-only, không có trong repo). Sender email ở đây **độc lập** với `RESEND_FROM_EMAIL` (biến env chỉ dùng cho email tự app gởi — welcome/feedback/VIP). Đổi 1 trong 2 không tự đổi cái còn lại.
-   **Link xác nhận signup hết hạn (`otp_expired`):** Supabase redirect về app kèm lỗi ở **URL hash** (`#error=access_denied&error_code=otp_expired&...`), không phải query string. `AuthContext.tsx` parse cả `location.hash` và `location.search` khi mount, nếu gặp `otp_expired` sẽ tự mở `AuthModal` ở mode `resendConfirmation` + hiện toast báo lỗi. User có thể tự gửi lại link qua `resendConfirmationEmail()` (`supabase.auth.resend({type:'signup'})`), cooldown 60s chống spam-click (`AuthModal.tsx`). Màn hình "check email" sau signup cũng có link "Gửi lại" dùng cùng hàm này.
-   **2026-07 domain deliverability:** domain gởi `cvfit.pro` đã verify SPF + DKIM + DMARC (`p=none`) trên Resend/Cloudflare. Link verify signup vẫn dùng domain `*.supabase.co` (không match domain gởi) — Resend flag mismatch này nhưng không tự fix được ở free plan (cần Custom Auth Domain, chỉ có ở Supabase Pro). Nút resend ở trên là safety net cho case link hết hạn do delay delivery.
