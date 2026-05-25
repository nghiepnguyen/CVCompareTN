# Quy trình hoạt động (CV Compare Workflow)

Dưới đây là mô tả quy trình so sánh hồ sơ năng lực (CV) ứng viên với mô tả công việc (JD).

## 1. Luồng phân tích đồng thời (Batch Analysis Flow)

```mermaid
graph TD
    A[Người dùng] -->|1. Cung cấp JD| B[Nhập văn bản / Link / Kho lưu trữ]
    A -->|2. Tải nhiều CV| C[Danh sách Files / Văn bản]
    C --> Q{RPC check_analytics_quota}
    Q -->|không đủ quota| X[Dừng - thông báo vượt hạn mức tháng]
    Q -->|allowed| D[Vòng lặp: Phân tích từng CV]
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
    J --> M[increment_usage_count mỗi CV thành công]
```

### Các bước trọng tâm:
1.  **Thu thập JD:** JD có thể được lấy từ nhiều nguồn: nhập tay trực tiếp, trích xuất tự động từ đường link tuyển dụng hoặc chọn nhanh từ **Kho lưu trữ JD cá nhân (JD Store)** (`SavedJdContext` / modal trong `AppContent`). Lưu JD mới: `confirmSaveJD(title, jdContent)`.
2.  **Kiểm tra hạn mức tháng:** Trước khi gọi Gemini, `AnalysisRunContext` gọi RPC `check_analytics_quota` với số CV dự kiến trong batch. Hạn mức lấy từ `app_settings.default_monthly_analytics_limit` (mặc định **20**, đổi qua Admin/SQL không cần deploy) hoặc override trên `profiles`. Xem [8_analytics.md](8_analytics.md).
3.  **Xử lý hàng loạt:** Khác với các công cụ đơn lẻ, **CV Compare** được tối ưu để xử lý một danh sách ứng viên, giúp nhà tuyển dụng tiết kiệm thời gian khi sàng lọc.
4.  **So sánh chi tiết (Detailed Comparison):** AI không chỉ chấm điểm mà còn chỉ ra minh chứng trực tiếp (`cvEvidence`) từ hồ sơ để giải thích tại sao một yêu cầu được coi là "Đạt" (Matched) hoặc "Thiếu" (Missing).

## 2. Luồng tối ưu hóa & Xuất bản

1.  Từ kết quả so sánh, người dùng có thể chọn một kết quả cụ thể để xem chi tiết.
2.  **Optimization:** AI đề xuất cách viết lại CV để khớp 100% với JD đó.
3.  **Export:** In (`PrintView` / `window.print()`) xuất CV Markdown đã tối ưu; có sao chép Markdown / plain text từ tab Optimization.
4.  **Hiển thị CV tối ưu:** `fullRewrittenCV` (Markdown GFM từ Gemini) được chuẩn hoá bởi `fullRewrittenCvMarkdown.ts` và render qua `CvMarkdownBody.tsx` (sanitize + typography `.cv-markdown-specimen`).

## 4. Luồng thanh toán Pro (PayOS Flow)

```mermaid
graph TD
    A[Người dùng Free] -->|Nâng cấp| B[UpgradeView]
    B -->|createProCheckout| C[POST /api/payment/create]
    C --> D[PayOS: tạo link thanh toán]
    D -->|redirect| E[PayOS checkout page]
    E -->|success| F[/payment/success]
    E -->|cancel| G[/payment/cancel]
    F -->|poll 2s / max 15 lần| H{plan === 'pro'?}
    H -->|chưa| F
    H -->|rồi| I[Hiển thị thành công → redirect Dashboard]
    D -.->|webhook async| J[POST /api/payment/webhook]
    J -->|verify HMAC-SHA256| K[activate_pro_plan RPC]
    K --> L[profiles.plan='pro', payments.status='paid']
    L -.->|poll phát hiện| H
```

- **UpgradeView** (`src/components/views/UpgradeView.tsx`): Bảng so sánh Free vs Pro, nút "Nâng cấp ngay — 69.000đ/tháng".
- **paymentService** (`src/services/paymentService.ts`): Gọi `POST /api/payment/create` với Bearer token, nhận `checkoutUrl`, redirect.
- **PaymentSuccessView** (`src/components/views/PaymentSuccessView.tsx`): Polling Supabase mỗi 2s kiểm tra `plan`, tối đa 30s. Khi phát hiện `plan='pro'`, hiển thị xác nhận và auto-redirect về Dashboard sau 4s.
- **PaymentCancelView** (`src/components/views/PaymentCancelView.tsx`): Thông báo hủy, nút "Quay lại phân tích".
- **Enforcement:** Các feature gate (export, batch > 1, JD unlimited) kiểm tra `isProPlan()` từ `planLimits.ts`. Nếu Free, hiển thị `UpgradePrompt` (`src/components/shared/UpgradePrompt.tsx`).

## 5. Quản lý dữ liệu

-   **History:** Kết quả so sánh được lưu trữ theo tài khoản người dùng, cho phép xem lại các lần so sánh trước đó.
-   **Admin:** Theo dõi `usageCount` / hạn mức tháng; cấu hình **mặc định hệ thống** (`app_settings`, ví dụ 20 lượt/tháng); override hoặc unlimited từng user. Chi tiết: [8_analytics.md](8_analytics.md).
