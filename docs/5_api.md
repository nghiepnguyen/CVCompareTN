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

Gemini được gọi qua **3 endpoint riêng biệt** (từ 2026-07) thay vì một call gộp hết — vì (khi đó) trần `maxDuration` 60s, một prompt yêu cầu Gemini trả quá nhiều field (điểm số + gợi ý viết lại + trích xuất CV đầy đủ + CV viết lại hoàn chỉnh) trong một lần dễ vượt trần và bị Vercel hard-kill (504 không có JSON body). Giải pháp: `/api/analyze` chỉ trả kết quả chấm điểm/so sánh (cần hiển thị ngay); `fullRewrittenCV` và `parsedCV` được generate **sau, trong nền**, qua hai endpoint riêng.

#### `POST /api/analyze` — chính, đồng bộ

| Môi trường | Method & path | File |
|------------|----------------|------|
| **Vercel** | `POST /api/analyze` | `api/analyze.ts` (maxDuration 300s, deadline 65s) |
| **Express** | `POST /api/analyze` | `server/routes/analyze.ts` |

- **Auth:** Bearer token (Supabase JWT) — **bắt buộc** (2026-07: đã bỏ nhánh anonymous/reCAPTCHA vì UI luôn chặn phân tích khi chưa đăng nhập — nhánh anonymous chỉ có thể chạm tới qua gọi API trực tiếp, không quota, không rate-limit trên Vercel). Không có token hợp lệ → `401`.
- **Body:**
  ```json
  {
    "jd": "string (job description)",
    "cvData": "string (plain text hoặc base64 cho image/pdf)",
    "cvMimeType": "text/plain | application/pdf | image/jpeg | image/png | ...",
    "cvName": "string (optional)",
    "language": "vi | en (optional, default: vi)",
    "cvPdfInlineData": "string (optional, base64 PDF gốc ≤2MB — 2026-07, xem 'Lưu ý PDF' dưới)",
    "cvPdfStoragePath": "string (optional, 2026-07 — path trong bucket cv-analyze-tmp khi PDF gốc 2–15MB, thay cho cvPdfInlineData)",
    "cvDataStoragePath": "string (optional, 2026-07 — path trong bucket cv-analyze-tmp khi cvData là ảnh/PDF-scan 2–15MB, thay cho gửi base64 trực tiếp trong cvData)",
    "batchTotal": "number (optional, mặc định 1 — tổng số CV trong lần phân tích batch; server đối chiếu với MAX_BATCH_BY_PLAN theo plan hiệu lực của user, vượt hạn mức → 400)"
  }
  ```
