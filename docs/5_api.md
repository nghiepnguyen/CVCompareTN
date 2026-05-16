# Danh sách API Endpoints (CV Compare)

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

### `POST /api/send-feedback`

- **Mục đích:** Gửi phản hồi qua email (Resend).
- **Body:** `{ token, rating, title, content, userEmail, ... }` (theo handler).
- **Yêu cầu:** Xác thực reCAPTCHA phía backend trước khi gửi.

### `POST /api/send-welcome-email`

- **Mục đích:** Email chào mừng (Resend + reCAPTCHA tùy cấu hình).

### Edge Function (tùy chọn — Supabase)

- **`extract-pdf`:** Một số luồng (ví dụ JD) có thể gọi `supabase.functions.invoke('extract-pdf', …)` — xem `AnalysisInputView.tsx` và `supabase/functions/extract-pdf/`.

## 2. Dịch vụ lưu trữ & xác thực (Supabase)

Frontend dùng `src/lib/supabase.ts` (REST / Auth / Storage).

- **Auth:** OAuth Google qua Supabase Auth (JWT).
- **PostgreSQL:** `profiles`, `history` (JSON kết quả, có `parsed_cv`), `saved_jds`.
- **Storage:** Bucket `cv-files` (`storageService.ts`).

## 3. Google Gemini AI (`src/services/ai/`)

### `analyzeCV(jd, cvData, cvMimeType, cvName?, jdUrl?, language?)`

- Phân tích CV so với JD; PDF/ảnh gửi multimodal tới Gemini khi `cvMimeType` phù hợp.
- **Model:** Cấu hình trong `geminiProvider.ts` (ví dụ Gemini Flash preview).
- **Kết quả:** `AnalysisResult` — gồm `fullRewrittenCV` (chuỗi Markdown GFM theo prompt; client thêm `fullRewrittenCvMarkdown.ts` khi thiếu cấu trúc heading).

Các hàm trích xuất / OCR khác nằm trong `extractionService.ts` và module liên quan.
