# Công nghệ sử dụng (CV Compare)

Dự án được xây dựng trên một nền tảng công nghệ hiện đại, tập trung vào hiệu suất, khả năng mở rộng và trải nghiệm người dùng.

## Frontend

-   **Framework:** [React 19](https://react.dev/) - Tận dụng các tính năng mới nhất để tối ưu hiệu suất.
-   **Build Tool:** [Vite 6](https://vitejs.dev/) - Đảm bảo tốc độ phát triển và build cực nhanh.
-   **Styling:** [Tailwind CSS 4](https://tailwindcss.com/) - Sử dụng Engine mới nhất cho việc thiết kế UI nhanh chóng và nhất quán.
-   **Animations:** [Framer Motion (motion/react)](https://motion.dev/) - Tạo các hiệu ứng chuyển cảnh và tương tác mượt mà.
-   **Icons:** [Lucide React](https://lucide.dev/) - Bộ icon vector đa dạng và hiện đại.
-   **Data Visualization:** [Recharts](https://recharts.org/) - Hiển thị biểu đồ phân tích điểm số trực quan.
-   **Analytics:** [Vercel Analytics](https://vercel.com/analytics) - Theo dõi hiệu suất và tương tác người dùng theo thời gian thực.
-   **State Management:** React Hooks (useState, useEffect, useMemo) kết hợp với Firebase Context.

## Backend (Serverless)

-   **Runtime:** [Node.js](https://nodejs.org/) (Vercel Serverless Functions).
-   **Architecture:** API Routes nằm trong thư mục `/api`, tự động triển khai thành các hàm Lambda trên Vercel.
-   **PDF/Docx Processing:**
    -   `Gemini 3.0 Flash`: Model AI đa phương thức xử lý trực tiếp file nhị phân (PDF/Image) qua Vision API.
    -   `mammoth`: Chuyển đổi tệp .docx sang văn bản thuần túy.
    -   `pdf-parse`: Hỗ trợ trích xuất văn bản từ PDF truyền thống.
-   **Security:** `Google reCAPTCHA v3` để bảo vệ các endpoint API nhạy cảm.

## Trí tuệ nhân tạo (AI)

-   **Engine:** [Google Gemini AI](https://deepmind.google/technologies/gemini/) - Sử dụng model `gemini-3-flash-preview` cho hiệu suất và trí tuệ vượt trội.
-   **Multimodal capabilities:** Có khả năng "nhìn" và hiểu trực tiếp các file PDF, hình ảnh mà không cần qua bước trích xuất văn bản trung gian, giúp tăng độ chính xác 40% cho các CV có layout phức tạp.

## Dịch vụ & Cơ sở dữ liệu (Cloud Services)

-   **Firebase:**
    -   **Authentication:** Quản lý đăng nhập người dùng qua Google.
    -   **Firestore:** Lưu trữ hồ sơ người dùng, lịch sử phân tích và cấu hình hệ thống.
    -   **Hosting:** Phục vụ ứng dụng web trên hạ tầng của Google.
-   **Email Service:** [Resend](https://resend.com/) - Gửi email phản hồi (feedback) từ người dùng đến quản trị viên.

## Quản lý mã nguồn & Triển khai

-   **Version Control:** Git & GitHub.
-   **Deployment:** 
    -   **Vercel (Chính):** Phục vụ Frontend và các Serverless Functions (`/api`).
    -   **Firebase:** Quản lý Authentication và Firestore Database.
    -   Chi tiết xem tại [Hướng dẫn triển khai](./7_deployment.md).