- **Response:** `AnalysisResult` JSON — matchScore, categoryScores, matchingPoints, missingGaps, atsKeywords, rewriteSuggestions, detailedComparison (mỗi item có thêm `priority: 'required' | 'nice-to-have'`, 2026-07), `formatAssessment` (2026-07 — parseability score + checklist layout/format, xem dưới), `passProbability`, `probabilityVersion`, `mainFactor`. Từ Stage 3.13C, `passProbability` là **deterministic** từ `matchScore` (`>=80 High`, `>=60 Medium`, else `Low`) và `probabilityVersion = 'canonical-score-v1'`; `successProbability` chỉ còn là **compatibility mirror** của `passProbability` cho client cũ (deprecated, không phải authority); `passExplanation` luôn `''` cho analysis mới (legacy history vẫn giữ prose cũ). `fullRewrittenCV` luôn là `''` và `parsedCV` luôn `undefined` trong response này — frontend fill hai field đó sau qua `/api/rewrite-cv` và `/api/parse-cv` (xem `generateFullCV`/`generateParsedCVForResult` trong `AnalysisRunContext.tsx`).
- **Server-side flow (`_server-lib/analyze/handler.ts`):** xác thực Bearer (timeout 4s, thất bại → `401` ngay) → tra plan hiệu lực từ `profiles` (`plan`/`plan_expires_at`/`role`, timeout 4s; **fail-closed**, lỗi/timeout → `503`) và validate `batchTotal` so với `MAX_BATCH_BY_PLAN[effectivePlan]` (vượt → `400`). `batchTotal` chỉ là khai báo của caller — mỗi request chỉ mang 1 CV — nên entitlement thực thi là **cap giờ** `checkHourlyAiLimit(userId, 'analyze', plan)` đếm từ `analysis_log`: quá `max(10, 2 × MAX_BATCH_BY_PLAN)` (free/pro 10, recruiter 100) → **429** (lookup lỗi → fail-open). Sau đó `check_analytics_quota` RPC (timeout 5s, fail-open nếu lỗi/timeout) → gọi Gemini (`_server-lib/ai/analysisService.ts`) → `increment_usage_count` (fire-and-forget).
- **Timeout — Deadline (Stage 3.5, 2026-10-29):** cả 3 endpoint dùng chung một request deadline **65s** (`_server-lib/deadline.ts`) tính từ đầu handler. Gemini chạy theo deadline AI = 65s − 6s dự phòng (cho tăng quota, ghi `analysis_log`, trả response); không gọi Gemini khi còn < 10s. Mỗi tham chiếu storage tối đa 15s (DB lookup + R2 HEAD/GET/body hoặc Supabase download dùng chung một AbortSignal, hủy thật). Quota/telemetry bị giới hạn bởi phần còn lại. Lỗi có kiểm soát trả JSON `504`/`500` và ghi `analysis_log.error_message` dạng phân loại (`[storage_timeout]`, `[storage_error]`, `[gemini_timeout]`, `[gemini_error]`, `[request_budget_exhausted]`). Client chờ 75s. `maxDuration: 300` (Hobby + Fluid Compute, đã xác minh) chỉ là trần an toàn.
- **maxOutputTokens:** 16384.
- **Rate limit:** 10 req/15 min (strictLimiter).
- **Prompt (2026-07):** trước khi chấm điểm, model phân loại từng yêu cầu JD thành `required`/`nice-to-have`, áp thang điểm chuẩn hóa 6 mức cho `categoryScores`, và match `atsKeywords` theo kiểu literal string (không suy diễn ngữ nghĩa lỏng) để mô phỏng đúng cách một ATS thật đọc CV. Chi tiết: `src/services/ai/prompts.ts`.
- **Lưu ý PDF (cập nhật 2026-07):** Client (`useFileProcessor.ts`) extract text bằng `unpdf` TRƯỚC khi gửi — file gốc ≤2MB gửi kèm `cvPdfInlineData` (base64) như cũ; **2–15MB** (`MAX_STORAGE_UPLOAD_SIZE`) client upload thẳng lên bucket `cv-analyze-tmp` (`uploadTempAnalysisFile`) và gửi `cvPdfStoragePath` thay vì base64 — né hẳn giới hạn 4.5MB body Vercel. Handler resolve path này qua `_server-lib/storage/tempFile.ts` (service-role download + check path đúng `userId`) thành base64 trước khi gọi Gemini, giữ nguyên logic `analysisService.ts`. Server chỉ fallback base64-only (`inlineData`, multimodal OCR) khi extract thất bại hoặc PDF là ảnh scan (dùng `cvDataStoragePath` khi 2–15MB) — chỉ hard-fail phía client khi vượt 15MB. File tạm được client tự xoá sau khi `/api/analyze` + `/api/rewrite-cv` + `/api/parse-cv` đều xong. Xem [memory: Analyze timeout — PDF multimodal].

#### `POST /api/rewrite-cv` — nền, tạo `fullRewrittenCV`

| Môi trường | Method & path | File |
|------------|----------------|------|
| **Vercel** | `POST /api/rewrite-cv` | `api/rewrite-cv.ts` (maxDuration 300s, deadline 65s) |
| **Express** | `POST /api/rewrite-cv` | `server/routes/rewriteCv.ts` |

