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

Gemini được gọi qua **3 endpoint riêng biệt** (từ 2026-07) thay vì một call gộp hết — vì Vercel Hobby plan khoá cứng `maxDuration: 60s` và không thể nới, một prompt yêu cầu Gemini trả quá nhiều field (điểm số + gợi ý viết lại + trích xuất CV đầy đủ + CV viết lại hoàn chỉnh) trong một lần dễ vượt trần và bị Vercel hard-kill (504 không có JSON body). Giải pháp: `/api/analyze` chỉ trả kết quả chấm điểm/so sánh (cần hiển thị ngay); `fullRewrittenCV` và `parsedCV` được generate **sau, trong nền**, qua hai endpoint riêng.

#### `POST /api/analyze` — chính, đồng bộ

| Môi trường | Method & path | File |
|------------|----------------|------|
| **Vercel** | `POST /api/analyze` | `api/analyze.ts` (maxDuration 60s) |
| **Express** | `POST /api/analyze` | `server/routes/analyze.ts` |

- **Auth:** Bearer token (Supabase JWT) — optional. Nếu không có token, yêu cầu `recaptchaToken`.
- **Body:**
  ```json
  {
    "jd": "string (job description)",
    "cvData": "string (plain text hoặc base64 cho image/pdf)",
    "cvMimeType": "text/plain | application/pdf | image/jpeg | image/png | ...",
    "cvName": "string (optional)",
    "language": "vi | en (optional, default: vi)",
    "recaptchaToken": "string (optional, bắt buộc nếu anonymous)",
    "cvPdfInlineData": "string (optional, base64 PDF gốc ≤2MB — 2026-07, xem 'Lưu ý PDF' dưới)"
  }
  ```
- **Response:** `AnalysisResult` JSON — matchScore, categoryScores, matchingPoints, missingGaps, atsKeywords, rewriteSuggestions, detailedComparison (mỗi item có thêm `priority: 'required' | 'nice-to-have'`, 2026-07), `formatAssessment` (2026-07 — parseability score + checklist layout/format, xem dưới), successProbability/passProbability/passExplanation/mainFactor. `fullRewrittenCV` luôn là `''` và `parsedCV` luôn `undefined` trong response này — frontend fill hai field đó sau qua `/api/rewrite-cv` và `/api/parse-cv` (xem `generateFullCV`/`generateParsedCVForResult` trong `AnalysisRunContext.tsx`).
- **Server-side flow (`_server-lib/analyze/handler.ts`):** xác thực Bearer (timeout 4s) → nếu anonymous, verify reCAPTCHA (timeout 5s) → `check_analytics_quota` RPC (timeout 5s, fail-open nếu lỗi/timeout) → gọi Gemini (`_server-lib/ai/analysisService.ts`) → `increment_usage_count` (fire-and-forget).
- **Timeout — mô hình wall-clock budget (từ 2026-07):** thay vì cộng dồn timeout độc lập của từng bước (dễ vượt trần nếu mỗi bước chạy gần mức max của nó), handler tính một **deadline duy nhất 50s** kể từ dòng đầu tiên của request. Ngân sách còn lại sau auth/reCAPTCHA/quota được truyền thẳng cho lệnh gọi Gemini (`timeoutMs` param của `analyzeCV()`), đảm bảo tổng thời gian xử lý không bao giờ vượt 50s — chừa 10s buffer trước khi Vercel hard-kill ở 60s. Nếu ngân sách còn lại < 10s trước khi gọi Gemini, server trả `504` với JSON hợp lệ (`retryable: true`) ngay lập tức thay vì cố gọi và bị Vercel giết giữa chừng.
- **maxOutputTokens:** 16384.
- **Rate limit:** 10 req/15 min (strictLimiter).
- **Prompt (2026-07):** trước khi chấm điểm, model phân loại từng yêu cầu JD thành `required`/`nice-to-have`, áp thang điểm chuẩn hóa 6 mức cho `categoryScores`, và match `atsKeywords` theo kiểu literal string (không suy diễn ngữ nghĩa lỏng) để mô phỏng đúng cách một ATS thật đọc CV. Chi tiết: `src/services/ai/prompts.ts`.
- **Lưu ý PDF (cập nhật 2026-07):** Client (`useFileProcessor.ts`) extract text bằng `unpdf` TRƯỚC khi gửi — nếu file gốc ≤2MB, gửi kèm luôn `cvPdfInlineData` (base64) để Gemini vừa đọc text vừa "nhìn" layout thật (chấm `formatAssessment`). Server chỉ fallback base64-only (`inlineData`, multimodal OCR) khi extract thất bại hoặc PDF là ảnh scan — nhánh này không còn hard-fail phía client nếu file ≤2MB (trước đây throw lỗi). Xem [memory: Analyze timeout — PDF multimodal].

