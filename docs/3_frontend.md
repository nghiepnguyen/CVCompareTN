# Kiến trúc Frontend (CV Compare)

Frontend của dự án **CV Compare** được thiết kế để xử lý việc so sánh đồng thời nhiều hồ sơ năng lực với một bảng mô tả công việc (JD). Toàn bộ mã nguồn nằm trong thư mục `src/`.

## Cấu trúc thư mục (Modular Architecture)

Ứng dụng được cấu trúc theo hướng mô-đun hóa để dễ dàng bảo trì và mở rộng (refactor **2026-05**, đã merge `main`):

### Entry & shell (`src/app/`)

-   **`src/App.tsx`**: Re-export mặc định → `AppShell` (giữ import path cũ cho Vite).
-   **`src/app/AppShell.tsx`**: Gắn providers (`Auth`, `UI`, `Analysis`), `AppContent`, `AnalyticsBootstrap`, Vercel `<Analytics />`.
-   **`src/app/AppContent.tsx`**: Định tuyến tab/view, layout, lazy-load views, **SEO động** (`document.title`, meta OG), modals JD.
-   **`src/app/AppErrorBoundary.tsx`**: Error boundary toàn app.
-   **`src/app/MobileBottomNav.tsx`**, **`SaveJdNameModal.tsx`**, **`SavedJdsListModal.tsx`**: Điều hướng mobile và modal kho JD.

### Global state (`src/context/`)

-   **`AuthContext.tsx`**: Xác thực Supabase và profile người dùng.
-   **`UIContext.tsx`**: Tab, ngôn ngữ, modals, nhãn UI.
-   **`AnalysisContext.tsx`**: Shim re-export — import từ `./context/analysis` (tương thích code cũ).
-   **`src/context/analysis/`** (hai provider + composer):
    -   `AnalysisRunContext.tsx` — JD/CV, `handleAnalyze`, kết quả, GA4 `analyze_cv` / `analysis_success`, trích JD URL. Đã refactor (**2026-05**): logic `cleanText`/`processFile` trích xuất ra `src/hooks/useFileProcessor.ts`, `createProgressSimulator` trích xuất ra `src/hooks/useProgressSimulator.ts`.
    -   `SavedJdContext.tsx` — kho JD đã lưu, `confirmSaveJD(title, jdContent)`, GA4 `jd_create` (`manual`).
    -   `AnalysisProvider.tsx` — bọc `AnalysisRunProvider` + `SavedJdProvider`.
    -   Hooks: `useAnalysis()` (merged), `useAnalysisRun()`, `useSavedJds()`; types trong `types.ts`.

### Custom hooks (`src/hooks/`)

Được trích xuất từ `AnalysisRunContext` để giữ provider lean và dễ test độc lập:

-   **`useFileProcessor.ts`**: `cleanText()` (chuẩn hóa whitespace/line endings) + `processFile()` (đọc File → base64 data-URL hoặc plain text cho Gemini pipeline).
-   **`useProgressSimulator.ts`**: `createProgressSimulator()` — ease-out quadratic progress, interval-based, trả về `stop()`.

### Test suite (`src/__tests__/`)

Sử dụng **Vitest** (78 tests, 6 test files — cập nhật **2026-05**):

| Test file | Target | Tests |
|-----------|--------|-------|
| `planLimits.test.ts` | `src/lib/planLimits.ts` | 13 |
| `resultPayloadNormalize.test.ts` | `src/services/ai/resultPayloadNormalize.ts` | 23 |
| `services/parsedCvNormalize.test.ts` | `src/services/ai/parsedCvNormalize.ts` | 21 |
| `services/prompts.test.ts` | `src/services/ai/prompts.ts` | 9 |
| `hooks/useFileProcessor.test.ts` | `src/hooks/useFileProcessor.ts` | 7 |
| `hooks/useProgressSimulator.test.ts` | `src/hooks/useProgressSimulator.ts` | 5 |