- **Shared handler:** `_server-lib/rewriteCv/handler.ts` — `handleRewriteCv()` (giống pattern `handleAnalyze()`, dùng chung giữa Vercel và Express).
- **Auth:** giống `/api/analyze` — Bearer bắt buộc (timeout 4s), không còn nhánh anonymous/reCAPTCHA.
- **Khoá tài khoản / rate limit (2026-10):** `checkAiAccess()` (`_server-lib/accountLock.ts`) ngay sau auth — `profiles.has_permission = false` (không phải admin) → **403** `Account locked`; quá `max(10, 2 × MAX_BATCH_BY_PLAN[plan])` lần/giờ cho loại đó (free/pro 10, recruiter 100, đếm từ `analysis_log`) → **429**. Lookup lỗi/timeout → cho qua (fail-open). `/api/analyze` cũng trả 403 cho tài khoản bị khoá và áp cùng cap giờ qua `checkHourlyAiLimit(kind='analyze')`, thay vì tin `batchTotal` do client khai.
- **Body:** `{ jd, cvData, cvMimeType, language?, cvDataStoragePath? }` (không có `cvName`). `cvDataStoragePath` (2026-07, optional) — path `cv-analyze-tmp` khi `cvData` là ảnh/PDF-scan 2–15MB, resolve qua `tempFile.ts` giống `/api/analyze`.
- **Response:** `{ fullRewrittenCV: string }` — Markdown GFM CV đã viết lại tối ưu ATS.
- **Timeout:** cùng request deadline 65s như `/api/analyze`; retry Full CV chỉ chạy khi deadline AI còn ≥ 20s (`_server-lib/ai/rewriteService.ts`, `generateFullRewrite(jd, cvData, cvMimeType, language, timeoutMs)`).
- **Trigger:** gọi tự động, không chặn UI, ngay sau khi `/api/analyze` trả kết quả (`AnalysisRunContext.generateFullCV`). `FullCVTab` hiện spinner cho tới khi có kết quả.

#### `POST /api/parse-cv` — nền, tạo `parsedCV`

| Môi trường | Method & path | File |
|------------|----------------|------|
| **Vercel** | `POST /api/parse-cv` | `api/parse-cv.ts` (maxDuration 300s, deadline 65s) |
| **Express** | `POST /api/parse-cv` | `server/routes/parseCv.ts` |

- **Shared handler:** `_server-lib/parseCv/handler.ts` — `handleParseCv()`.
- **Auth/Timeout:** giống hệt `/api/rewrite-cv` (Bearer bắt buộc, không còn nhánh anonymous/reCAPTCHA).
- **Body:** `{ cvData, cvMimeType, language?, cvPdfInlineData?, cvPdfStoragePath?, cvDataStoragePath? }` — **Stage 3.10B: CV-only extraction**, ứng dụng không gửi JD. Thuộc tính `jd` từ caller cũ được bỏ qua hoàn toàn, không validate/đưa vào prompt Gemini. **Stage 3.9B:** parse-cv không còn sinh `key_match_highlights`/`missing_keywords` — UI suy ra điểm khớp/yêu cầu còn thiếu từ `detailedComparison` canonical của `/api/analyze`; hai field này chỉ còn trong `history.parsed_cv` cũ. **Stage 3.8B:** parse-cv không còn chấm điểm CV↔JD — `relevant_score` đã bị bỏ khỏi prompt và schema; `matchScore` của `/api/analyze` là điểm CV↔JD duy nhất. `relevant_score` chỉ còn trong `history.parsed_cv` cũ (legacy, không hiển thị). `cvPdfInlineData`/`cvPdfStoragePath`/`cvDataStoragePath` giống hệt `/api/analyze` (base64 ≤2MB hoặc storage path 2–15MB) — cho Gemini nhìn layout thật khi trích xuất.
- **Response:** `{ parsedCV: ParsedCV | undefined }` — thông tin cá nhân, học vấn, kinh nghiệm làm việc (không giới hạn số lượng, không tóm tắt), kỹ năng, dự án, chứng chỉ, `ats_evaluation.years_of_experience` (kinh nghiệm từ CV, không phải ATS matching). **Stage 3.11B:** field này là tổng elapsed professional work experience trong CV (không phải JD-relevant, role-years hay FTE-years). Kết quả mới chỉ dùng deterministic union khi timeline COMPLETE và source-backed; PARTIAL/UNAVAILABLE giữ estimate Gemini hợp lệ (finite, nonnegative; `0` hợp lệ). Model invalid → source-backed subtotal → `0`; riêng model `0` bị bằng chứng positive source-backed bác bỏ thì dùng subtotal. History dùng mode riêng, giữ selected value đã lưu, không tăng số năm theo ngày mở lại. Schema giữ nguyên, không migration.
- **Logic:** `_server-lib/ai/parseCvService.ts`, `generateParsedCV(cvData, cvMimeType, language, timeoutMs, cvPdfInlineData?)`.
- **Experience evidence (3.11B):** `experienceAuthority.ts` kiểm tra raw work entries trước filtering. Text CV/PDF text chỉ được source-verify khi một dòng có header company/title ngay trước đúng một cặp ngày (hoặc start–Present/nay/hiện tại), không ghép ngày giữa role. Chỉ normalize dạng tháng đã hỗ trợ; không suy ra calendar dates từ “5 years”. Multiline/scan/image hoặc không đối chiếu chắc chắn → support unknown, dùng Gemini fallback. Future-only không góp subtotal; future end cap ở tháng ICT `asOf` và timeline không COMPLETE; year-only hạ precision, chỉ góp fallback. Chỉ boolean `true` tạo current role. Không loại internship/freelance theo title.
- **Trigger:** gọi song song với `/api/rewrite-cv`, ngay sau `/api/analyze` (`AnalysisRunContext.generateParsedCVForResult`). `ParsedCVTab` hiện spinner cho tới khi có kết quả.

