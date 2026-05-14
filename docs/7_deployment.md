# Hướng dẫn Triển khai (Deployment Guide)

Dự án **CV Matcher & Optimizer** được triển khai theo mô hình **Vercel Native**, tích hợp cả Frontend (React/Vite) và Backend (Serverless Functions) trên cùng một hạ tầng Vercel.

## 1. Triển khai trên Vercel

Vercel phục vụ cả ứng dụng React và các hàm API trong thư mục `/api`.

### Các bước thực hiện:

1.  **Kết nối GitHub:** Đẩy mã nguồn lên GitHub và kết nối project với Vercel.
2.  **Cấu hình Environment Variables:** Trong Dashboard của Vercel, hãy thiết lập các biến môi trường sau:
    -   `GEMINI_API_KEY`: API Key từ Google AI Studio.
    -   `RECAPTCHA_SECRET_KEY`: Secret Key cho reCAPTCHA v3.
    -   `RESEND_API_KEY`: API Key từ Resend.com.
    -   `RESEND_FROM_EMAIL`: Email gửi đi (phải được verify trên Resend).
    -   `FEEDBACK_RECIPIENT_EMAIL`: Email nhận thông báo góp ý.
    -   `VITE_ADMIN_EMAIL`: Email có quyền truy cập trang Admin.
3.  **Cấu hình Frontend (Client-side):** Các biến có tiền tố `VITE_` sẽ được nhúng vào mã nguồn khi build.
4.  **Tự động triển khai:** Vercel sẽ tự động nhận diện thư mục `/api` và triển khai chúng dưới dạng Serverless Functions dựa trên cấu hình trong `vercel.json`.

## 2. Cấu hình Firebase (Bắt buộc)

Ứng dụng sử dụng Firebase cho việc xác thực người dùng và lưu trữ dữ liệu Firestore.

### Các bước thực hiện:

1.  **Tạo dự án Firebase:** Truy cập [Firebase Console](https://console.firebase.google.com/).
2.  **Bật Authentication:** Kích hoạt phương thức đăng nhập bằng Google.
3.  **Authorized Domains:** Quan trọng! Thêm domain của bạn (ví dụ: `cv.thanhnghiep.top`) và các domain preview của Vercel vào danh sách Authorized Domains trong Firebase.
4.  **Bật Firestore Database:** Tạo database ở chế độ production.
5.  **Triển khai Security Rules:**
    ```bash
    firebase deploy --only firestore:rules
    ```

## 3. Chế độ Phát triển (Local Development)

Để chạy ứng dụng ở môi trường local với đầy đủ tính năng API:

1.  **Cài đặt Vercel CLI:** `npm install -g vercel`
2.  **Chạy lệnh:** `npm run vercel-dev` hoặc `vercel dev`.
3.  Lệnh này sẽ khởi tạo một local server tại `http://localhost:3000` mô phỏng môi trường Serverless của Vercel.

## 4. Cấu hình Điều hướng (vercel.json)

Tệp `vercel.json` ở thư mục gốc đóng vai trò quan trọng trong việc định tuyến:

-   **Rewrites:** Điều hướng các request `/api/:path*` vào đúng thư mục `/api`.
-   **SPA Support:** Đảm bảo các route của React (như `/history`, `/admin`) luôn trả về `index.html` thay vì lỗi 404 khi người dùng tải lại trang.
