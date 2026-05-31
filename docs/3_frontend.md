# Kiến trúc Frontend (cvFit)

Frontend của dự án **cvFit** được thiết kế để xử lý việc so sánh đồng thời nhiều hồ sơ năng lực với một bảng mô tả công việc (JD). Toàn bộ mã nguồn nằm trong thư mục `src/`.

## Cấu trúc thư mục (Modular Architecture)

Ứng dụng được cấu trúc theo hướng mô-đun hóa để dễ dàng bảo trì và mở rộng (refactor **2026-05**, đã merge `main`):

### Entry & shell (`src/app/`)

-   **`src/App.tsx`**: Re-export mặc định → `AppShell` (giữ import path cũ cho Vite).
-   **`src/app/AppShell.tsx`**: Gắn providers (`Auth`, `UI`, `Analysis`, `Recruiter`), `AppContent`, `AnalyticsBootstrap`, Vercel `<Analytics />`.
-   **`src/app/AppContent.tsx`**: Định tuyến tab/view, layout, lazy-load views, **SEO động** (`document.title`, meta OG), modals JD. Hỗ trợ tab `'recruiter'` cho gói Recruiter.
-   **`src/app/AppErrorBoundary.tsx`**: Error boundary toàn app.
-   **`src/app/MobileBottomNav.tsx`**, **`SaveJdNameModal.tsx`**, **`SavedJdsListModal.tsx`**, **`SavedCvsListModal.tsx`**: Điều hướng mobile và modal kho JD / kho CV. MobileBottomNav có tab "Tuyển dụng" khi user có plan=recruiter.

### Recruiter state (`src/context/recruiter/`)

-   **`RecruiterContext.tsx`** — Provider quản lý campaigns, candidates, batch analyze (tái dụng `analyzeCV` từ `ai/analysisService`), upload CV, HR status, export Excel.
-   **`types.ts`** — `RecruiterContextValue`, re-export types từ `recruiterService`.

### Global state (`src/context/`)

-   **`AuthContext.tsx`**: Xác thực Supabase và profile người dùng. Hỗ trợ `UserPlan = 'free' | 'pro' | 'recruiter'`.
-   **`UIContext.tsx`**: Tab, ngôn ngữ, modals, nhãn UI. Hỗ trợ tab `'recruiter'`.
-   **`AnalysisContext.tsx`**: Shim re-export — import từ `./context/analysis` (tương thích code cũ).
-   **`src/context/analysis/`** (hai provider + composer):
    -   `AnalysisRunContext.tsx` — JD/CV, `handleAnalyze`, kết quả, GA4 `analyze_cv` / `analysis_success`, trích JD URL. Đã refactor (**2026-05**): logic `cleanText`/`processFile` trích xuất ra `src/hooks/useFileProcessor.ts`, `createProgressSimulator` trích xuất ra `src/hooks/useProgressSimulator.ts`.
    -   `SavedJdContext.tsx` — kho JD đã lưu, `confirmSaveJD(title, jdContent)`, GA4 `jd_create` (`manual`). Tái dụng trong `CreateCampaignModal` cho Recruiter.
    -   `SavedCvContext.tsx` — kho CV đã lưu (Free: 1 CV, Pro: 10 CV), `saveCV(file)`, `loadCVFromSaved()`, `handleDeleteSavedCV()`, GA4 `cv_save` / `cv_delete` / `cv_load_from_saved`.
    -   `AnalysisProvider.tsx` — bọc `AnalysisRunProvider` + `SavedJdProvider` + `SavedCvProvider`.
    -   Hooks: `useAnalysis()` (merged), `useAnalysisRun()`, `useSavedJds()`, `useSavedCvs()`; types trong `types.ts`.

### Custom hooks (`src/hooks/`)

Được trích xuất từ `AnalysisRunContext` để giữ provider lean và dễ test độc lập:

-   **`useFileProcessor.ts`**: `cleanText()` (chuẩn hóa whitespace/line endings) + `processFile()` (đọc File → base64 data-URL hoặc plain text cho Gemini pipeline).
-   **`useProgressSimulator.ts`**: `createProgressSimulator()` — ease-out quadratic progress, interval-based, trả về `stop()`.

### Test suite (`src/__tests__/`)

Sử dụng **Vitest** (89 tests, 6 test files — cập nhật **2026-06**):

