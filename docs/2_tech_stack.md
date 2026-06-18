# Công nghệ sử dụng (cvFit)

Dự án được xây dựng trên một nền tảng công nghệ hiện đại, tập trung vào hiệu suất, khả năng mở rộng và trải nghiệm người dùng cao cấp.

## Frontend

-   **Framework:** [React 19](https://react.dev/) - Tận dụng các tính năng mới nhất để tối ưu hiệu suất.
-   **Build Tool:** [Vite 6](https://vitejs.dev/) - Đảm bảo tốc độ phát triển và build cực nhanh.
-   **Styling:** [Tailwind CSS 4](https://tailwindcss.com/) - Sử dụng Engine mới nhất cho việc thiết kế UI nhanh chóng và nhất quán.
-   **Animations:** [Motion](https://motion.dev/) (`motion`, import `motion/react`) — hiệu ứng chuyển cảnh và tương tác.
-   **Icons:** [Lucide React](https://lucide.dev/) - Bộ icon vector đa dạng và hiện đại.
-   **Data Visualization:** [Recharts](https://recharts.org/) - Hiển thị biểu đồ phân tích điểm số trực quan.
-   **Analytics (kép):**
    -   [Vercel Analytics](https://vercel.com/analytics) — pageview / Web Vitals trên dashboard Vercel (luôn bật, `<Analytics />`).
    -   **Google Analytics 4 (GA4)** — event sản phẩm (`analyze_cv`, `analysis_success`, …) qua `src/lib/ga4.ts`, **chỉ sau cookie consent**. Chi tiết: [`docs/8_analytics.md`](8_analytics.md).
-   **Error Tracking:** [Sentry](https://sentry.io/) (`@sentry/react`) — capture lỗi runtime, unhandled rejection, và React error boundary. Khởi tạo tại `src/lib/sentry.ts`; PII (CV content, JD, email) bị scrub trong `beforeSend` trước khi gửi lên Sentry. User chỉ được track bằng ID ẩn danh (không email) qua `src/lib/sentryUser.ts`.
-   **State Management:** React Context — `AuthContext`, `UIContext`, `AnalysisProvider` (`src/context/analysis/`: `AnalysisRunProvider` + `SavedJdProvider`; `useAnalysis()` merged). Shim: `src/context/AnalysisContext.tsx`.

## Backend (Modular Express)

-   **Runtime:** [Node.js](https://nodejs.org/).
-   **Architecture:** **Modular Express Server** với các Route Handler được tách biệt, tích hợp trực tiếp với Vite Middleware trong môi trường phát triển.
-   **Rate Limiting:** `server/lib/rateLimiter.ts` — 3 mức: `apiLimiter` (100 req/15ph toàn cục), `strictLimiter` (10 req/15ph cho PDF và payment), `emailLimiter` (5 req/h cho email).
-   **PDF/Docx Processing:**
    -   `Google Gemini AI`: Xử lý đa phương thức (Vision) trực tiếp cho các file PDF/Hình ảnh từ Frontend.
    -   `mammoth`: Chuyển đổi tệp .doc/.docx sang văn bản thuần túy (Lazy-loaded để tối ưu bundle).
    -   `unpdf`: Trích xuất text từ PDF — dùng cả client-side (CV PDF qua `useFileProcessor.ts`) và server-side (`_server-lib/pdf/handler.ts` cho JD PDF uploads qua `POST /api/extract-pdf`).
-   **Security:** `Google reCAPTCHA v3` bảo vệ các endpoint API. Shared utility: `_server-lib/recaptcha.ts`.

## Trí tuệ nhân tạo (AI)

-   **Engine:** [Google Gemini AI](https://deepmind.google/technologies/gemini/) - Sử dụng model **Gemini 3.5 Flash** cho tốc độ và trí tuệ vượt trội.
-   **Modular Service:** Logic AI được module hóa hoàn toàn trong `src/services/ai/` giúp dễ dàng bảo trì và mở rộng.
-   **Multimodal capabilities:** Khả năng hiểu trực tiếp layout CV phức tạp qua hình ảnh và URL.

## Dịch vụ & Cơ sở dữ liệu (Cloud Services)

-   **Supabase:**
    -   **Authentication:** Quản lý đăng nhập người dùng qua Google OAuth.
    -   **PostgreSQL:** Profile, lịch sử, JDs; bảng **`app_settings`** (hạn mức phân tích mặc định/tháng, đổi runtime); RPC `check_analytics_quota`, `increment_usage_count`.
    -   **Edge Functions:** (Tùy chọn) Triển khai logic serverless trên hạ tầng toàn cầu của Supabase.
-   **Email Service:** [Resend](https://resend.com/) - Gửi email phản hồi và email chào mừng tự động.
-   **Payment Gateway:** [PayOS](https://payos.vn/) - Cổng thanh toán cho gói Pro; xử lý tạo link thanh toán, webhook xác thực HMAC-SHA256. Shared handler dùng chung cho cả Express (`server/routes/payment.ts`) và Vercel (`api/payment/`).

## Quản lý mã nguồn & Triển khai

-   **Version Control:** Git & GitHub.
-   **Deployment Platform:** **Vercel** (Frontend & Modular API).
-   **Database Provider:** **Supabase**.
-   **Error Monitoring:** **Sentry** — backend (`@sentry/node`) tích hợp vào Express (`server.ts`) và tất cả Vercel Functions (`api/*.ts`); khởi tạo idempotent qua `_server-lib/sentry.ts`.
-   **Secrets hygiene:** Root `.gitignore` loại trừ `.env`, cache `supabase/.temp/`, khóa TLS/SSH và file backup PII — chi tiết tại [`docs/7_deployment.md` §5](7_deployment.md#5-bảo-mật-mã-nguồn-và-bi-mật).
-   **Graphify (tùy chọn):** Skill Graphify; trên Git **chỉ** track `graphify-out/GRAPH_REPORT.md` (toàn bộ `graphify-out/*` khác ignore). Local: `graphify update .` sau clone; cache AST trong `graphify-out/cache/` không commit.