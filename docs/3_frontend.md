# Kiến trúc Frontend (CV Compare)

Frontend của dự án **CV Compare** được thiết kế để xử lý việc so sánh đồng thời nhiều hồ sơ năng lực với một bảng mô tả công việc (JD). Toàn bộ mã nguồn nằm trong thư mục `src/`.

## Cấu trúc thư mục (Modular Architecture)

Ứng dụng được cấu trúc theo hướng mô-đun hóa để dễ dàng bảo trì và mở rộng:

-   **`src/context/`**: Quản lý trạng thái toàn cục (Global State) thông qua React Context API.
    -   `AuthContext.tsx`: Quản lý xác thực Firebase và thông tin người dùng.
    -   `UIContext.tsx`: Quản lý giao diện, ngôn ngữ, tab hiện tại và trạng thái các Modals.
    -   `AnalysisContext.tsx`: Quản lý toàn bộ logic phân tích, dữ liệu JD/CV và kết quả.
-   **`src/components/views/`**: Chia ứng dụng thành các màn hình riêng biệt:
    -   `LandingView.tsx`: Trang giới thiệu và đăng nhập (Bố cục Bento Grid, tối ưu chuyển động).
    -   `DashboardView.tsx`: Giao diện làm việc chính (Nhập dữ liệu, Phân tích, Kết quả).
    -   `HistoryView.tsx`: Quản lý lịch sử phân tích và Dashboard thống kê.
    -   `AdminView.tsx`: Trang quản trị dành cho người dùng có quyền Admin.
-   **`src/lib/`**: Thư mục chứa các hàm tiện ích (`utils.ts`) và cấu hình thư viện dùng chung.
-   **`src/services/geminiService.ts`**: Xử lý giao tiếp với Gemini AI và Firebase Firestore.

## Các luồng xử lý chính

### 1. Quản lý trạng thái tập trung
Thay vì lưu trữ logic trong `App.tsx`, mọi dữ liệu và hành động được tập trung trong các `Context Providers`. Điều này giúp các component con có thể truy cập dữ liệu dễ dàng mà không cần truyền prop (Prop Drilling).

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
-   **Collapsible Sidebar:** Tối ưu không gian hiển thị với thanh điều hướng có thể thu gọn, giúp tập trung vào nội dung phân tích.
-   **In-App Browser detection:** Cảnh báo người dùng khi truy cập từ Zalo/Facebook để đảm bảo quyền đăng nhập Google.
-   **Dynamic SEO Sync:** Metadata (Title, Description, OG Tags) được đồng bộ hóa động trong `App.tsx` dựa trên ngôn ngữ báo cáo, giúp tối ưu hóa hiển thị trên các công cụ tìm kiếm và mạng xã hội.
-   **Performance (Lazy Loading):** Áp dụng `React.lazy` và `Suspense` cho các View lớn để giảm thời gian tải trang ban đầu và tối ưu hóa tài nguyên trình duyệt.
