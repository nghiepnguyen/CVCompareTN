# Kiến trúc Backend (Modular Express Server)

Hệ thống sử dụng **Express** module hoá (`server/routes/`) khi chạy **`npm start`**. Trên **Vercel**, các endpoint tương ứng triển khai dưới dạng Serverless trong `api/*.ts` (rewrite trong `vercel.json`) — đường dẫn chi tiết có thể khác một chút (ví dụ PDF / reCAPTCHA).

## Cấu trúc & Runtime
-   **Entry Point:** `server.ts` (Tích hợp Vite Middleware trong môi trường Dev).
-   **Route Handlers:** `server/routes/*.ts` (Ví dụ: `config.ts`, `pdf.ts`, `feedback.ts`).
-   **Runtime:** Node.js 20.x+.
-   **Ngôn ngữ:** TypeScript.

## Các chức năng chính (Routes)

### 1. Cấu hình (`/api/config`)
-   **File:** `server/routes/config.ts`
-   Cung cấp các API Key công khai cho Frontend.
-   **Endpoint:** `GET /api/config`.

### 2. Trích xuất PDF

-   **Express (`npm start`, `server.ts`):** `server/routes/pdf.ts` mount tại `/api/extract-pdf`, route thực tế **`POST /api/extract-pdf/extract`** — body `{ base64Data: string }`, response `{ text: string }`.
-   **Vercel Serverless:** **`POST /api/extract-pdf`** (file `api/extract-pdf.ts`) — cùng body/response, không có suffix `/extract`.

### 3. Xác thực reCAPTCHA

-   **Express:** **`POST /api/verify-recaptcha/verify`** (`server/routes/recaptcha.ts`).
-   **Vercel:** **`POST /api/verify-recaptcha`** (`api/verify-recaptcha.ts`).

Tự động bypass trên localhost để thuận tiện phát triển.

### 4. Hệ thống Email (`/api/send-feedback` & `/api/send-welcome-email`)
-   **Files:** `server/routes/feedback.ts`, `server/routes/welcomeEmail.ts`
-   Tích hợp với dịch vụ **Resend**.
-   Tự động xác thực reCAPTCHA trước khi gửi email để chống spam.

## Biến môi trường (Environment Variables)

Cần cấu hình các biến sau trong file `.env` hoặc hệ thống CI/CD:

```env
GEMINI_API_KEY=          # Google AI API Key
RECAPTCHA_SECRET_KEY=    # Google reCAPTCHA v3 Secret
RESEND_API_KEY=          # Resend Platform API Key
RESEND_FROM_EMAIL=       # Email gửi đi (ví dụ: noreply@thanhnghiep.top)
FEEDBACK_RECIPIENT_EMAIL= # Email nhận phản hồi admin
```

## Security & Middleware
-   **CORS:** Cho phép request từ các domain được chỉ định.
-   **Body Parser:** Hỗ trợ `limit: '50mb'` để xử lý các file PDF lớn chứa hình ảnh.
-   **Dev Integration:** Trong môi trường development, server chạy song song với Vite qua `vite.middlewares`.
-   **Secrets:** Chỉ đọc từ biến môi trường (`.env` local, Vercel Dashboard production). Không hard-code API key trong mã nguồn. File `.env` và cache `supabase/.temp/` nằm trong `.gitignore` — mẫu biến tham khảo: `.env.example`.
