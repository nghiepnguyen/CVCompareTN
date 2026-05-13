# Danh sách API Endpoints (CV Compare)


Dưới đây là các API chính được sử dụng trong hệ thống, bao gồm API nội bộ (Backend Proxy) và các dịch vụ bên ngoài (Firebase/Service).

## 1. Internal API (Backend Proxy)

Tất cả các endpoint đều có tiền tố `/api`.

### `GET /api/config`
-   **Mục đích:** Trả về các cấu hình công khai (như API Key của AI).
-   **Response:** `{ GEMINI_API_KEY: string }`.

### `POST /api/extract-pdf`
-   **Mục đích:** Trích xuất văn bản từ file PDF/DOCX dạng base64.
-   **Request Body:** `{ base64Data: string }`.
-   **Response:** `{ text: string }`.

### `POST /api/verify-recaptcha`
-   **Mục đích:** Xác thực người dùng thông qua Google reCAPTCHA v3.
-   **Request Body:** `{ token: string }`.
-   **Response:** JSON từ Google Site Verify API.

### `POST /api/send-feedback`
-   **Mục đích:** Gửi phản hồi của người dùng qua email.
-   **Request Body:** `{ token, rating, title, content, userEmail }`.
-   **Yêu cầu:** Phải thông qua xác thực reCAPTCHA ở phía backend trước khi gửi.

## 2. Dịch vụ lưu trữ (Firebase)

Hệ thống tương tác trực tiếp với Firebase từ Frontend qua SDK.

-   **Auth:** `signInWithPopup` (Google Provider).
-   **Firestore Collections:**
    -   `users`: Lưu hồ sơ, quyền hạn (`role`), trạng thái (`isRead`).
    -   `history`: Lưu kết quả phân tích CV theo `userId`.
    -   `saved_jds`: Lưu các mô tả công việc mà người dùng muốn giữ lại.

## 3. Google Gemini AI Service

Tất cả các yêu cầu phân tích đều được thực hiện thông qua `src/services/aiService.ts`.

### `analyzeCV(cvData, jdText, language, isBinary?)`
-   **Logic:** Hỗ trợ cả văn bản thuần túy và dữ liệu nhị phân (Base64). Khi xử lý PDF/Hình ảnh, hệ thống gửi trực tiếp file cho Gemini qua tính năng Multimodal.
-   **Model:** `gemini-3-flash-preview` (Gemini 3 Flash).
-   **Kết quả:** Trả về Object `AnalysisResult` chứa toàn bộ thông tin điểm số, so sánh và gợi ý tối ưu.

### `extractTextFromImage(base64Data)`
-   **Mục đích:** Sử dụng tính năng Vision của Gemini để thực hiện OCR cho CV dạng ảnh.

### `extractJDFromUrl(url)`
-   **Mục đích:** AI truy cập (nếu model hỗ trợ) hoặc phân tích nội dung text được gửi kèm từ URL tuyển dụng.
