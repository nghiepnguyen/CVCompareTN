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

-   **`AuthContext.tsx`**: Xác thực Supabase và profile người dùng. Hỗ trợ `UserPlan = 'free' | 'pro' | 'recruiter'`. Ngoài Google OAuth (`login()`), còn có email auth: `signInWithEmail()`, `signUpWithEmail()`, `resetPasswordForEmail()` — mỗi hàm đều verify reCAPTCHA qua `POST /api/verify-recaptcha` trước khi gọi Supabase Auth. Quản lý `authModalMode` ('signIn' | 'signUp' | 'resetPassword' | null) để điều khiển `AuthModal`.
-   **`UIContext.tsx`**: Tab, ngôn ngữ, modals, nhãn UI. Hỗ trợ tab `'recruiter'`.
-   **`AnalysisContext.tsx`**: Shim re-export — import từ `./context/analysis` (tương thích code cũ).
-   **`src/context/analysis/`** (hai provider + composer):
    -   `AnalysisRunContext.tsx` — JD/CV, `handleAnalyze`, kết quả, GA4 `analyze_cv` / `analysis_success`, trích JD URL. Đã refactor (**2026-05**): logic `cleanText`/`processFile` trích xuất ra `src/hooks/useFileProcessor.ts`, `createProgressSimulator` trích xuất ra `src/hooks/useProgressSimulator.ts`. Sau `handleAnalyze` (2026-07): trigger `generateFullCV()` và `generateParsedCVForResult()` trong nền (không chặn UI) để fill `fullRewrittenCV`/`parsedCV`; trạng thái loading expose qua `fullCVGeneratingIds` / `parsedCVGeneratingIds` (Set resultId).
    -   `SavedJdContext.tsx` — kho JD đã lưu, `confirmSaveJD(title, jdContent)`, GA4 `jd_create` (`manual`). Tái dụng trong `CreateCampaignModal` cho Recruiter.
    -   `SavedCvContext.tsx` — kho CV đã lưu (Free: 1 CV, Pro: 10 CV), `saveCV(file)`, `loadCVFromSaved()`, `handleDeleteSavedCV()`, GA4 `cv_save` / `cv_delete` / `cv_load_from_saved`.
    -   `AnalysisProvider.tsx` — bọc `AnalysisRunProvider` + `SavedJdProvider` + `SavedCvProvider`.
    -   Hooks: `useAnalysis()` (merged), `useAnalysisRun()`, `useSavedJds()`, `useSavedCvs()`; types trong `types.ts`.

### Custom hooks (`src/hooks/`)

Được trích xuất từ `AnalysisRunContext` để giữ provider lean và dễ test độc lập:

-   **`useFileProcessor.ts`**: `cleanText()` (chuẩn hóa whitespace/line endings) + `processFile()` (đọc File → base64 data-URL hoặc plain text cho Gemini pipeline).
-   **`useProgressSimulator.ts`**: `createProgressSimulator()` — ease-out quadratic progress, interval-based, trả về `stop()`.

### Test suite (`src/__tests__/`)

Sử dụng **Vitest** (98 tests, 7 test files — cập nhật **2026-06**):

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
-   **`CampaignDetailView.tsx`**: Bảng xếp hạng ứng viên theo điểm khớp, upload CV hàng loạt (50 CV/lần), phân tích batch, xuất Excel (ExcelJS), JD toggle viewer, xóa CV.
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

### Auth components (`src/components/auth/`)

-   **`AuthModal.tsx`**: Modal xác thực thống nhất 3 chế độ (Sign In / Sign Up / Reset Password) với Motion `layoutId` animation khi chuyển tab. Hỗ trợ:
    -   **Sign In:** Email + Password + "Quên mật khẩu?" link
    -   **Sign Up:** Tên + Email + Password
    -   **Reset Password:** Nhập email → gửi link reset qua Supabase
    -   **Google OAuth** (luôn hiển thị phía dưới dạng nút "Tiếp tục với Google")
    -   Validation client-side (email format, password ≥ 6 ký tự, tên không trống)
    -   Error mapping từ Supabase → translation key (authInvalidCredentials, authEmailInUse, …)
    -   reCAPTCHA v3 protection: gọi `verifyCaptcha()` → `POST /api/verify-recaptcha` trước khi submit form
    -   Thiết kế Dark OLED phù hợp Industrial Utilitarian của dự án

### Khác