| Test file | Target | Tests |
|-----------|--------|-------|
| `planLimits.test.ts` | `src/lib/planLimits.ts` | 24 (thêm recruiter tests) |
| `resultPayloadNormalize.test.ts` | `src/services/ai/resultPayloadNormalize.ts` | 23 |
| `services/parsedCvNormalize.test.ts` | `src/services/ai/parsedCvNormalize.ts` | 21 |
| `services/prompts.test.ts` | `src/services/ai/prompts.ts` | 9 |
| `hooks/useFileProcessor.test.ts` | `src/hooks/useFileProcessor.ts` | 7 |
| `hooks/useProgressSimulator.test.ts` | `src/hooks/useProgressSimulator.ts` | 5 |

CI/CD: **GitHub Actions** (`.github/workflows/ci.yml`) — trigger `push`/`PR` trên `main`/`master`, chạy `lint` → `test` → `build`.

### Views (`src/components/views/`)

-   **`LandingView.tsx`**: Orchestrator mỏng (scroll Motion, nền); compose các section trong **`landing/`**:
    -   `HeroSection`, `TrustSection`, `ProblemSection`, `WhyChooseSection`, `HowItWorksSection`, `DemoResultSection`, `StatsSection`, `TargetUsersSection`, `RecruiterFeaturesSection`, `PricingSection`, `CtaSection`, `FaqSection`
    -   Shared: `landing/shared.tsx` (`GlassCard`, `FeatureIcon`), `landing/types.ts` (`LandingLabels`).
-   **`DashboardView.tsx`**: Workspace chính (CV/JD, phân tích, kết quả).
-   **`UpgradeView.tsx`**: Bảng so sánh Free / Pro / Recruiter dạng table (desktop) và stacked cards (mobile), gọi `createProCheckout(planType)` hoặc `createRecruiterCheckout()` → redirect PayOS.
-   **`RecruiterView.tsx`**: Danh sách đợt tuyển dụng (campaigns). Feature gate: chỉ hiển thị khi user có plan=recruiter, nếu không hiện `UpgradePrompt`.
-   **`CampaignDetailView.tsx`**: Bảng xếp hạng ứng viên theo điểm khớp, upload CV hàng loạt (50 CV/lần), phân tích batch, xuất Excel (SheetJS), JD toggle viewer, xóa CV.
-   **`PaymentSuccessView.tsx`**: Polling Supabase mỗi 2s (tối đa 15 lần) để phát hiện plan activation, tự động redirect Dashboard sau 4s.
-   **`PaymentCancelView.tsx`**: Trang thông báo hủy thanh toán, nút quay lại Dashboard.
-   **`ProfileView.tsx`**: Trang thông tin cá nhân (Họ tên, Email, Loại tài khoản Free/Pro/Recruiter, hạn sử dụng, số lượt phân tích đã dùng/tháng).
-   **`HistoryView.tsx`**, **`AdminView.tsx`**: Lịch sử và quản trị (Admin: cấu hình hạn mức mặc định `app_settings`, override/unlimited từng user, set plan Pro/Recruiter qua modal — xem [8_analytics.md](8_analytics.md)).
-   Các trang pháp lý / hỗ trợ: lazy-load từ `AppContent` (`TermsOfServicePage`, `PrivacyPolicyPage`, …).

### Recruiter components (`src/components/recruiter/`)

-   **`CampaignCard.tsx`**: Card hiển thị campaign với status badge, progress bar, menu actions (đóng/mở/xoá).
-   **`CandidateTable.tsx`**: Bảng xếp hạng ứng viên (sort match_score), cột trạng thái (pending/analyzing/done/error) + điểm, nút xoá CV.
-   **`CandidatePanel.tsx`**: Panel chi tiết ứng viên (mobile: bottom sheet, desktop: side panel) — ScoreGauge SVG, category scores (Skills/Experience/Tools/Education), matched/missing skills, strengths/weaknesses, HR status, ghi chú, JD viewer accordion.
-   **`CreateCampaignModal.tsx`**: Modal tạo campaign mới với title + JD textarea + upload file + chọn từ kho JD (tái dụng SavedJdContext).

### Khác

