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
-   **State Management:** React Context (`AuthContext`, `AnalysisContext`, `UIContext`).

## Backend (Modular Express)

-   **Runtime:** [Node.js](https://nodejs.org/).
-   **Architecture:** **Modular Express Server** với các Route Handler được tách biệt, tích hợp trực tiếp với Vite Middleware trong môi trường phát triển.
-   **PDF/Docx Processing:**
    -   `Google Gemini AI`: Xử lý đa phương thức (Vision) trực tiếp cho các file PDF/Hình ảnh từ Frontend.
    -   `mammoth`: Chuyển đổi tệp .docx sang văn bản thuần túy (Lazy-loaded để tối ưu bundle).
    -   `Supabase Edge Functions`: Xử lý trích xuất PDF cho các Job Description (JD) từ liên kết hoặc file.
-   **Security:** `Google reCAPTCHA v3` bảo vệ các endpoint API (Feedback, Welcome Email).

## Trí tuệ nhân tạo (AI)

-   **Engine:** [Google Gemini AI](https://deepmind.google/technologies/gemini/) - Sử dụng model **Gemini 3.0 Flash** cho tốc độ và trí tuệ vượt trội.
-   **Modular Service:** Logic AI được module hóa hoàn toàn trong `src/services/ai/` giúp dễ dàng bảo trì và mở rộng.
-   **Multimodal capabilities:** Khả năng hiểu trực tiếp layout CV phức tạp qua hình ảnh và URL.

## Dịch vụ & Cơ sở dữ liệu (Cloud Services)

-   **Supabase:**
    -   **Authentication:** Quản lý đăng nhập người dùng qua Google OAuth.
    -   **PostgreSQL:** Cơ sở dữ liệu quan hệ mạnh mẽ lưu trữ Profile, Lịch sử và JDs đã lưu.
    -   **Edge Functions:** (Tùy chọn) Triển khai logic serverless trên hạ tầng toàn cầu của Supabase.
-   **Email Service:** [Resend](https://resend.com/) - Gửi email phản hồi và email chào mừng tự động.

## Quản lý mã nguồn & Triển khai

-   **Version Control:** Git & GitHub.
-   **Deployment Platform:** **Vercel** (Frontend & Modular API).
-   **Database Provider:** **Supabase**.
-   **Secrets hygiene:** Root `.gitignore` loại trừ `.env`, cache `supabase/.temp/`, khóa TLS/SSH và file backup PII — chi tiết tại [`docs/7_deployment.md` §5](7_deployment.md#5-bảo-mật-mã-nguồn-và-bi-mật).
-   **Graphify (tùy chọn):** Phân tích codebase qua skill Graphify; cache AST trong `graphify-out/cache/` được ignore — chỉ chạy `graphify update .` sau khi clone.
