# Danh sách API Endpoints (CV Compare)

> **Routing matrix (Vercel vs Express vs Edge):** [9_api_routes.md](./9_api_routes.md)

Dưới đây là các API và dịch vụ chính. **Đường dẫn proxy có thể khác nhau** giữa **Express local** (`npm start`) và **Vercel** (`api/*.ts`).

## 1. Internal API (Backend Proxy)

Tiền tố `/api`. Trên Vercel, rewrite trong `vercel.json` trỏ tới các file trong `api/`.

### `GET /api/config`

- **Mục đích:** Cấu hình công khai cho frontend.
- **Response:** `{ GEMINI_API_KEY: string }` (và các khóa public khác nếu được thêm trong `server/routes/config.ts` / `api/config.ts`).

### Trích xuất PDF (hai biến thể)

| Môi trường | Method & path | File |
|------------|----------------|------|
| **Vercel** | `POST /api/extract-pdf` | `api/extract-pdf.ts` |
| **Express** | `POST /api/extract-pdf/extract` | `server/routes/pdf.ts` |

- **Body:** `{ base64Data: string }`
- **Response:** `{ text: string }`

### Xác thực reCAPTCHA

| Môi trường | Method & path |
|------------|----------------|
| **Vercel** | `POST /api/verify-recaptcha` |
| **Express** | `POST /api/verify-recaptcha/verify` |

- **Body:** `{ token: string }`
- **Ghi chú:** Localhost thường được bypass (xem code route).

### Thanh toán PayOS

| Môi trường | Method & path | File |
|------------|----------------|------|
| **Vercel** | `POST /api/payment/create` | `api/payment/create.ts` |
| **Express** | `POST /api/payment/create` | `server/routes/payment.ts` → shared `api/payment/lib/handlers.ts` |
| **Vercel** | `POST /api/payment/webhook` | `api/payment/webhook.ts` |
| **Express** | `POST /api/payment/webhook` | `server/routes/payment.ts` → shared `api/payment/lib/handlers.ts` |

- **`POST /api/payment/create`** — Tạo link thanh toán PayOS. Body (do PayOS sinh): `{ orderCode, amount, description, items, returnUrl, cancelUrl }`. Response: `{ checkoutUrl: string }`.
- **`POST /api/payment/webhook`** — PayOS gọi callback khi có kết quả thanh toán. Xác thực HMAC-SHA256, gọi RPC `activate_pro_plan` nếu thành công.
- **Yêu cầu:** `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_URL`.

### `POST /api/send-feedback`

- **Mục đích:** Gửi phản hồi qua email (Resend).
- **Body:** `{ token, rating, title, content, userEmail, ... }` (theo handler).
- **Yêu cầu:** Xác thực reCAPTCHA phía backend trước khi gửi.

### `POST /api/send-welcome-email`

- **Mục đích:** Email chào mừng (Resend + reCAPTCHA tùy cấu hình).

### Edge Function (tùy chọn — Supabase)

- **`extract-pdf`:** Edge function không còn được gọi trực tiếp từ frontend cho JD. PDF extraction hiện dùng backend API `/api/extract-pdf` (Vercel) hoặc `/api/extract-pdf/extract` (Express). File source: `supabase/functions/extract-pdf/` giữ lại để dùng trong tương lai.

## 2. Dịch vụ lưu trữ & xác thực (Supabase)

Frontend dùng `src/lib/supabase.ts` (REST / Auth / Storage).

- **Auth:** OAuth Google qua Supabase Auth (JWT).
- **PostgreSQL:** `profiles`, `history` (JSON kết quả, có `parsed_cv`), `saved_jds`, **`app_settings`** (cấu hình runtime, ví dụ `default_monthly_analytics_limit`).
- **Storage:** Bucket `cv-files` (Supabase Storage; no dedicated TypeScript module; uploads not wired in current UI).

### RPC & quota phân tích (client gọi qua `supabase.rpc`)

| RPC | Gọi từ | Mô tả |
|-----|---------|--------|
| `check_analytics_quota(p_user_id, p_additional?)` | `analyticsQuotaService.ts` | Kiểm tra còn quota trước batch analyze; trả `allowed`, `used`, `limit`. |
| `increment_usage_count(user_id)` | Service sau analyze thành công | Tăng `usage_count`; enforce limit server-side. |
| `get_default_monthly_analytics_limit()` | (SQL nội bộ / có thể gọi từ client) | Đọc default từ `app_settings`. |

Chi tiết semantics, Admin UI, migration: [8_analytics.md](8_analytics.md).