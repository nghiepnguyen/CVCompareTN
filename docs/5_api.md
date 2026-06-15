# Danh sách API Endpoints (cvFit)

> **Routing matrix (Vercel vs Express vs Edge):** [9_api_routes.md](./9_api_routes.md)
>
> **Path đã được thống nhất (2026-05):** Express và Vercel dùng cùng path gốc cho PDF và reCAPTCHA. Xem [4_backend.md](4_backend.md) để biết chi tiết.

Dưới đây là các API và dịch vụ chính. **Đường dẫn proxy có thể khác nhau** giữa **Express local** (`npm start`) và **Vercel** (`api/*.ts`).

## 1. Internal API (Backend Proxy)

Tiền tố `/api`. Trên Vercel, rewrite trong `vercel.json` trỏ tới các file trong `api/`.

### `GET /api/config`

- **Mục đích:** Cấu hình công khai cho frontend.
- **Response:** `{ VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_URL, SUPABASE_ANON_KEY }`.
- **Lưu ý:** `GEMINI_API_KEY` **không còn** trả về từ endpoint này (đã xóa sau SEC-4). Gemini chỉ chạy server-side qua `/api/analyze`.

### Phân tích CV (Gemini — server-side)

| Môi trường | Method & path | File |
|------------|----------------|------|
| **Vercel** | `POST /api/analyze` | `api/analyze.ts` |
| **Express** | `POST /api/analyze` | `server/routes/analyze.ts` |

- **Auth:** Bearer token (Supabase JWT) — optional. Nếu không có token, yêu cầu `recaptchaToken`.
- **Body:**
  ```json
  {
    "jd": "string (job description)",
    "cvData": "string (plain text hoặc base64 cho image)",
    "cvMimeType": "text/plain | image/jpeg | image/png | ...",
    "cvName": "string (optional)",
    "language": "vi | en (optional, default: vi)",
    "recaptchaToken": "string (optional, bắt buộc nếu anonymous)"
  }
  ```
- **Response:** `AnalysisResult` JSON (matchScore, categoryScores, matchingPoints, missingGaps, rewriteSuggestions, fullRewrittenCV, parsedCV, ...).
- **Server-side flow:** xác thực reCAPTCHA (nếu anonymous) → kiểm tra quota → gọi Gemini (`_server-lib/ai/analysisService.ts`) → `increment_usage_count` (fire-and-forget).
- **Timeout:** 60s (Vercel function).
- **Rate limit:** 10 req/15 min (strictLimiter).
- **Lưu ý PDF:** Frontend extract text bằng `unpdf` (client-side) trước khi gửi — không gửi base64 PDF lên backend (tránh vượt giới hạn 4.5MB của Vercel).

### Trích xuất PDF (path thống nhất)

| Môi trường | Method & path | File |
|------------|----------------|------|
| **Vercel** | `POST /api/extract-pdf` | `api/extract-pdf.ts` |
| **Express** | `POST /api/extract-pdf` | `server/routes/pdf.ts` |

- **Auth (2026-06):** Bearer token (Supabase JWT) hoặc `recaptchaToken` trong body — bắt buộc. Anonymous request không có token sẽ nhận `401`.
- **Body:** `{ base64Data: string, recaptchaToken?: string }`
- **Response:** `{ text: string }`
- **Dùng cho:** Trích xuất text từ PDF JD (Job Description) upload trong `AnalysisInputView`. CV PDF dùng `unpdf` client-side, không qua endpoint này.

### Xác thực reCAPTCHA (path thống nhất)

| Môi trường | Method & path |
|------------|----------------|
| **Vercel** | `POST /api/verify-recaptcha` |
| **Express** | `POST /api/verify-recaptcha` |

- **Body:** `{ token: string }`
- **Ghi chú:** Localhost thường được bypass (xem code route).

### Thanh toán PayOS

| Môi trường | Method & path | File |
|------------|----------------|------|
| **Vercel** | `POST /api/payment/{create\|webhook\|confirm}` | `api/payment.ts` (unified, dispatch theo URL segment) |
| **Express** | `POST /api/payment/{create\|webhook\|confirm}` | `server/routes/payment.ts` → shared `_server-lib/payment/handlers.ts` |