CI/CD: **GitHub Actions** (`.github/workflows/ci.yml`) — trigger `push`/`PR` trên `main`/`master`, chạy `lint` → `test` → `build`.

### Views (`src/components/views/`)

-   **`LandingView.tsx`**: Orchestrator mỏng (scroll Motion, nền); compose các section trong **`landing/`**:
    -   `HeroSection`, `TrustSection`, `ProblemSection`, `WhyChooseSection`, `HowItWorksSection`, `DemoResultSection`, `StatsSection`, `TargetUsersSection`, `CtaSection`, `FaqSection`
    -   Shared: `landing/shared.tsx` (`BentoCard`, `FeatureIcon`), `landing/types.ts` (`LandingLabels`).
-   **`DashboardView.tsx`**: Workspace chính (CV/JD, phân tích, kết quả).
-   **`UpgradeView.tsx`**: Bảng giá Free vs Pro, gọi `createProCheckout()` → redirect PayOS.
-   **`PaymentSuccessView.tsx`**: Polling Supabase mỗi 2s (tối đa 15 lần) để phát hiện plan activation, tự động redirect Dashboard sau 4s.
-   **`PaymentCancelView.tsx`**: Trang thông báo hủy thanh toán, nút quay lại Dashboard.
-   **`HistoryView.tsx`**, **`AdminView.tsx`**: Lịch sử và quản trị (Admin: cấu hình hạn mức mặc định `app_settings`, override/unlimited từng user — xem [8_analytics.md](8_analytics.md)).
-   Các trang pháp lý / hỗ trợ: lazy-load từ `AppContent` (`TermsOfServicePage`, `PrivacyPolicyPage`, …).

### Khác

-   **`src/lib/`**: `utils.ts`, `supabase.ts`, **GA4 + consent** (`ga4.ts`).
-   **`src/components/layout/CookieConsentBanner.tsx`**: Banner cookie trước khi load GA4.
-   **`src/components/shared/UpgradePrompt.tsx`**: Component tái sử dụng "Tính năng Pro" cho các feature gate.
-   **`src/services/`**:
    -   **`ai/`**: Gemini (`analysisService`, `extractionService`, …), chuẩn hoá payload (`resultPayloadNormalize.ts`, `parsedCvNormalize.ts`), **`fullRewrittenCvMarkdown.ts`**.
    -   **CV tối ưu (UI):** `CvMarkdownBody.tsx` + `.cv-markdown-specimen` trong `index.css`.
    -   **Supabase:** `userService`, `historyService` (bucket Storage `cv-files` — không còn `storageService.ts`).
    -   **Payment:** `paymentService.ts` — `createProCheckout()` gọi `POST /api/payment/create`, trả về `checkoutUrl` từ PayOS.
    -   **Quota phân tích/tháng:** `appSettingsService`, `analyticsQuotaService`; logic trong `AnalysisRunContext` (`checkAnalyticsQuota` trước `handleAnalyze`).

## Các luồng xử lý chính

### 1. Quản lý trạng thái tập trung
Shell (`AppShell`) chỉ gắn providers; logic nghiệp vụ nằm trong `src/context/` (phân tích tách **run** vs **saved JD**). View và modal đọc state qua `useAnalysis()` / hooks chuyên biệt, tránh prop drilling.

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
-   **Pro Feature Gate:** Các tính năng Pro (export CV, batch > 1, v.v.) được kiểm tra qua `isProPlan()` từ `planLimits.ts`; giao diện hiển thị `UpgradePrompt` khi người dùng Free truy cập.
-   **Collapsible Sidebar:** Tối ưu không gian hiển thị với thanh điều hướng có thể thu gọn, giúp tập trung vào nội dung phân tích.
-   **In-App Browser detection:** Cảnh báo người dùng khi truy cập từ Zalo/Facebook để đảm bảo quyền đăng nhập Google.
-   **Dynamic SEO Sync:** Metadata (title, description, OG) đồng bộ trong `AppContent.tsx` theo tab và ngôn ngữ báo cáo.
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