### Trích xuất PDF (path thống nhất)

| Môi trường | Method & path | File |
|------------|----------------|------|
| **Vercel** | `POST /api/extract-pdf` | `api/extract-pdf.ts` |
| **Express** | `POST /api/extract-pdf` | `server/routes/pdf.ts` |

- **Auth (2026-06):** Bearer token (Supabase JWT) hoặc `recaptchaToken` trong body — bắt buộc. Anonymous request không có token sẽ nhận `401`.
- **Rate limit (2026-10-31):** `enforceRateLimit()` (`_server-lib/rateLimit.ts`) — 120 request/giờ cho mỗi user (Bearer) hoặc mỗi IP (anonymous; IP được băm HMAC, không lưu IP thô) → vượt **429** `Too many requests` (đủ cho ~2 batch recruiter 50 JD). Đếm trước bước verify reCAPTCHA. Bộ đếm dùng chung Postgres (`consume_api_rate_limit`, migration `20261101100000`) nên có hiệu lực trên cả Vercel và Express; lookup lỗi/timeout → fail-open như rate limit AI.
- **Body:** `{ base64Data: string, recaptchaToken?: string }`
- **Response:** `{ text: string }`
- **Dùng cho:** Trích xuất text từ PDF JD (Job Description) upload trong `AnalysisInputView`. CV PDF dùng `unpdf` client-side (`useFileProcessor.ts`), không qua endpoint này — file gốc (≤2MB base64 inline, 2–15MB qua storage path `cv-analyze-tmp`) được gửi kèm trực tiếp trong body `/api/analyze`/`/api/parse-cv`/`/api/rewrite-cv` thay vì qua một endpoint trích xuất riêng.

### Xác thực reCAPTCHA (inline — không còn endpoint standalone)

Không còn route `/api/verify-recaptcha` hay Edge Function `verify-recaptcha` (audit §4.10, 2026-10-31). reCAPTCHA v3 được verify **inline** trong các handler dùng nó: `/api/extract-pdf` (action `extract_pdf`) và feedback `POST /api/send-email` (action `feedback`), qua `_server-lib/recaptcha.ts` — kiểm `success`, score trong ngưỡng, đúng action và hostname. Auth flow không gọi verify endpoint riêng.