#### `POST /api/rewrite-cv` — nền, tạo `fullRewrittenCV`

| Môi trường | Method & path | File |
|------------|----------------|------|
| **Vercel** | `POST /api/rewrite-cv` | `api/rewrite-cv.ts` (maxDuration 60s) |
| **Express** | `POST /api/rewrite-cv` | `server/routes/rewriteCv.ts` |

- **Shared handler:** `_server-lib/rewriteCv/handler.ts` — `handleRewriteCv()` (giống pattern `handleAnalyze()`, dùng chung giữa Vercel và Express).
- **Auth/reCAPTCHA:** giống `/api/analyze` (Bearer optional, `recaptchaToken` bắt buộc nếu anonymous), mỗi bước có timeout riêng (auth 4s, reCAPTCHA 5s).
- **Body:** `{ jd, cvData, cvMimeType, language?, recaptchaToken? }` (không có `cvName`).
- **Response:** `{ fullRewrittenCV: string }` — Markdown GFM CV đã viết lại tối ưu ATS.
- **Timeout:** cùng mô hình wall-clock 50s như `/api/analyze` (`_server-lib/ai/rewriteService.ts`, `generateFullRewrite(jd, cvData, cvMimeType, language, timeoutMs)`).
- **Trigger:** gọi tự động, không chặn UI, ngay sau khi `/api/analyze` trả kết quả (`AnalysisRunContext.generateFullCV`). `FullCVTab` hiện spinner cho tới khi có kết quả.

#### `POST /api/parse-cv` — nền, tạo `parsedCV`

| Môi trường | Method & path | File |
|------------|----------------|------|
| **Vercel** | `POST /api/parse-cv` | `api/parse-cv.ts` (maxDuration 60s) |
| **Express** | `POST /api/parse-cv` | `server/routes/parseCv.ts` |

- **Shared handler:** `_server-lib/parseCv/handler.ts` — `handleParseCv()`.
- **Auth/reCAPTCHA/Timeout:** giống hệt `/api/rewrite-cv`.
- **Body:** `{ jd, cvData, cvMimeType, language?, recaptchaToken?, cvPdfInlineData? }` — vẫn cần `jd` để Gemini tính `ats_evaluation.relevant_score`/`missing_keywords` so với JD (không chỉ trích xuất CV đơn thuần). `cvPdfInlineData` (2026-07, optional, base64 PDF gốc ≤2MB) giống `/api/analyze` — cho Gemini nhìn layout thật khi trích xuất.
- **Response:** `{ parsedCV: ParsedCV | undefined }` — thông tin cá nhân, học vấn, kinh nghiệm làm việc (không giới hạn số lượng, không tóm tắt), kỹ năng, dự án, chứng chỉ, ATS evaluation. **Lưu ý (2026-07):** `ats_evaluation.years_of_experience` không còn là số Gemini tự tính — client override bằng `computeYearsOfExperience()` (`parsedCvNormalize.ts`), cộng deterministic từ `work_experience[].duration`, merge khoảng thời gian chồng lấn; chỉ fallback về số LLM khi không có mốc thời gian nào parse được.
- **Logic:** `_server-lib/ai/parseCvService.ts`, `generateParsedCV(jd, cvData, cvMimeType, language, timeoutMs, cvPdfInlineData?)`.
- **Trigger:** gọi song song với `/api/rewrite-cv`, ngay sau `/api/analyze` (`AnalysisRunContext.generateParsedCVForResult`). `ParsedCVTab` hiện spinner cho tới khi có kết quả.

### Trích xuất PDF (path thống nhất)

