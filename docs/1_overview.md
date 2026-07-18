# Dự án cvFit

**cvFit** — ứng dụng AI giúp ứng viên và nhà tuyển dụng so sánh CV với JD, tối ưu ATS và tạo CV cải thiện tự động.

## Mục tiêu chính

1.  **ATS Optimization:** Chấm điểm CV theo từ khóa, cấu trúc, định dạng ATS.
2.  **AI-Powered Analysis:** Gemini 3 Flash Preview phân tích CV + JD như chuyên gia tuyển dụng.
3.  **Multilingual:** Tiếng Việt + tiếng Anh.
4.  **Premium UX:** Industrial Utilitarian design, Motion animations, mobile-first.
5.  **SEO:** Pre-hydration `<script>` trong `index.html` (title, OG, hreflang vi/en/x-default, Schema.org); `AppContent.tsx` đồng bộ sau SPA navigation; sitemap 14 URL; legacy paths redirect 301; `scripts/generate-static-pages.ts` render sẵn nav + nội dung text vào `#root` cho từng route/locale để crawler không chạy JS vẫn thấy content + outgoing links (2026-07-18, fix Ahrefs "Page has no outgoing links"). Chi tiết: [3_frontend.md](3_frontend.md).
6.  **Security & Privacy:** Supabase RLS/Auth/Storage; API proxy giữ secret server-side (Gemini, reCAPTCHA). Không commit `.env` — xem [Triển khai §5](7_deployment.md#5-bảo-mật-mã-nguồn-và-bi-mật).
7.  **Mobile-First:** Bottom Navigation, Bottom Sheets, adaptive layouts.
8.  **Multi-channel Auth:** Google OAuth + Email/Password (Supabase Auth). Email auth bảo vệ bởi reCAPTCHA v3 qua `/api/verify-recaptcha`. `AuthModal.tsx`: Sign In / Sign Up / Reset Password với Motion layoutId animation.

## Tính năng nổi bật

-   **Phân tích CV đa định dạng:** PDF, DOCX, hình ảnh (OCR qua Gemini Vision).
-   **Trích xuất JD:** Từ văn bản thuần hoặc link tuyển dụng.
-   **Matching Score:** Điểm phù hợp CV–JD theo %.
-   **Skill Gap:** Kỹ năng còn thiếu.
-   **Rewrite Suggestions:** Đề xuất viết lại từng phần CV.
-   **Optimized CV:** AI tạo bản CV tối ưu hoàn chỉnh (Markdown GFM).
-   **JD Store:** Kho JD cá nhân để tái sử dụng.
-   **CV Store:** Lưu file CV trên Supabase Storage. Free: 1 CV, Pro: 10 CV.
-   **Gói Pro (69.000đ/tháng):** 100 phân tích/tháng, batch 5 CV, JD store không giới hạn, xuất CV tối ưu.
-   **Gói Recruiter (399.000đ/tháng):** 500 phân tích/tháng, batch 50 CV, 10 đợt tuyển dụng, xếp hạng tự động, xuất Excel, ghi chú nội bộ HR. Thanh toán qua [PayOS](https://payos.vn/) (webhook HMAC-SHA256).
-   **Lịch sử & Quản trị:** Lịch sử phân tích per-user; admin quản lý hạn mức/tháng qua `app_settings` (mặc định **20** lượt, đổi runtime không cần redeploy).
-   **Email Auth:** Sign In / Sign Up / Reset Password qua Supabase Auth + reCAPTCHA v3.

---

## Tài liệu kỹ thuật

| File | Nội dung |
|------|----------|
| [2_tech_stack.md](2_tech_stack.md) | Stack, Supabase, Motion, Recharts |
| [3_frontend.md](3_frontend.md) | Context, views, `CvMarkdownBody`, charts |
| [4_backend.md](4_backend.md) | Express routes, env, PDF/reCAPTCHA |
| [5_api.md](5_api.md) | Endpoint Vercel vs Express, Gemini |
| [6_workflow.md](6_workflow.md) | Luồng phân tích, export, lịch sử |
| [7_deployment.md](7_deployment.md) | Vercel, Supabase migrations, **bảo mật Git** |
| [8_analytics.md](8_analytics.md) | GA4 + Vercel Analytics, cookie consent, **bảng event**, **hạn mức phân tích/tháng** (`app_settings`) |
| [9_api_routes.md](9_api_routes.md) | Ma trận route: Vercel `/api`, Express, Supabase Edge |

**Cấu trúc mã (2026-05):** `src/app/` (shell), `src/context/analysis/` (providers phân tích), `src/components/views/landing/` (section landing). Chi tiết: [3_frontend.md](3_frontend.md).

*Hệ thống được thiết kế để biến quá trình tìm việc trở nên bớt áp lực và tăng cơ hội thành công cho mọi ứng viên.*
