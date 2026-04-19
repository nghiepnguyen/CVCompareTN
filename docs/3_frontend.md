# Kiến trúc Frontend (CV Compare)

Frontend của dự án **CV Compare** được thiết kế để xử lý việc so sánh đồng thời nhiều hồ sơ năng lực với một bảng mô tả công việc (JD). Toàn bộ mã nguồn nằm trong thư mục `src/`.

## Cấu trúc thư mục

-   `src/App.tsx`: Chứa logic chính của ứng dụng. Đặc biệt là khả năng lặp qua danh sách file (`files`) để thực hiện phân tích hàng loạt.
-   `src/services/geminiService.ts`: Xử lý giao tiếp với Gemini 3 Flash. Hàm `analyzeCV` nhận dữ liệu văn bản hoặc tệp tin (qua base64) để so khớp.
-   `src/components/`: Chứa các thành phần UI hiển thị kết quả so sánh, biểu đồ Radar và bảng so sánh chi tiết.

## Các luồng xử lý chính

### 1. Phân tích hàng loạt (Batch Processing)
Hệ thống cho phép người dùng chọn cùng lúc nhiều tệp CV. Logic trong `handleAnalyze` sẽ lặp qua từng tệp (`files.length`), gửi yêu cầu tới AI và gộp kết quả vào mảng `results`. Điều này giúp người dùng so sánh nhanh chóng nhiều ứng viên cho cùng một vị trí.

### 2. Xử lý đa định dạng (Multi-format Support)
-   Hỗ trợ trích xuất văn bản từ: `.pdf`, `.docx`, `.txt`.
-   Hỗ trợ OCR từ hình ảnh: `.jpg`, `.png`, `.webp` thông qua tính năng Vision của Gemini.

### 3. Hiển thị kết quả so sánh
-   **Matching Score:** Điểm số tổng quát thể hiện mức độ khớp.
-   **Detailed Comparison:** Bảng đối chiếu từng yêu cầu trong JD với minh chứng từ CV (cvEvidence) và gợi ý cải thiện (improvement).
-   **Radar Chart:** Trực quan hóa 4 nhóm điểm: Skills, Experience, Tools, Education.

## Điểm nhấn UX
-   **Real-time Progress:** Hiển thị tiến trình phân tích cho từng file khi xử lý hàng loạt.
-   **Multi-language:** Hỗ trợ chuyển đổi ngôn ngữ báo cáo (Tiếng Việt/Tiếng Anh) một cách tức thì.
-   **In-App Browser detection:** Cảnh báo người dùng khi truy cập từ Zalo/Facebook để đảm bảo quyền đăng nhập Google.
