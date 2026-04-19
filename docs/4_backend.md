# Kiến trúc Backend (CV Compare Proxy)


Backend hoạt động như một **API Proxy Server**, giải quyết các vấn đề về bảo mật (giấu API Key), vượt rào CORS, và xử lý các tác vụ nặng mà trình duyệt không làm tốt.

## Cấu trúc chính
-   **File:** `server.ts`
-   **Runtime:** Node.js (thực thi qua `tsx`).
-   **Web Framework:** Express 5.0.

## Vai trò của Backend

### 1. Phân phối cấu hình bảo mật
-   Cung cấp các API Key cần thiết cho Frontend mà không cần hard-code trong mã nguồn client.
-   Endpoint: `GET /api/config`.

### 2. Trích xuất nội dung PDF
-   Sử dụng `pdf-parse` để đọc dữ liệu từ Buffer. Việc xử lý trên server giúp hỗ trợ nhiều định dạng PDF phức tạp hơn so với xử lý thuần client-side.
-   Endpoint: `POST /api/extract-pdf`.

### 3. Xác thực reCAPTCHA
-   Giao tiếp trực tiếp với Google Site Verify để xác nhận token từ Frontend. Đây là bước bắt buộc để đảm bảo an toàn cho các tính năng gửi email.
-   Endpoint: `POST /api/verify-recaptcha`.

### 4. Gửi Email (Feedback System)
-   Tích hợp với dịch vụ Resend.
-   Tự động định dạng nội dung HTML cho email phản hồi từ người dùng.
-   Endpoint: `POST /api/send-feedback`.

### 5. Phục vụ ứng dụng (Static Serving)
-   Trong môi trường Production, backend phục vụ trực tiếp thư mục `dist/` (kết quả build từ Vite).
-   Xử lý routing SPA bằng cách redirect tất cả các request không phải API về `index.html`.

## Biến môi trường (Environment Variables)

Hệ thống yêu cầu các biến sau trong file `.env`:

```env
GEMINI_API_KEY=          # Google AI API Key
RECAPTCHA_SECRET_KEY=    # Google reCAPTCHA v3 Secret
RESEND_API_KEY=          # Resend Platform API Key
FEEDBACK_RECIPIENT_EMAIL= # Email nhận phản hồi
```

## Security & Performance
-   Sử dụng Middleware `cors` để kiểm soát quyền truy cập.
-   Giới hạn dung lượng body request (`50mb`) để hỗ trợ upload các file CV lớn.
-   Tích hợp Vite Middleware trong chế độ phát triển (Development) để hỗ trợ Hot Module Replacement (HMR).
