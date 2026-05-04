# Hướng dẫn Triển khai (Deployment Guide)

Dự án **CV Compare** có thể được triển khai trên nhiều nền tảng khác nhau. Dưới đây là hướng dẫn chi tiết cho hai nền tảng phổ biến nhất đã được cấu hình sẵn: **Firebase Hosting** và **Render**.

## 1. Triển khai trên Firebase (Khuyên dùng)

Hệ thống đã được cấu hình để sử dụng Firebase Hosting kết hợp với Firebase Functions cho Backend.

### Các bước thực hiện:

1.  **Cài đặt Firebase CLI:**
    ```bash
    npm install -g firebase-tools
    ```

2.  **Đăng nhập và chọn dự án:**
    ```bash
    firebase login
    firebase use <your-project-id>
    ```

3.  **Xây dựng bản build (Frontend):**
    ```bash
    npm run build
    ```

4.  **Xây dựng bản build (Backend/Functions):**
    ```bash
    cd functions
    npm run build
    cd ..
    ```

5.  **Deploy:**
    -   Triển khai toàn bộ (Hosting + Functions + Rules):
        ```bash
        firebase deploy
        ```
    -   Chỉ triển khai Hosting:
        ```bash
        firebase deploy --only hosting
        ```

## 2. Triển khai trên Render

Render phù hợp nếu bạn muốn chạy ứng dụng dưới dạng một Node.js server hoàn chỉnh (sử dụng `server.ts`).

### Cấu hình trong `render.yaml`:
Dự án đã có sẵn file cấu hình Blueprint cho Render. Khi bạn kết nối GitHub với Render, hãy chọn "Blueprint" và nó sẽ tự động nhận diện:

-   **Build Command:** `npm install && npm run build`
*   **Start Command:** `npm start` (Sử dụng `tsx server.ts`)

### Các biến môi trường cần thiết:
Dù triển khai ở đâu, bạn PHẢI cấu hình các biến môi trường sau trong bảng điều khiển (Dashboard) của nhà cung cấp hosting:

| Biến | Mô tả |
| :--- | :--- |
| `GEMINI_API_KEY` | API Key từ Google AI Studio. |
| `RECAPTCHA_SECRET_KEY` | Secret Key từ Google reCAPTCHA v3. |
| `RESEND_API_KEY` | API Key từ Resend.com. |
| `VITE_ADMIN_EMAIL` | Email có quyền truy cập trang Admin. |
| `NODE_ENV` | Đặt là `production`. |

---

## Lưu ý về Local Development

Trong quá trình phát triển tại `localhost`, hệ thống sẽ:
-   Tự động bỏ qua xác thực reCAPTCHA để thuận tiện cho việc test.
-   Sử dụng cấu hình từ file `.env`.

Khi lên production, hãy đảm bảo các biến môi trường đã được thiết lập đầy đủ để tránh lỗi `500` khi gọi API.
