# Công nghệ sử dụng (CV Matcher & Optimizer)

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
-   **State Management:** React Context — `AuthContext`, `UIContext`, `AnalysisProvider` (`src/context/analysis/`: `AnalysisRunProvider` + `SavedJdProvider`; `useAnalysis()` merged). Shim: `src/context/AnalysisContext.tsx`.

## Backend (Modular Express)

-   **Runtime:** [Node.js](https://nodejs.org/).
-   **Architecture:** **Modular Express Server** với các Route Handler được tách biệt, tích hợp trực tiếp với Vite Middleware trong môi trường phát triển.
-   **HTML Processing:** [Cheerio](https://cheerio.js.org/) (jQuery-like HTML parser cho Node.js) + [he](https://github.com/mathiasbynens/he) (HTML entity decoder chuẩn) — dùng để trích xuất văn bản thuần túy từ HTML an toàn, thay thế regex-based approach (tránh CodeQL "Bad HTML filtering regexp" alerts). Shared module: `server/lib/htmlToText.ts`.
-   **SSRF Protection:** `server/lib/urlValidator.ts` — chặn request tới private IP ranges (10.x, 172.16-31.x, 192.168.x, 127.x, 169.254.x), localhost metadata endpoints (AWS 169.254.169.254, GCP metadata.google.internal), IPv6 loopback/link-local, non-HTTP(S) schemes, và path traversal.
-   **Rate Limiting:** `server/lib/rateLimiter.ts` — 3 mức: `apiLimiter` (100 req/15ph toàn cục), `strictLimiter` (10 req/15ph cho PDF, scrape, payment), `emailLimiter` (5 req/h cho email).
-   **PDF/Docx Processing:**
    -   `Google Gemini AI`: Xử lý đa phương thức (Vision) trực tiếp cho các file PDF/Hình ảnh từ Frontend.
    -   `mammoth`: Chuyển đổi tệp .docx sang văn bản thuần túy (Lazy-loaded để tối ưu bundle).
    -   `Supabase Edge Functions`: Xử lý trích xuất PDF cho các Job Description (JD) từ liên kết hoặc file.
-   **Security:** `Google reCAPTCHA v3` bảo vệ các endpoint API (Feedback, Welcome Email).

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
-   **Secrets hygiene:** Root `.gitignore` loại trừ `.env`, cache `supabase/.temp/`, khóa TLS/SSH và file backup PII — chi tiết tại [`docs/7_deployment.md` §5](7_deployment.md#5-bảo-mật-mã-nguồn-và-bi-mật).
-   **Graphify (tùy chọn):** Skill Graphify; trên Git **chỉ** track `graphify-out/GRAPH_REPORT.md` (toàn bộ `graphify-out/*` khác ignore). Local: `graphify update .` sau clone; cache AST trong `graphify-out/cache/` không commit.