### Thanh toán PayOS

| Môi trường | Method & path | File |
|------------|----------------|------|
| **Vercel** | `POST /api/payment/{create\|webhook\|confirm}` | `api/payment.ts` (unified, dispatch theo URL segment) |
| **Express** | `POST /api/payment/{create\|webhook\|confirm}` | `server/routes/payment.ts` → shared `_server-lib/payment/handlers.ts` |

- **`POST /api/payment/create`** — Tạo link thanh toán PayOS. Auth: Bearer (Supabase JWT). Body: `{ planType?: "pro" | "recruiter" }`. Response: `{ checkoutUrl: string, orderCode: number }`. Tối đa 5 đơn `pending` tạo trong 15 phút / user → **429** (link PayOS tự hết hạn sau 15 phút; đơn pending cũ không bị đổi trạng thái để webhook trễ vẫn kích hoạt được). **Guard (từ `20260703060000`):** nếu `planType = "pro"` và user đang recruiter active → HTTP 409, không tạo link (chặn downgrade recruiter→pro trước khi lấy tiền — xem [8_analytics.md](8_analytics.md)).
- **`POST /api/payment/webhook`** — PayOS callback khi có kết quả thanh toán. Xác thực hai lớp:
  1. **HMAC-SHA256** (`verifyWebhookPayload`) — sorted-key object signing trên `data`, so sánh bằng `timingSafeEqual`.
  2. **Timestamp freshness** (`isWebhookTimestampFresh`) — `data.transactionDateTime` phải trong cửa sổ ±30 phút. Webhook cũ bị replay → HTTP 400.
  - Thành công chỉ xét **`data.code === '00'`** (nằm trong phần có chữ ký); `code`/`success` ở top-level không được ký nên bị bỏ qua.
  - `data.amount` phải bằng `payments.amount` của đơn, khác → HTTP 400, không kích hoạt.
  - Gọi RPC `activate_pro_plan` nếu thành công; idempotent (đã `paid` → bỏ qua).
- **`POST /api/payment/confirm`** — Fallback khi webhook bị delay. Auth: Bearer. Body: `{ orderCode: number }`. Tự verify trạng thái qua PayOS API, sau đó activate nếu đã thanh toán.
- **Yêu cầu:** `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_URL`.

### Hệ thống Email (Resend)

#### `POST /api/send-email` (unified — Vercel)

Vercel dùng một handler duy nhất dispatch theo `type` field. Express dùng hai route riêng (`/api/send-feedback`, `/api/send-welcome-email`) nhưng cùng logic từ `_server-lib/email/handlers.ts`.

**Feedback** (`type: 'feedback'`):
- **Body:** `{ type: 'feedback', token, rating, title, content, userEmail }`
- **reCAPTCHA:** Bắt buộc (score ≥ 0.5).
- **Rate limit (2026-10-31):** 5 request/giờ/IP (IP băm HMAC) trước bước verify reCAPTCHA → **429**.

**Welcome** (`type: 'welcome'`):
- **Auth (2026-10):** `Authorization: Bearer` bắt buộc (401 nếu thiếu/sai); mail chỉ gửi tới **email của user trong token**, `userEmail` trong body bị bỏ qua.
- **Rate limit (2026-10-31):** 5 request/giờ/user → **429**.
- **Body:** `{ type: 'welcome', userName }`
- **reCAPTCHA:** Không (trigger là `createUserProfile()` client-side ngay sau khi tạo `profiles` row mới). Fire-and-forget từ `userService.ts::createUserProfile()`, log lỗi HTTP status nếu gửi thất bại nhưng không throw/block đăng nhập.

#### VIP Upgrade Email (server-side)

