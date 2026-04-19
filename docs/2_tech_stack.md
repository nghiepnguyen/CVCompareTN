# Công nghệ sử dụng (CV Compare)

Dự án được xây dựng trên một nền tảng công nghệ hiện đại, tập trung vào hiệu suất, khả năng mở rộng và trải nghiệm người dùng.

## Frontend

-   **Framework:** [React 19](https://react.dev/) - Tận dụng các tính năng mới nhất để tối ưu hiệu suất.
-   **Build Tool:** [Vite 6](https://vitejs.dev/) - Đảm bảo tốc độ phát triển và build cực nhanh.
-   **Styling:** [Tailwind CSS 4](https://tailwindcss.com/) - Sử dụng Engine mới nhất cho việc thiết kế UI nhanh chóng và nhất quán.
-   **Animations:** [Framer Motion (motion/react)](https://motion.dev/) - Tạo các hiệu ứng chuyển cảnh và tương tác mượt mà.
-   **Icons:** [Lucide React](https://lucide.dev/) - Bộ icon vector đa dạng và hiện đại.
-   **Data Visualization:** [Recharts](https://recharts.org/) - Hiển thị biểu đồ phân tích điểm số trực quan.
-   **State Management:** React Hooks (useState, useEffect, useMemo) kết hợp với Firebase Context.

## Backend (Proxy Server)

-   **Runtime:** [Node.js](https://nodejs.org/) với `tsx` để chạy TypeScript trực tiếp.
-   **Framework:** [Express 5](https://expressjs.com/) - Xử lý các API Proxy và phục vụ ứng dụng.
-   **PDF/Docx Processing:**
    -   `pdf-parse`: Trích xuất dữ liệu từ file PDF.
    -   `mammoth`: Chuyển đổi tệp .docx sang HTML/Văn bản thuần túy.
-   **Security:** `react-google-recaptcha-v3` để ngăn chặn spam và bot.

## Trí tuệ nhân tạo (AI)

-   **Engine:** [Google Gemini AI](https://deepmind.google/technologies/gemini/) - Sử dụng model `gemini-1.5-flash` hoặc `gemini-1.5-pro` thông qua thư viện `@google/genai`.
-   **Capabilities:** Phân tích nội dung, trích xuất thực thể, so khớp ngữ nghĩa và tạo nội dung sáng tạo (rewriting).

## Dịch vụ & Cơ sở dữ liệu (Cloud Services)

-   **Firebase:**
    -   **Authentication:** Quản lý đăng nhập người dùng qua Google.
    -   **Firestore:** Lưu trữ hồ sơ người dùng, lịch sử phân tích và cấu hình hệ thống.
    -   **Hosting:** Phục vụ ứng dụng web trên hạ tầng của Google.
-   **Email Service:** [Resend](https://resend.com/) - Gửi email phản hồi (feedback) từ người dùng đến quản trị viên.

## Quản lý mã nguồn & Triển khai

-   **Version Control:** Git & GitHub.
-   **Deployment:** Hỗ trợ triển khai trên [Render](https://render.com/) hoặc Firebase Hosting.