- **`POST /api/payment/create`** — Tạo link thanh toán PayOS. Auth: Bearer (Supabase JWT). Body: `{ planType?: "pro" | "recruiter" }`. Response: `{ checkoutUrl: string, orderCode: number }`.
- **`POST /api/payment/webhook`** — PayOS callback khi có kết quả thanh toán. Xác thực hai lớp:
  1. **HMAC-SHA256** (`verifyWebhookPayload`) — sorted-key object signing trên `data`.
  2. **Timestamp freshness** (`isWebhookTimestampFresh`) — `data.transactionDateTime` phải trong cửa sổ ±30 phút. Webhook cũ bị replay → HTTP 400.
  - Gọi RPC `activate_pro_plan` nếu thành công; idempotent (đã `paid` → bỏ qua).
- **`POST /api/payment/confirm`** — Fallback khi webhook bị delay. Auth: Bearer. Body: `{ orderCode: number }`. Tự verify trạng thái qua PayOS API, sau đó activate nếu đã thanh toán.
- **Yêu cầu:** `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_URL`.

### Hệ thống Email (Resend)

#### `POST /api/send-welcome-email`

- **Mục đích:** Gởi email chào mừng khi user mới đăng ký (Google OAuth hoặc email signup).
- **Body:** `{ token, userEmail, userName }`
- **reCAPTCHA:** Tuỳ chọn — nếu `token` có thì verify (score ≥ 0.2), nếu không (Google OAuth redirect, reCAPTCHA chưa kịp load) thì bỏ qua. Welcome email được trigger từ auth event, không phải form public.

#### `POST /api/send-feedback`

- **Mục đích:** Gởi phản hồi của user về admin qua email (Resend).
- **Body:** `{ token, rating, title, content, userEmail }`
- **reCAPTCHA:** Bắt buộc (score ≥ 0.5) — feedback từ UI action, reCAPTCHA đã load sẵn.

#### VIP Upgrade Email (server-side)

- **Mục đích:** Gởi email chúc mừng + quyền lợi khi user nâng cấp Pro/Recruiter thành công.
- **Trigger:** Thanh toán PayOS thành công (webhook hoặc client confirm).
- **File:** `_server-lib/payment/vipUpgradeEmail.ts` — gọi trực tiếp từ `_server-lib/payment/handlers.ts` (non-blocking, fire-and-forget).
- **Phân biệt plan:** Tự động nhận diện Pro vs Recruiter, hiển thị danh sách quyền lợi tương ứng (Pro: 5 CV batch, 10 saved CV; Recruiter: 50 CV batch, 50 saved CV, 10 campaigns).

### Edge Function (tùy chọn — Supabase)

- **`extract-pdf`:** Edge function không còn được gọi trực tiếp từ frontend cho JD. PDF extraction hiện dùng backend API thống nhất `POST /api/extract-pdf` (Vercel hoặc Express — cùng path). File source: `supabase/functions/extract-pdf/` giữ lại để dùng trong tương lai.

## 2. Dịch vụ lưu trữ & xác thực (Supabase)

Frontend dùng `src/lib/supabase.ts` (REST / Auth / Storage).

- **Auth:** OAuth Google qua Supabase Auth (JWT).
- **PostgreSQL:** `profiles`, `history` (JSON kết quả, có `parsed_cv`), `saved_jds`, `saved_cvs` (kho CV: metadata file CV đã upload), **`app_settings`** (cấu hình runtime, ví dụ `default_monthly_analytics_limit`).
- **Storage:** Bucket `cv-files` (Supabase Storage) — được dùng bởi `cvService.ts` để upload/download/delete CV trong tính năng **Kho CV** (Free: 1 CV, Pro: 10 CV).

### RPC & quota phân tích (client gọi qua `supabase.rpc`)

| RPC | Gọi từ | Mô tả |
|-----|---------|--------|
| `check_analytics_quota(p_user_id, p_additional?)` | `analyticsQuotaService.ts` (client, UX) + `api/analyze.ts` (server, enforce) | Kiểm tra còn quota trước batch analyze; trả `allowed`, `used`, `limit`. |
| `increment_usage_count(user_id)` | `api/analyze.ts` / `server/routes/analyze.ts` (server-side, fire-and-forget) | Tăng `usage_count` sau mỗi lần phân tích thành công. **Không còn gọi từ client.** |
| `get_default_monthly_analytics_limit()` | (SQL nội bộ / có thể gọi từ client) | Đọc default từ `app_settings`. |

Chi tiết semantics, Admin UI, migration: [8_analytics.md](8_analytics.md).