-   **`src/lib/`**: `utils.ts`, `supabase.ts`, **GA4 + consent** (`ga4.ts`), **`planLimits.ts`** (MAX_BATCH_BY_PLAN, MAX_CAMPAIGN_CVS, MAX_CAMPAIGNS, isProPlan, isRecruiterPlan).
-   **`src/components/layout/CookieConsentBanner.tsx`**: Banner cookie trước khi load GA4.
-   **`src/components/shared/UpgradePrompt.tsx`**: Component tái sử dụng cho các feature gate (Pro / Recruiter).
-   **`src/services/`**:
    -   **`ai/`**: Gemini (`analysisService`, `extractionService`, …), chuẩn hoá payload (`resultPayloadNormalize.ts`, `parsedCvNormalize.ts`), **`fullRewrittenCvMarkdown.ts`**.
    -   **CV tối ưu (UI):** `CvMarkdownBody.tsx` + `.cv-markdown-specimen` trong `index.css`.
    -   **Supabase:** `userService`, `historyService`, `cvService` (bucket Storage `cv-files` — upload/download/delete CV cho kho CV).
    -   **Payment:** `paymentService.ts` — `createProCheckout(planType?)` gọi `POST /api/payment/create` với `planType` ('pro' | 'recruiter'), trả về `checkoutUrl` từ PayOS. `createRecruiterCheckout()` là shorthand.
    -   **Recruiter:** `recruiterService.ts` — CRUD campaigns & candidates, Supabase Storage upload, `saveCandidateAnalysis` (gọi API proxy `/api/recruiter/save-analysis`).
    -   **Quota phân tích/tháng:** `appSettingsService`, `analyticsQuotaService`; logic trong `AnalysisRunContext` (`checkAnalyticsQuota` trước `handleAnalyze`).

### Đa ngôn ngữ UI (`src/translations/`)

-   **`types.ts`**: `UiLabels` interface — toàn bộ key VI/EN cho tất cả section (result, nav, landing, input, footer, history, admin, system, legal, billing, about, **recruiter**).
-   **`index.ts`**: Hợp nhất tất cả section → `UI_LABELS: Record<ReportLanguage, UiLabels>`. Hàm `formatLabel(template, vars)` hỗ trợ placeholder `{key}`.
-   **`recruiter.ts`** (thêm **2026-06**): 74 translation keys riêng cho tính năng Recruiter, phân nhóm theo component:
    -   **Navigation**: `recruiterTab` — "Tuyển dụng" / "Recruitment" → dùng trong Header tab và MobileBottomNav
    -   **RecruiterView**: tiêu đề "Đợt tuyển dụng", đếm campaign, nút "Tạo mới", empty state
    -   **CampaignCard**: status labels (Đang mở/Đã đóng/Đã lưu trữ), menu actions (Đóng đợt/Mở lại/Xoá), đếm CV/đã PT/shortlist
    -   **CreateCampaignModal**: tiêu đề, labels, placeholders, error messages, nút Huỷ/Tạo đợt
    -   **CampaignDetailView**: loading, upload/analyze/export labels, error messages, filter, delete confirm
    -   **CandidateTable**: empty state, cột (Ứng viên/Điểm/Trạng thái), status badges (Đang PT/Chờ PT/Lỗi), HR status labels (Mới/Shortlist/Phỏng vấn/Loại/Đã tuyển)
    -   **CandidatePanel**: status, probability, match score, verdict (Ứng viên tiềm năng/Cân nhắc/Chưa phù hợp), HR sections, analysis results (Điểm mạnh/Điểm yếu/Kỹ năng đạt/Kỹ năng thiếu), category labels (Kỹ năng/Kinh nghiệm/Công cụ/Học vấn), note save states
-   **ProfileView Recruiter info**: 8 keys cho section thông tin gói Recruiter (loại tài khoản, số đợt, CV mỗi đợt, xuất Excel, ghi chú nội bộ)
-   Các section khác: `result.ts`, `nav.ts`, `landing.ts`, `input.ts`, `footer.ts`, `history.ts`, `admin.ts`, `system.ts`, `legal.ts`, `billing.ts`, `about.ts`

Tất cả component tuyển dụng sử dụng `useUI().t` để truy cập translation keys — hỗ trợ đầy đủ tiếng Việt và tiếng Anh thông qua `reportLanguage` trong `UIContext`.

## Các luồng xử lý chính

### 1. Quản lý trạng thái tập trung
Shell (`AppShell`) chỉ gắn providers; logic nghiệp vụ nằm trong `src/context/` (phân tích tách **run** vs **saved JD**, **recruiter** có context riêng). View và modal đọc state qua `useAnalysis()` / `useRecruiter()` / hooks chuyên biệt, tránh prop drilling.