| Môi trường | Method & path | File |
|------------|----------------|------|
| **Vercel** | `POST /api/extract-pdf` | `api/extract-pdf.ts` |
| **Express** | `POST /api/extract-pdf` | `server/routes/pdf.ts` |

- **Auth (2026-06):** Bearer token (Supabase JWT) hoặc `recaptchaToken` trong body — bắt buộc. Anonymous request không có token sẽ nhận `401`.
- **Body:** `{ base64Data: string, recaptchaToken?: string }`
- **Response:** `{ text: string }`
- **Dùng cho:** Trích xuất text từ PDF JD (Job Description) upload trong `AnalysisInputView`. CV PDF dùng `unpdf` client-side (`useFileProcessor.ts`), không qua endpoint này — file gốc (nếu ≤2MB) được gửi kèm trực tiếp trong body `/api/analyze`/`/api/parse-cv` (`cvPdfInlineData`) thay vì qua một endpoint trích xuất riêng.

### Xác thực reCAPTCHA (standalone — chỉ cho auth flow)

| Môi trường | Method & path |
|------------|----------------|
| **Vercel** | `POST /api/verify-recaptcha` |
| **Express** | `POST /api/verify-recaptcha` |

- **Body:** `{ token: string }`
- **Sử dụng:** `AuthContext.tsx` — verify trước `signInWithEmail()` / `signUpWithEmail()`.
- **Ghi chú:** Localhost bypass tự động (`NODE_ENV !== 'production'`). Shared logic: `_server-lib/recaptcha.ts`.
- Analyze và extract-pdf verify reCAPTCHA **inline** trong shared handler, không gọi endpoint này.

### Thanh toán PayOS

| Môi trường | Method & path | File |
|------------|----------------|------|
| **Vercel** | `POST /api/payment/{create\|webhook\|confirm}` | `api/payment.ts` (unified, dispatch theo URL segment) |
| **Express** | `POST /api/payment/{create\|webhook\|confirm}` | `server/routes/payment.ts` → shared `_server-lib/payment/handlers.ts` |

- **`POST /api/payment/create`** — Tạo link thanh toán PayOS. Auth: Bearer (Supabase JWT). Body: `{ planType?: "pro" | "recruiter" }`. Response: `{ checkoutUrl: string, orderCode: number }`. **Guard (từ `20260703060000`):** nếu `planType = "pro"` và user đang recruiter active → HTTP 409, không tạo link (chặn downgrade recruiter→pro trước khi lấy tiền — xem [8_analytics.md](8_analytics.md)).
- **`POST /api/payment/webhook`** — PayOS callback khi có kết quả thanh toán. Xác thực hai lớp:
  1. **HMAC-SHA256** (`verifyWebhookPayload`) — sorted-key object signing trên `data`.
  2. **Timestamp freshness** (`isWebhookTimestampFresh`) — `data.transactionDateTime` phải trong cửa sổ ±30 phút. Webhook cũ bị replay → HTTP 400.
  - Gọi RPC `activate_pro_plan` nếu thành công; idempotent (đã `paid` → bỏ qua).
- **`POST /api/payment/confirm`** — Fallback khi webhook bị delay. Auth: Bearer. Body: `{ orderCode: number }`. Tự verify trạng thái qua PayOS API, sau đó activate nếu đã thanh toán.
- **Yêu cầu:** `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_URL`.

### Hệ thống Email (Resend)

#### `POST /api/send-email` (unified — Vercel)

Vercel dùng một handler duy nhất dispatch theo `type` field. Express dùng hai route riêng (`/api/send-feedback`, `/api/send-welcome-email`) nhưng cùng logic từ `_server-lib/email/handlers.ts`.

**Feedback** (`type: 'feedback'`):
- **Body:** `{ type: 'feedback', token, rating, title, content, userEmail }`
- **reCAPTCHA:** Bắt buộc (score ≥ 0.5).

**Welcome** (`type: 'welcome'`):
- **Body:** `{ type: 'welcome', token, userEmail, userName }`
- **reCAPTCHA:** Production: bắt buộc (score ≥ 0.5); dev: bypass. Token bắt buộc khi `NODE_ENV === 'production'`.

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