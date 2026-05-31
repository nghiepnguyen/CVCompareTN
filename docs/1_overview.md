# Dự án cvFit

**cvFit** là một giải pháp đột phá sử dụng Trí tuệ nhân tạo (Generative AI) để giúp ứng viên và nhà tuyển dụng so sánh, phân tích mức độ phù hợp giữa hồ sơ năng lực (CV) với mô tả công việc (Job Description - JD). 

## Mục tiêu chính (Core Objectives)

1.  **Tối ưu hóa ATS (ATS Optimization):** Phân tích và chấm điểm CV dựa trên các tiêu chí mà hệ thống ATS thường sử dụng (từ khóa, cấu trúc, định dạng).
2.  **Thông minh hóa quy trình (AI-Powered Analysis):** Tận dụng sức mạnh AI Engine để "đọc" và "hiểu" nội dung CV cũng như yêu cầu của JD như một chuyên gia tuyển dụng thực thụ.
3.  **Hỗ trợ đa ngôn ngữ (Multilingual Support):** Hỗ trợ tốt cả tiếng Việt và tiếng Anh, phù hợp cho cả thị trường trong nước và quốc tế.
4.  **Trải nghiệm người dùng cao cấp (Premium UX/UI):** Giao diện Landing Page phong cách Bento Grid hiện đại, mượt mà với các hiệu ứng chuyển động ([Motion](https://motion.dev/), import `motion/react`).
5.  **Tối ưu hóa SEO (Pre-hydration + Dynamic Sync):** Pre-hydration `<script>` trong `index.html` chạy trước React — set đúng title, meta, OG, Twitter, canonical, hreflang (`vi`/`en`/`x-default`), Schema.org (`FAQPage`, `HowTo`, `BreadcrumbList`), và `noindex` cho payment/admin. Hỗ trợ 6 route x 2 ngôn ngữ. `AppContent.tsx` đồng bộ sau mỗi SPA navigation. Sitemap 14 URL với `xhtml:link` hreflang. Legacy paths redirect 301. Xem chi tiết: [3_frontend.md](3_frontend.md).
6.  **Bảo mật & Riêng tư (Security & Privacy):** Dữ liệu CV qua Supabase (RLS, Auth, Storage); API proxy giữ secret phía server (Gemini, reCAPTCHA, Resend). Không commit `.env`, khóa riêng, cache CLI (`supabase/.temp/`) — xem `.gitignore` và [Triển khai §5](7_deployment.md#5-bảo-mật-mã-nguồn-và-bi-mật).
7. **Kiến trúc Mobile-First (Mobile-First Design):** Tối ưu hóa trải nghiệm trên thiết bị di động với Bottom Navigation, Bottom Sheets và giao diện thích ứng linh hoạt, đảm bảo tính ergonomic cho người dùng.

## Tính năng nổi bật (Key Features)

-   **Phân tích CV đa định dạng:** Hỗ trợ PDF, DOCX và hình ảnh (OCR). Đặc biệt tích hợp Gemini 3.0 Flash: Model AI đa phương thức xử lý trực tiếp file nhị phân (PDF/Image) qua Vision API với độ chính xác cao.
-   **Trích xuất JD thông minh:** Lấy dữ liệu JD từ văn bản thuần túy hoặc từ đường link tuyển dụng.
-   **Chấm điểm tương thích (Matching Score):** Đánh giá mức độ phù hợp giữa CV và JD theo tỷ lệ phần trăm.
-   **Phân tích khoảng trống kỹ năng (Skill Gap):** Chỉ ra những kỹ năng còn thiếu mà ứng viên cần bổ sung.
-   **Gợi ý chỉnh sửa (Rewrite Suggestions):** Đề xuất cách viết lại từng phần trong CV để tăng tính thuyết phục.
-   **CV Tối ưu (Optimized CV):** AI tự động tạo ra một bản thảo CV mới đã được tối ưu hóa hoàn toàn dựa trên thông tin gốc của ứng viên.
-   **Kho lưu trữ JD cá nhân (JD Store):** Lưu lại các mô tả công việc mẫu để tái sử dụng nhanh chóng cho nhiều đợt tuyển dụng khác nhau.
-   **Kho lưu trữ CV (CV Store):** Lưu trữ file CV trên Supabase Storage để tái sử dụng mà không cần tải lên nhiều lần. Free: tối đa 1 CV, Pro: 10 CV. Hỗ trợ upload, download, xóa, và thông báo lưu thành công.
-   **Gói Pro & Recruiter (PayOS):** Người dùng có thể nâng cấp lên gói **Pro** (69.000 VNĐ/tháng) hoặc **Recruiter** (499.000 VNĐ/tháng) qua [PayOS](https://payos.vn/). Gói Pro: 100 lượt phân tích/tháng, batch 5 CV, kho JD không giới hạn. Gói Recruiter: 500 lượt, batch 50 CV, 10 đợt tuyển dụng với upload hàng loạt, xếp hạng tự động, xuất Excel, ghi chú nội bộ HR. Thanh toán được xử lý qua PayOS với webhook xác thực HMAC-SHA256.
-   **Lịch sử & Quản trị:** Người dùng xem lại lịch sử phân tích; admin quản lý user, quyền, và **hạn mức phân tích/tháng** (mặc định **20** lượt, cấu hình runtime qua `app_settings` — không cần deploy lại khi đổi default).

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