-   **`src/lib/`**: `utils.ts`, `supabase.ts`, **GA4 + consent** (`ga4.ts`), **`planLimits.ts`** (MAX_BATCH_BY_PLAN, MAX_CAMPAIGN_CVS, MAX_CAMPAIGNS, isProPlan, isRecruiterPlan).
-   **`src/components/layout/CookieConsentBanner.tsx`**: Banner cookie trước khi load GA4.
-   **`src/components/shared/UpgradePrompt.tsx`**: Component tái sử dụng cho các feature gate (Pro / Recruiter).
-   **`src/services/`**:
    -   **`ai/`**: Gemini (`analysisService`, `extractionService`, …), chuẩn hoá payload (`resultPayloadNormalize.ts`, `parsedCvNormalize.ts`), **`fullRewrittenCvMarkdown.ts`**. `analysisService.ts` export 3 hàm gọi backend: `analyzeCV()` (`/api/analyze`, chính), `rewriteFullCV()` (`/api/rewrite-cv`, nền → `fullRewrittenCV`), `parseCV()` (`/api/parse-cv`, nền → `parsedCV`) — xem [6_workflow.md](../docs/6_workflow.md#sinh-fullrewrittencv-và-parsedcv-trong-nền-2026-07).
     -   **CV tối ưu (UI):** `CvMarkdownBody.tsx` + `.cv-markdown-specimen` trong `index.css`. Hỗ trợ **Dual-Mode Tab** (Premium View / Free Preview) với layout Black+Gold Liquid Glass cho paid user — xem chi tiết bên dưới.
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
-   **Biểu đồ (Recharts):** Tab chi tiết (`AnalysisDetailsTab`) dùng **Bar chart** "Phân bổ điểm thành phần" (`categoryScores` — 8 nhóm: Skills/Soft Skills/Hard Skills/Technical Skills/Experience/Tools/Language Skills/Education) và **Radar chart** "Phân bổ kỹ năng" (% khớp = `matchingPoints / (matchingPoints + missingGaps)` theo category, domain cố định 0-100, union category từ cả 2 mảng); **History** có Area/Bar khi có đủ dữ liệu lịch sử. Container chart dùng chiều cao cố định + `ResponsiveContainer` để tránh cảnh báo kích thước.
-   **Optimized Readability:** Kết quả phân tích được giới hạn chiều rộng tối đa 900px, tạo trải nghiệm đọc "như văn bản in" (editorial-grade), giảm mỏi mắt cho nhà tuyển dụng.

### 4. Luồng Recruiter (Nhà tuyển dụng)
-   User có plan=recruiter → truy cập `RecruiterView` (danh sách campaign).
-   Tạo campaign mới (`CreateCampaignModal`) → upload CV hàng loạt (50 CV/lần).
-   Phân tích batch (`RecruiterContext.analyzeCampaign`) → tái dụng `analyzeCV` từ `ai/analysisService`.
-   Kết quả hiển thị trong `CandidateTable` (xếp hạng theo match_score).
-   Click ứng viên → `CandidatePanel` hiển thị chi tiết: ScoreGauge, category scores, matched/missing skills, strengths/weaknesses, HR status, ghi chú nội bộ.
-   Xuất Excel: `ExcelJS` export 14 cột (STT, Tên ứng viên, Điểm khớp, 4 category scores, Xác suất, Yếu tố chính, Điểm mạnh, Điểm yếu, Trạng thái HR, Ghi chú, Thời gian PT) — Blob download, không dùng `XLSX.writeFile`.

## Điểm nhấn UX

-   **Real-time Progress:** Tiến trình phân tích từng file trong batch.
-   **Multi-language:** Chuyển đổi ngôn ngữ báo cáo VI/EN tức thì.
-   **Feature Gate:** `isProPlan()` / `isRecruiterPlan()` từ `planLimits.ts`; hiển thị `UpgradePrompt` khi Free/Pro truy cập tính năng Recruiter.
-   **In-App Browser detection:** Cảnh báo khi vào từ Zalo/Facebook (Google login bị block).
-   **Auth Modal:** `AuthModal.tsx` — Sign In/Sign Up/Reset Password, Motion layoutId animation, reCAPTCHA v3, Google OAuth. Mở qua `openAuthModal()`.
-   **SEO Pre-hydration:** `<script>` sync trong `index.html` — title, OG, hreflang (vi/en/x-default), Schema.org, `noindex` cho payment/admin. `AppContent.tsx` đồng bộ sau mỗi SPA nav. Legacy paths redirect 301 → `/vi/:path`.
-   **Lazy Loading:** `React.lazy` + `Suspense` cho tất cả View lớn.
-   **Industrial Utilitarian Design:** Motion `layoutId` "sliding pill" khi chuyển tab; "Scan Line" trên result nav bar.
-   **Mobile-First:** Bottom Navigation, Sticky Results Nav, Smart Auto-Scroll, Bottom Sheets, adaptive card layouts. Startup: auth check song song (~100–200ms).
-   **Recruiter Dashboard UX:** Sticky header (upload/analyze all/export Excel/JD toggle); CandidatePanel với ScoreGauge SVG, category scores, strengths/weaknesses chips, JD accordion; status badges rõ ràng.
-   **Dual-Mode CV Tab:**
    -   **Premium View** (Crown) — Black+Gold Liquid Glass: H1 ultra-bold với gold underline, H2 gold ribbon + gradient accent bar, bullet gold glow, table header dark gradient.
    -   **Free Preview** (Eye) — simple markdown (`.cv-markdown-specimen`), không accent colors.
    -   **Watermark Free user:** 6 lớp (gradient, diagonal stripe, "cvFit.pro" giữa, grid amber, text lặp, badge góc phải).
    -   **Print sync:** `sessionStorage` (`cvFit_viewMode`, `cvFit_printVersion`) + Custom Event `cvfit:viewModeChanged` → `PrintView` luôn dùng đúng variant.
    -   **Files:** `OptimizationTab.tsx`, `CvMarkdownBody.tsx` (variant prop), `PrintView.tsx`.