- **Mục đích:** Gởi email chúc mừng + quyền lợi khi user nâng cấp Pro/Recruiter thành công.
- **Trigger:** Thanh toán PayOS thành công (webhook hoặc client confirm).
- **File:** `_server-lib/payment/vipUpgradeEmail.ts` — gọi trực tiếp từ `_server-lib/payment/handlers.ts` (non-blocking, fire-and-forget).
- **Phân biệt plan:** Tự động nhận diện Pro vs Recruiter, hiển thị danh sách quyền lợi tương ứng (Pro: 5 CV batch, 10 saved CV; Recruiter: 50 CV batch, 50 saved CV, 10 campaigns).

### Edge Functions — không còn (2026-10-31)

Project Supabase không còn Edge Function nào: `extract-pdf`, `verify-recaptcha` và `send-email` (bản deploy cũ, không có source trong repo) đã bị xoá bằng `supabase functions delete` theo audit §4.10. Client không dùng `supabase.functions.invoke`; mọi luồng đi qua `/api/*` (Vercel) hoặc Express. Source cũ nằm trong git history nếu cần dựng lại, nhưng phải thêm auth/size cap/CORS allowlist trước khi deploy.

## 2. Dịch vụ lưu trữ & xác thực (Supabase)

Frontend dùng `src/lib/supabase.ts` (REST / Auth / Storage).

- **Auth:** OAuth Google qua Supabase Auth (JWT).
- **PostgreSQL:** `profiles`, `history` (JSON kết quả, có `parsed_cv`), `saved_jds`, `saved_cvs` (kho CV: metadata file CV đã upload), **`app_settings`** (cấu hình runtime, ví dụ `default_monthly_analytics_limit`).
- **Storage:** Bucket `cv-files` (Supabase Storage) — được dùng bởi `cvService.ts` để upload/download/delete CV trong tính năng **Kho CV** (Free: 1 CV, Pro: 10 CV). Bucket `cv-analyze-tmp` (**2026-07**) — file tạm 2–15MB trong luồng phân tích (`/api/analyze`, `/api/rewrite-cv`, `/api/parse-cv`), upload/cleanup qua `cvService.ts::uploadTempAnalysisFile`/`cleanupTempAnalysisFiles`, server đọc qua `_server-lib/storage/tempFile.ts`.

### RPC & quota phân tích (client gọi qua `supabase.rpc`)

| RPC | Gọi từ | Mô tả |
|-----|---------|--------|
| `check_analytics_quota(p_user_id, p_additional?)` | `analyticsQuotaService.ts` (client, UX) + `api/analyze.ts` (server, enforce) | Kiểm tra còn quota trước batch analyze; trả `allowed`, `used`, `limit`. |
| `increment_usage_count(user_id)` | `api/analyze.ts` / `server/routes/analyze.ts` (server-side, fire-and-forget) | Tăng `usage_count` sau mỗi lần phân tích thành công. **Không còn gọi từ client.** |
| `get_default_monthly_analytics_limit()` | (SQL nội bộ / có thể gọi từ client) | Đọc default từ `app_settings`. |

Chi tiết semantics, Admin UI, migration: [8_analytics.md](8_analytics.md).

## Cập nhật storage R2 (2026-10-18)

Các mô tả Supabase Storage ở trên là luồng legacy. Tích hợp mới giữ Supabase làm nơi upload mặc định và đọc theo metadata; có thể bật R2 riêng cho `temp`, `saved`, `candidate` qua cấu hình server. File tạm R2 dùng reference `r2:{uploadId}`, file lâu dài giữ `file_path` cùng `storage_provider`. Tải file cá nhân/recruiter qua `POST /api/storage` với JWT, không dùng public URL. Cleanup có queue bền vững và scheduler, kể cả khi xoá campaign/user. Xem [10_storage_r2.md](10_storage_r2.md) cho migration bắt buộc, API, CORS/lifecycle, kiểm thử và rollback.

**Rate limit (2026-10-31):** mọi action của `POST /api/storage` (upload/finalize/download/delete/delete-temp) bị giới hạn 120 request/giờ/user → **429**; bộ đếm chung Postgres `consume_api_rate_limit` (`_server-lib/rateLimit.ts`, migration `20261101100000`). Giới hạn này không thay cho plan caps/upload caps — xem §4.5/§4.6 của audit.
