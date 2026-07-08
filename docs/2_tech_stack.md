# Công nghệ sử dụng (cvFit)

## Frontend

-   **Framework:** [React 19](https://react.dev/) + [Vite 6](https://vitejs.dev/)
-   **Styling:** [Tailwind CSS 4](https://tailwindcss.com/) + `clsx` / `tailwind-merge`
-   **Animations:** [Motion](https://motion.dev/) (`motion/react`)
-   **Icons:** [Lucide React](https://lucide.dev/)
-   **Data Visualization:** [Recharts](https://recharts.org/)
-   **Analytics:**
    -   [Vercel Analytics](https://vercel.com/analytics) — pageview / Web Vitals (luôn bật, `<Analytics />`).
    -   **GA4** — custom events qua `src/lib/ga4.ts`, chỉ sau cookie consent. Chi tiết: [`docs/8_analytics.md`](8_analytics.md).
-   **Error Tracking:** [Sentry](https://sentry.io/) (`@sentry/react`) — PII scrubbed trong `beforeSend`; user tracked bằng ID ẩn danh (`src/lib/sentryUser.ts`).
-   **State Management:** React Context — `AuthContext`, `UIContext`, `AnalysisProvider` (`src/context/analysis/`). Shim: `src/context/AnalysisContext.tsx`.

## Backend (Modular Express)

-   **Runtime:** Node.js 20+, TypeScript.
-   **Architecture:** Thin handler pattern — `server/routes/` (Express) và `api/` (Vercel) đều gọi cùng `_server-lib/`.
-   **Rate Limiting:** `server/lib/rateLimiter.ts` — `apiLimiter` (100 req/15ph), `strictLimiter` (10 req/15ph cho PDF/payment), `emailLimiter` (5 req/h).
-   **PDF/Docx Processing:**
    -   `unpdf` — client-side (CV PDF) và server-side (JD PDF qua `POST /api/extract-pdf`).
    -   `mammoth` — `.docx` → plain text (lazy-loaded).
    -   Gemini Vision — PDF/image multimodal trực tiếp từ frontend.
-   **Security:** reCAPTCHA v3 qua `_server-lib/recaptcha.ts`.

## AI

-   **Engine:** Google Gemini 3 Flash Preview (`@google/genai`) — server-side only (`GEMINI_API_KEY`).
-   **Service:** `src/services/ai/` — `analysisService`, `extractionService`, normalizers, `fullRewrittenCvMarkdown.ts`.

## Cloud Services

-   **Supabase:** Auth (Google OAuth + Email/Password), PostgreSQL (`profiles`, `history`, `saved_jds`, `saved_cvs`, `payments`, `app_settings`), Storage bucket `cv-files` (kho CV vĩnh viễn) + `cv-analyze-tmp` (**2026-07**: file tạm 2–15MB trong luồng phân tích, tự dọn sau khi xử lý xong — xem [3_frontend.md](3_frontend.md) và [4_backend.md](4_backend.md)). RPC: `check_analytics_quota`, `increment_usage_count`, `activate_pro_plan`.
-   **Email:** [Resend](https://resend.com/) — feedback, welcome, VIP upgrade.
-   **Payment:** [PayOS](https://payos.vn/) — webhook HMAC-SHA256 + timestamp freshness. Handler dùng chung Express/Vercel.
-   **Error Monitoring:** Sentry Node.js (`@sentry/node`) — `_server-lib/sentry.ts` (idempotent init).

## Triển khai

-   **Platform:** Vercel (GitHub `nghiepnguyen/CVCompareTN` → project `cvfit`).
-   **CI/CD:** GitHub Actions — lint → test → build trên mỗi push/PR vào `main`.
-   **Secrets:** `.gitignore` loại trừ `.env`, `supabase/.temp/`, `.vercel/`, keys, backup PII — chi tiết: [`docs/7_deployment.md` §5](7_deployment.md#5-bảo-mật-mã-nguồn-và-bi-mật).
-   **Graphify (tùy chọn):** Chỉ track `graphify-out/GRAPH_REPORT.md`; tái tạo local bằng `graphify update .`.