### 2. Xử lý đa định dạng (Multi-format Support)
-   Hỗ trợ trích xuất văn bản từ: `.pdf`, `.docx`, `.txt`.
-   Hỗ trợ OCR từ hình ảnh: `.jpg`, `.png`, `.webp` thông qua tính năng Vision của Gemini.

### 3. Hiển thị kết quả so sánh
-   **Matching Score:** Điểm số tổng quát thể hiện mức độ khớp.
-   **Detailed Comparison:** Bảng đối chiếu từng yêu cầu trong JD với minh chứng từ CV (cvEvidence) và gợi ý cải thiện (improvement).
-   **Biểu đồ (Recharts):** Tab chi tiết dùng **Bar chart** (điểm theo nhóm) và **Pie chart** (phân bố matching points theo category); **History** có Area/Bar khi có đủ dữ liệu lịch sử. Container chart dùng chiều cao cố định + `ResponsiveContainer` để tránh cảnh báo kích thước.
-   **Optimized Readability:** Kết quả phân tích được giới hạn chiều rộng tối đa 900px, tạo trải nghiệm đọc "như văn bản in" (editorial-grade), giảm mỏi mắt cho nhà tuyển dụng.

### 4. Luồng Recruiter (Nhà tuyển dụng)
-   User có plan=recruiter → truy cập `RecruiterView` (danh sách campaign).
-   Tạo campaign mới (`CreateCampaignModal`) → upload CV hàng loạt (50 CV/lần).
-   Phân tích batch (`RecruiterContext.analyzeCampaign`) → tái dụng `analyzeCV` từ `ai/analysisService`.
-   Kết quả hiển thị trong `CandidateTable` (xếp hạng theo match_score).
-   Click ứng viên → `CandidatePanel` hiển thị chi tiết: ScoreGauge, category scores, matched/missing skills, strengths/weaknesses, HR status, ghi chú nội bộ.
-   Xuất Excel: `SheetJS` export 15 cột (STT, Tên, Điểm khớp, 4 category scores, Xác suất, Yếu tố chính, Điểm mạnh, Điểm yếu, Trạng thái HR, Ghi chú, Thời gian PT).

## Điểm nhấn UX
-   **Real-time Progress:** Hiển thị tiến trình phân tích cho từng file khi xử lý hàng loạt.
-   **Multi-language:** Hỗ trợ chuyển đổi ngôn ngữ báo cáo (Tiếng Việt/Tiếng Anh) một cách tức thì.
-   **Pro/Recruiter Feature Gate:** Các tính năng được kiểm tra qua `isProPlan()` / `isRecruiterPlan()` từ `planLimits.ts`; giao diện hiển thị `UpgradePrompt` khi người dùng Free/Pro truy cập tính năng Recruiter.
-   **Collapsible Sidebar:** Tối ưu không gian hiển thị với thanh điều hướng có thể thu gọn, giúp tập trung vào nội dung phân tích.
-   **In-App Browser detection:** Cảnh báo người dùng khi truy cập từ Zalo/Facebook để đảm bảo quyền đăng nhập Google.
-   **Pre-hydration SEO (2026-05):** `<script>` đồng bộ trong `index.html` chạy trước React — set đúng meta (title, description, OG, Twitter, canonical), hreflang (`vi`, `en`, `x-default`), Schema.org (`SoftwareApplication`, `Organization`, `BreadcrumbList`, `FAQPage`, `HowTo`), và `robots` meta (`noindex` cho payment/admin). Có full SEO metadata cho 6 route (home, privacy, terms, support, upgrade, about) bằng cả 2 ngôn ngữ.
-   **Hreflang & Canonical:** URL-based language routing (`/vi`, `/en` prefix) với hreflang tags + canonical per-route. Legacy paths (`/privacy`...) redirect 301 về `/vi/privacy`.
-   **Dynamic SEO Sync:** `AppContent.tsx` đồng bộ canonical, hreflang, meta, schema sau mỗi SPA navigation — kế thừa và cập nhật seed từ pre-hydration script.
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
-   **Recruiter Dashboard UX (2026-06):**
    - **Sticky Header** với upload, analyze all, export Excel, JD toggle.
    - **Candidate Panel** với ScoreGauge SVG, category scores 4 ô, strengths/weaknesses chips, JD viewer accordion.
    - **Status badges** rõ ràng: Chờ PT, Đang PT, Lỗi, điểm số.
    - **Modal confirm** cho admin set plan (Free/Pro/Recruiter) + analytics limit.