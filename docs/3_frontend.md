# Kiến trúc Frontend (CV Compare)

Frontend của dự án **CV Compare** được thiết kế để xử lý việc so sánh đồng thời nhiều hồ sơ năng lực với một bảng mô tả công việc (JD). Toàn bộ mã nguồn nằm trong thư mục `src/`.

## Cấu trúc thư mục (Modular Architecture)

Ứng dụng được cấu trúc theo hướng mô-đun hóa để dễ dàng bảo trì và mở rộng:

-   **`src/context/`**: Quản lý trạng thái toàn cục (Global State) thông qua React Context API.
    -   `AuthContext.tsx`: Quản lý xác thực Supabase và thông tin người dùng.
    -   `UIContext.tsx`: Quản lý giao diện, ngôn ngữ, tab hiện tại và trạng thái các Modals.
    -   `AnalysisContext.tsx`: Quản lý toàn bộ logic phân tích, dữ liệu JD/CV và kết quả.
-   **`src/components/views/`**: Chia ứng dụng thành các màn hình riêng biệt:
    -   `LandingView.tsx`: Trang giới thiệu và đăng nhập (Bố cục Bento Grid, tối ưu chuyển động).
    -   `DashboardView.tsx`: Giao diện làm việc chính (Bố cục song song CV/JD, Phân tích, Kết quả tập trung).
    -   `HistoryView.tsx`: Quản lý lịch sử phân tích và Dashboard thống kê.
    -   `AdminView.tsx`: Trang quản trị dành cho người dùng có quyền Admin.
-   **`src/lib/`**: Thư mục chứa các hàm tiện ích (`utils.ts`) và cấu hình thư viện dùng chung.
-   **`src/services/`**:
    -   **`ai/`**: Gemini (`analysisService`, `extractionService`, …), chuẩn hoá payload (`resultPayloadNormalize.ts`, `parsedCvNormalize.ts`), **`fullRewrittenCvMarkdown.ts`** (Markdown GFM + nâng plain text khi model không trả `#`/`##`).
    -   **CV tối ưu (UI):** `CvMarkdownBody.tsx` + typography token `.cv-markdown-specimen` trong `index.css`.
    -   **Supabase:** `userService`, `historyService`, `storageService`.

## Các luồng xử lý chính

### 1. Quản lý trạng thái tập trung
Thay vì lưu trữ logic trong `App.tsx`, mọi dữ liệu và hành động được tập trung trong các `Context Providers`. Điều này giúp các component con có thể truy cập dữ liệu dễ dàng mà không cần truyền prop (Prop Drilling).

### 2. Xử lý đa định dạng (Multi-format Support)
-   Hỗ trợ trích xuất văn bản từ: `.pdf`, `.docx`, `.txt`.
-   Hỗ trợ OCR từ hình ảnh: `.jpg`, `.png`, `.webp` thông qua tính năng Vision của Gemini.

### 3. Hiển thị kết quả so sánh
-   **Matching Score:** Điểm số tổng quát thể hiện mức độ khớp.
-   **Detailed Comparison:** Bảng đối chiếu từng yêu cầu trong JD với minh chứng từ CV (cvEvidence) và gợi ý cải thiện (improvement).
-   **Biểu đồ (Recharts):** Tab chi tiết dùng **Bar chart** (điểm theo nhóm) và **Pie chart** (phân bố matching points theo category); **History** có Area/Bar khi có đủ dữ liệu lịch sử. Container chart dùng chiều cao cố định + `ResponsiveContainer` để tránh cảnh báo kích thước.
-   **Optimized Readability:** Kết quả phân tích được giới hạn chiều rộng tối đa 900px, tạo trải nghiệm đọc "như văn bản in" (editorial-grade), giảm mỏi mắt cho nhà tuyển dụng.

## Điểm nhấn UX
-   **Real-time Progress:** Hiển thị tiến trình phân tích cho từng file khi xử lý hàng loạt.
-   **Multi-language:** Hỗ trợ chuyển đổi ngôn ngữ báo cáo (Tiếng Việt/Tiếng Anh) một cách tức thì.
-   **Collapsible Sidebar:** Tối ưu không gian hiển thị với thanh điều hướng có thể thu gọn, giúp tập trung vào nội dung phân tích.
-   **In-App Browser detection:** Cảnh báo người dùng khi truy cập từ Zalo/Facebook để đảm bảo quyền đăng nhập Google.
-   **Dynamic SEO Sync:** Metadata (Title, Description, OG Tags) được đồng bộ hóa động trong `App.tsx` dựa trên ngôn ngữ báo cáo, giúp tối ưu hóa hiển thị trên các công cụ tìm kiếm và mạng xã hội.
-   **Performance (Lazy Loading):** Áp dụng `React.lazy` và `Suspense` cho các View lớn để giảm thời gian tải trang ban đầu.
-   **Thiết kế Industrial Utilitarian:** 
    - Ngôn ngữ thiết kế tập trung vào sự chính xác, các đường nét rõ ràng và phản hồi xúc giác cao cấp.
    - Sử dụng `layoutId` của Motion (`motion/react`) để hiệu ứng "sliding pill" khi chuyển tab kết quả.
    - Thanh điều hướng kết quả tích hợp **"Scan Line"** - hiệu ứng đường quét chạy theo tiến trình xem báo cáo, tạo cảm giác về một hệ thống phân tích dữ liệu chuyên nghiệp.
-   **Mobile-First Optimization:** 
    - **Bottom Navigation:** Thanh điều hướng cố định phía dưới màn hình trên mobile giúp thao tác bằng một tay dễ dàng.
    - **Sticky Results Nav:** Thanh điều hướng các phần của kết quả (Analyze, Comparison...) luôn dính ở phía trên để dễ dàng chuyển đổi nội dung dài mà không cần cuộn ngược lên.
    - **Smart Auto-Scroll:** Tự động căn chỉnh vị trí màn hình khi chuyển tab báo cáo, đảm bảo người dùng luôn đọc từ đầu mục nội dung mới.
    - **Bottom Sheets:** Chuyển đổi các Modals thành dạng vuốt từ dưới lên trên thiết bị di động.
    - **Adaptive Layouts:** Chuyển đổi bảng dữ liệu thành dạng thẻ (Cards) và tối ưu hóa padding cho màn hình nhỏ.
-   **Instant Startup:** Tối ưu hóa luồng khởi tạo (System initialization) bằng cách song song hóa việc kiểm tra Auth và Redirect Result, giúp ứng dụng sẵn sàng sử dụng chỉ sau ~100-200ms.
