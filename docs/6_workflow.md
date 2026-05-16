# Quy trình hoạt động (CV Compare Workflow)

Dưới đây là mô tả quy trình so sánh hồ sơ năng lực (CV) ứng viên với mô tả công việc (JD).

## 1. Luồng phân tích đồng thời (Batch Analysis Flow)

```mermaid
graph TD
    A[Người dùng] -->|1. Cung cấp JD| B[Nhập văn bản / Link / Kho lưu trữ]
    A -->|2. Tải nhiều CV| C[Danh sách Files / Văn bản]
    C --> D[Vòng lặp: Phân tích từng CV]
    D --> E{Định dạng file?}
    E -->|Văn bản/Docx| F[Frontend: Extract Text]
    E -->|PDF (server)| G[Vercel: POST /api/extract-pdf \n hoặc Express: /api/extract-pdf/extract]
    F --> H[Chuẩn bị Payload Gemini]
    G --> I[Gemini: Multimodal Direct]
    H --> I
    I --> J[AI: So khớp & Đánh giá]
    I --> J[Tích lũy kết quả vào mảng Results]
    D -.->|Lặp đến hết danh sách| C
    J --> K[Hiển thị bảng so khớp & Phân tích chi tiết]
    K --> L[Lưu vào lịch sử Supabase]
```

### Các bước trọng tâm:
1.  **Thu thập JD:** JD có thể được lấy từ nhiều nguồn: nhập tay trực tiếp, trích xuất tự động từ đường link tuyển dụng hoặc chọn nhanh từ **Kho lưu trữ JD cá nhân (JD Store)** đã được lưu trước đó.
2.  **Xử lý hàng loạt:** Khác với các công cụ đơn lẻ, **CV Compare** được tối ưu để xử lý một danh sách ứng viên, giúp nhà tuyển dụng tiết kiệm thời gian khi sàng lọc.
3.  **So sánh chi tiết (Detailed Comparison):** AI không chỉ chấm điểm mà còn chỉ ra minh chứng trực tiếp (`cvEvidence`) từ hồ sơ để giải thích tại sao một yêu cầu được coi là "Đạt" (Matched) hoặc "Thiếu" (Missing).

## 2. Luồng tối ưu hóa & Xuất bản

1.  Từ kết quả so sánh, người dùng có thể chọn một kết quả cụ thể để xem chi tiết.
2.  **Optimization:** AI đề xuất cách viết lại CV để khớp 100% với JD đó.
3.  **Export:** In (`PrintView` / `window.print()`) xuất CV Markdown đã tối ưu; có sao chép Markdown / plain text từ tab Optimization.
4.  **Hiển thị CV tối ưu:** `fullRewrittenCV` (Markdown GFM từ Gemini) được chuẩn hoá bởi `fullRewrittenCvMarkdown.ts` và render qua `CvMarkdownBody.tsx` (sanitize + typography `.cv-markdown-specimen`).

## 3. Quản lý dữ liệu

-   **History:** Kết quả so sánh được lưu trữ theo tài khoản người dùng, cho phép xem lại các lần so sánh trước đó.
-   **Admin:** Quản trị viên có thể theo dõi số lượng sử dụng (`usageCount`) và quản lý quyền hạn của người dùng trong hệ thống.
