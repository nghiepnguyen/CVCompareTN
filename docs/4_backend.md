# Kiến trúc Backend (Serverless Functions)

Hệ thống sử dụng mô hình **Serverless Architecture** triển khai trên nền tảng Vercel. Thay vì duy trì một server Express chạy liên tục, các tác vụ backend được chia nhỏ thành các hàm Lambda độc lập trong thư mục `/api`.

## Cấu trúc & Runtime
-   **Thư mục:** `/api/*.ts` (Ví dụ: `api/config.ts`, `api/extract-pdf.ts`).
-   **Runtime:** Node.js 20.x hoặc mới nhất hỗ trợ bởi Vercel.
-   **Ngôn ngữ:** TypeScript.

## Các chức năng chính

### 1. Phân phối cấu hình (`api/config.ts`)
-   Cung cấp các API Key (như reCAPTCHA Site Key) cho Frontend mà không cần hard-code.
-   **Endpoint:** `GET /api/config`.

### 2. Trích xuất nội dung PDF (`api/extract-pdf.ts`)
-   Sử dụng thư viện `pdf-parse` để trích xuất văn bản từ file nhị phân (Buffer).
-   Xử lý phía server giúp tránh các lỗi giới hạn tài nguyên của trình duyệt khi xử lý file lớn.
-   **Endpoint:** `POST /api/extract-pdf`.

### 3. Xác thực reCAPTCHA (`api/verify-recaptcha.ts`)
-   Xác thực token từ Frontend với Google Site Verify.
-   **Bypass Logic:** Hệ thống tự động bỏ qua xác thực nếu phát hiện request đến từ `localhost` hoặc `127.0.0.1` để tối ưu trải nghiệm phát triển.
-   **Endpoint:** `POST /api/verify-recaptcha`.

### 4. Hệ thống Email (`api/send-feedback.ts` & `api/send-welcome-email.ts`)
-   Tích hợp với dịch vụ **Resend**.
-   `send-feedback`: Gửi góp ý của người dùng về email quản trị viên.
-   `send-welcome-email`: Tự động gửi email chào mừng khi có người dùng mới đăng ký qua Google.
-   **Endpoint:** `POST /api/send-feedback`.

## Biến môi trường (Environment Variables)

Các biến này cần được cấu hình trong **Vercel Project Settings > Environment Variables**:

```env
GEMINI_API_KEY=          # Google AI API Key
RECAPTCHA_SECRET_KEY=    # Google reCAPTCHA v3 Secret
RESEND_API_KEY=          # Resend Platform API Key
RESEND_FROM_EMAIL=       # Email gửi đi (từ domain đã verify trên Resend)
FEEDBACK_RECIPIENT_EMAIL= # Email nhận phản hồi
```

## Security & Routing
-   **CORS:** Được cấu hình tự động bởi Vercel.
-   **Body Limit:** Vercel Serverless mặc định giới hạn body size, cần lưu ý khi upload file CV rất lớn (khuyên dùng dưới 4MB cho gói Free).
-   **Routing:** File `vercel.json` định nghĩa các quy tắc `rewrites` để điều hướng request giữa API và Frontend SPA.
