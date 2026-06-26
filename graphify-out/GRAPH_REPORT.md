# Graph Report - cv-compare-tn  (2026-06-26)

## Corpus Check
- 211 files · ~121,434 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1386 nodes · 2688 edges · 90 communities (85 shown, 5 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 12 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c55ba2d6`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Community 74|Community 74]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Community 76|Community 76]]
- [[_COMMUNITY_Community 77|Community 77]]
- [[_COMMUNITY_Community 78|Community 78]]
- [[_COMMUNITY_Community 81|Community 81]]

## God Nodes (most connected - your core abstractions)
1. `useUI()` - 90 edges
2. `cn()` - 58 edges
3. `useAuth()` - 55 edges
4. `formatLabel()` - 30 edges
5. `supabase` - 25 edges
6. `isRecruiterPlan()` - 19 edges
7. `isProPlan()` - 18 edges
8. `handlePaymentWebhook()` - 17 edges
9. `analyzeCV()` - 16 edges
10. `Hạn mức phân tích CV/tháng (Supabase — không phải GA4)` - 15 edges

## Surprising Connections (you probably didn't know these)
- `AboutPage()` --calls--> `useUI()`  [EXTRACTED]
  components/AboutPage.tsx → src/context/UIContext.tsx
- `Header()` --calls--> `useAnalysis()`  [INFERRED]
  components/layout/Header.tsx → src/context/analysis/AnalysisProvider.tsx
- `mapHistory()` --calls--> `normalizeAnalysisPayload()`  [INFERRED]
  historyService.ts → src/services/ai/resultPayloadNormalize.ts
- `Header()` --calls--> `useAuth()`  [EXTRACTED]
  components/layout/Header.tsx → src/context/AuthContext.tsx
- `Header()` --calls--> `useUI()`  [EXTRACTED]
  components/layout/Header.tsx → src/context/UIContext.tsx

## Communities (90 total, 5 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.09
Nodes (46): HandlerResult, activateProForOrder(), fetchProfileForEmail(), handlePaymentConfirm(), handlePaymentCreate(), handlePaymentWebhook(), isWebhookPaymentSuccess(), normalizeOrderCode() (+38 more)

### Community 1 - "Community 1"
Cohesion: 0.11
Nodes (41): SupabaseConfigError(), AuthContext, AuthContextType, AuthModalMode, AuthProvider(), EmailAuthResult, AdminUsersState, useAdminUsers() (+33 more)

### Community 2 - "Community 2"
Cohesion: 0.09
Nodes (46): handler(), isPdfBuffer(), PDF_HEADER, handler(), startServer(), activateProForOrder(), fetchProfileForEmail(), handlePaymentConfirm() (+38 more)

### Community 3 - "Community 3"
Cohesion: 0.1
Nodes (37): AnalysisRunContext, AnalysisRunProvider(), useAnalysisRun(), SavedCvContext, SavedCvProvider(), useSavedCvs(), AnalysisContextType, AnalysisRunContextType (+29 more)

### Community 4 - "Community 4"
Cohesion: 0.13
Nodes (30): AboutPage(), SectionCardProps, CtaSection(), DemoResultSection(), FaqSection(), HeroSection(), HowItWorksSection(), buildRows() (+22 more)

### Community 5 - "Community 5"
Cohesion: 0.04
Nodes (45): Bước 1 — Migration Supabase, Bước 2 — Backend: endpoint PayOS Recruiter, Bước 3 — Frontend, Bước 4 — UpgradeView cập nhật, Bước 5 — Xử lý hết hạn, Bảng mới, Backend, Cấu trúc file mới (+37 more)

### Community 6 - "Community 6"
Cohesion: 0.04
Nodes (44): 1.1 File migration, 1.2 Cập nhật check_analytics_quota, 2.1 `POST /api/payment/create`, 2.2 `POST /api/payment/webhook`, 2.3 Đăng ký route trong `server.ts`, 2.4 Thêm vào `vercel.json`, 3.1 `analyticsQuotaService.ts` — đọc plan từ response, 3.2 Giới hạn batch CV (+36 more)

### Community 7 - "Community 7"
Cohesion: 0.05
Nodes (42): code:gitignore (# Graphify AST cache (regenerated by `graphify update`; keep), code:typescript (export interface SavedJdModalProps {), code:typescript (export default function AppShell() {), code:typescript (export { default } from './app/AppShell';), code:bash (npm run lint && npm run build), code:bash (git commit -m "$(cat <<'EOF'), code:typescript (confirmSaveJD: (title: string, jdContent: string) => Promise), code:typescript (const confirmSaveJD = async (title: string, jdContent: strin) (+34 more)

### Community 8 - "Community 8"
Cohesion: 0.07
Nodes (19): SavedCvsListModalProps, SavedJdsListModalProps, about, admin, billing, footer, history, LocaleEntry (+11 more)

### Community 9 - "Community 9"
Cohesion: 0.05
Nodes (37): Admin UI (`AdminView`), API theo dõi sự kiện, Bảng & cột, Bảng event đang track, Bảo mật RPC (Security Advisor), Biến môi trường, Cấu hình privacy trên GA4, Chu kỳ quota (quota_reset_day) (+29 more)

### Community 10 - "Community 10"
Cohesion: 0.12
Nodes (29): AboutPage, AdminView, AppContent(), AuthModal, DashboardView, HistoryView, LandingView, NoPermissionView (+21 more)

### Community 11 - "Community 11"
Cohesion: 0.1
Nodes (22): AppErrorBoundary, RECAPTCHA_SITE_KEY, UIProvider(), AnalyticsBootstrap(), CookieConsentBannerProps, AnalyticsConsent, applyGrantedConsent(), denyAnalyticsConsent() (+14 more)

### Community 12 - "Community 12"
Cohesion: 0.11
Nodes (17): MobileBottomNavProps, Tab, tabFromPath(), UIContext, UIContextType, AnalysisDetailsTab, AnalysisDetailsTabProps, ComparisonOverview() (+9 more)

### Community 13 - "Community 13"
Cohesion: 0.17
Nodes (18): Header(), formatPlanExpiryDate(), HISTORY_DAYS_BY_PLAN, isProPlan(), isRecruiterPlan(), MAX_CAMPAIGN_CVS, MAX_CAMPAIGNS, MAX_SAVED_JD_BY_PLAN (+10 more)

### Community 14 - "Community 14"
Cohesion: 0.15
Nodes (23): RecruiterContext, RecruiterContextValue, CampaignStatus, CandidateCV, CandidateStatus, createCampaign(), createCandidate(), deleteCampaign() (+15 more)

### Community 15 - "Community 15"
Cohesion: 0.07
Nodes (26): 2a — `App.tsx` decomposition, 2b — Two analysis providers (B2), 2c — LandingView, code:gitignore (# Graphify — regenerate with `graphify update .`; keep human), code:block2 (src/app/), code:typescript (export { default } from './app/AppShell';), code:block4 (AuthProvider → UIProvider → AnalysisProvider (composer) → Ap), code:block5 (src/context/analysis/) (+18 more)

### Community 16 - "Community 16"
Cohesion: 0.17
Nodes (16): useAnalysis(), SavedJdProvider(), PrivacyPolicyPage(), TermsOfServicePage(), useAuth(), useUI(), RecruiterProvider(), UpgradePrompt() (+8 more)

### Community 17 - "Community 17"
Cohesion: 0.11
Nodes (20): buildAnalyzePromptEn(), buildAnalyzePromptVi(), buildRewritePromptEn(), buildRewritePromptVi(), DetailedComparisonPromptParams, PromptParams, RewritePromptParams, CategorizedScore (+12 more)

### Community 18 - "Community 18"
Cohesion: 0.12
Nodes (14): CampaignCard(), CampaignCardProps, useStatusConfig(), CandidateAnalysisData, CandidatePanel(), CandidatePanelProps, CandidateTable(), CandidateTableProps (+6 more)

### Community 19 - "Community 19"
Cohesion: 0.09
Nodes (21): 1. Cấu hình (`/api/config`), 2. Trích xuất PDF, 3. Phân tích CV với Gemini AI, 3. Xác thực reCAPTCHA, 4. Thanh toán PayOS (`/api/payment/create` & `/api/payment/webhook`), 4. Xác thực reCAPTCHA, 5. Hệ thống Email (Resend), 5. Thanh toán PayOS (`/api/payment/*`) (+13 more)

### Community 20 - "Community 20"
Cohesion: 0.09
Nodes (21): 1. Internal API (Backend Proxy), 2. Dịch vụ lưu trữ & xác thực (Supabase), code:json ({), CV Storage — Kho CV, Danh sách API Endpoints (cvFit), Edge Function (tùy chọn — Supabase), `GET /api/config`, Hệ thống Email (Resend) (+13 more)

### Community 21 - "Community 21"
Cohesion: 0.28
Nodes (18): analyzeCV(), parseGeminiJson(), repairTruncatedJson(), stripControlChars(), coerceJsonField(), detailedComparisonHasRows(), IMPACTS, normalizeAnalysisPayload() (+10 more)

### Community 22 - "Community 22"
Cohesion: 0.2
Nodes (14): CvMarkdownBody, markdownToPlainText(), cleanMarkdownForPremium(), extractCandidateName(), ActionButtons(), ActionButtonsProps, FullCVTab, FullCVTabProps (+6 more)

### Community 23 - "Community 23"
Cohesion: 0.14
Nodes (13): cvMarkdownHasHeadings(), fixMarkdownHeadingHashes(), fullRewrittenCvToPlainText(), isBulletLine(), isSectionLine(), normalizeSectionCandidate(), preprocessFullRewrittenCvMarkdown(), promotePlainTextCvToMarkdown() (+5 more)

### Community 24 - "Community 24"
Cohesion: 0.1
Nodes (19): Auth — Leaked password protection (bạn cần bật một lần), Checklist thực hiện, code:sql (SELECT p.proname, r.rolname,), code:sql (-- Fix 1: Revoke quyền gọi activate_pro_plan từ anon và auth), code:typescript (// server/routes/payment.ts (hoặc tương đương)), code:sql (-- Fix 2: Revoke quyền gọi các hàm ghi từ anon), code:sql (-- Fix 3: Sửa policy SELECT của bucket cv-files), code:sql (-- Fix 4: Revoke quyền anon gọi các hàm đọc thông tin user) (+11 more)

### Community 25 - "Community 25"
Cohesion: 0.11
Nodes (18): 1. Quản lý trạng thái tập trung, 2. Xử lý đa định dạng (Multi-format Support), 3. Hiển thị kết quả so sánh, 4. Luồng Recruiter (Nhà tuyển dụng), Đa ngôn ngữ UI (`src/translations/`), Auth components (`src/components/auth/`), Các luồng xử lý chính, Cấu trúc thư mục (Modular Architecture) (+10 more)

### Community 26 - "Community 26"
Cohesion: 0.11
Nodes (17): 10. Secrets & Environment, 1. General Principles, 2. Naming Conventions, 3. React Best Practices, 4. Performance Optimization, 5. Styling (Tailwind CSS), 6. TypeScript Usage, 7. Error Handling (+9 more)

### Community 27 - "Community 27"
Cohesion: 0.18
Nodes (13): AnalysisResult, ATSEvaluation, CategorizedPoint, ComparisonItem, DetailedComparison, MissingGap, ParsedCV, ParsedEducation (+5 more)

### Community 28 - "Community 28"
Cohesion: 0.12
Nodes (15): 1. Triển khai trên Vercel, 2. Cấu hình Supabase (Bắt buộc), 3. Chế độ Phát triển (Local Development), 4. Cấu hình điều hướng (vercel.json), 5. Bảo mật mã nguồn và bí mật, Biến môi trường, Các bước thực hiện:, Các bước thực hiện: (+7 more)

### Community 29 - "Community 29"
Cohesion: 0.12
Nodes (15): isRecord(), normalizeParsedCV(), authResult, buffer, extraction, gemini, geminiApiKey, { jd, cvData, cvMimeType, cvName, language = 'vi' } (+7 more)

### Community 30 - "Community 30"
Cohesion: 0.17
Nodes (14): buildDetailedComparisonPromptEn(), buildDetailedComparisonPromptVi(), handler(), parseGeminiJson(), stripCtrl(), authResult, detailedComparison, gemini (+6 more)

### Community 31 - "Community 31"
Cohesion: 0.13
Nodes (14): 3 endpoint gộp trong `api/payment.ts`, Biến môi trường bắt buộc trên Vercel Production, Cấu trúc hiện tại (7/12 functions), code:block1 (_server-lib/), code:block2 (POST /api/payment/create  → action='create'  → handlePayment), code:block3 (PAYOS_CLIENT_ID), KHÔNG được, Khi thêm function mới (+6 more)

### Community 32 - "Community 32"
Cohesion: 0.15
Nodes (11): Adding a new endpoint, API routing matrix (Vercel · Express · Supabase), code:mermaid (flowchart TB), Express (`npm start` → `server.ts` + `server/routes/`), Out of scope (this doc), Quick reference, Request flow (high level), Supabase data plane (not HTTP `/api`) (+3 more)

### Community 33 - "Community 33"
Cohesion: 0.17
Nodes (5): buildMarkdown(), CvPremiumTemplate(), Icon, MOCK_DATA, T

### Community 34 - "Community 34"
Cohesion: 0.26
Nodes (12): BLOCKED_HOSTNAME_PATTERNS, BLOCKED_HOSTNAMES, extractTextFromHtml(), handler(), hasPathTraversal(), htmlToText(), ipv4ToNumber(), isBlockedHostname() (+4 more)

### Community 35 - "Community 35"
Cohesion: 0.17
Nodes (9): mockAxiosPost, mockExtractText, mockGetUser, notPdf, req, { res }, { res, status }, { res, status, json } (+1 more)

### Community 36 - "Community 36"
Cohesion: 0.27
Nodes (10): handler(), handleSendFeedback(), handleSendWelcomeEmail(), err, errors, longLocal, validateEmail(), validateFeedbackInput() (+2 more)

### Community 37 - "Community 37"
Cohesion: 0.18
Nodes (10): 1. Code Style & Conventions, 2. Architecture & Data Flow, 3. UI/UX Guidelines, 4. Secrets & Repository Hygiene, 5. Specific Workflows, 6. Vercel Deployment Constraints (Hobby Plan), 7. Agent Behavior, AI Studio Agent Instructions (+2 more)

### Community 38 - "Community 38"
Cohesion: 0.18
Nodes (11): Appendix: Tested Request Patterns (Hypothetical Burp Repeater), code:block15 (GET /api/config HTTP/1.1), code:block16 (GET /storage/v1/object/public/cv-files/<file_path> HTTP/1.1), code:block17 (POST /api/extract-pdf HTTP/1.1), code:block18 (POST /api/send-feedback HTTP/1.1), code:block19 (POST /api/extract-pdf HTTP/1.1), Test 1: Gemini Key Extraction, Test 2: CV File Direct Access (+3 more)

### Community 39 - "Community 39"
Cohesion: 0.24
Nodes (7): AMP, escapeHtml(), sendVipUpgradeEmail(), VipUpgradeEmailParams, AMP, escapeHtml(), AMP

### Community 40 - "Community 40"
Cohesion: 0.18
Nodes (9): action, body, resendClient, router, safeContent, safeTitle, safeUserEmail, safeUserName (+1 more)

### Community 41 - "Community 41"
Cohesion: 0.27
Nodes (10): BLOCKED_HOSTNAME_PATTERNS, BLOCKED_HOSTNAMES, hasPathTraversal(), ipv4ToNumber(), isBlockedHostname(), isPrivateIPv4(), isPrivateIPv6(), PRIVATE_IPV4_RANGES (+2 more)

### Community 42 - "Community 42"
Cohesion: 0.31
Nodes (7): SavedJdContext, useSavedJds(), SavedJdContextType, deleteSavedJD(), getSavedJDs(), SavedJD, saveJDToProfile()

### Community 43 - "Community 43"
Cohesion: 0.2
Nodes (9): 1. Luồng phân tích đồng thời (Batch Analysis Flow), 2. Luồng tối ưu hóa & Xuất bản, 4. Luồng thanh toán Pro (PayOS Flow), 5. Quản lý dữ liệu, Các bước trọng tâm:, code:mermaid (graph TD), code:mermaid (graph TD), Gia hạn cộng dồn (nhiều lần mua Pro) (+1 more)

### Community 44 - "Community 44"
Cohesion: 0.25
Nodes (6): AnalysisLoadingState(), AnalysisLoadingStateProps, STEPS, RatingSection(), RatingSectionProps, rateAnalysis()

### Community 45 - "Community 45"
Cohesion: 0.33
Nodes (7): ConfirmPaymentResponse, confirmProPayment(), CreateCheckoutResponse, createProCheckout(), createRecruiterCheckout(), parsePaymentApiResponse(), PaymentApiError

### Community 46 - "Community 46"
Cohesion: 0.22
Nodes (7): resendClient, router, safeContent, safeTitle, safeUserEmail, safeUserName, validationErrors

### Community 47 - "Community 47"
Cohesion: 0.22
Nodes (8): authResult, buffer, encodedPath, { filePath }, json, router, supabaseUrl, userJwt

### Community 48 - "Community 48"
Cohesion: 0.22
Nodes (8): adminClient, gemini, geminiApiKey, { imageData, mimeType }, router, serviceRoleKey, supabaseUrl, token

### Community 49 - "Community 49"
Cohesion: 0.25
Nodes (5): htmlToText(), html, router, text, validation

### Community 50 - "Community 50"
Cohesion: 0.33
Nodes (5): apiLimiter, emailLimiter, staticLimiter, strictLimiter, router

### Community 51 - "Community 51"
Cohesion: 0.25
Nodes (8): code:block12 (script-src 'self' 'unsafe-inline' 'unsafe-eval' ...), code:typescript (// api/extract-pdf.ts — no auth check), Findings, 🟠 HIGH-02: No Authentication on PDF Extraction Endpoint, 🔵 LOW-01: CSP Allows `unsafe-inline` and `unsafe-eval`, 🔵 LOW-02: Supabase Anon Key Exposed (By Design, but Documented), 🟡 MEDIUM-03: No IP Whitelist for PayOS Webhook, 🟡 MEDIUM-04: No CSRF Protection on State-Changing Endpoints

### Community 52 - "Community 52"
Cohesion: 0.25
Nodes (7): Attack Surface Inventory, 🛡️ Burp Suite Security Audit Report — CV Matcher & Optimizer, Executive Summary, Fix Implementation Status, Positive Findings (What's Done Well) ✅, Risk Matrix, Verification

### Community 53 - "Community 53"
Cohesion: 0.54
Nodes (6): validateEmail(), validateFeedbackInput(), validateLength(), validateWelcomeEmailInput(), ValidationError, ValidationError

### Community 54 - "Community 54"
Cohesion: 0.25
Nodes (7): params, resendClient, router, safeContent, safeTitle, safeUserEmail, validationErrors

### Community 55 - "Community 55"
Cohesion: 0.29
Nodes (6): AuthModal(), ERROR_KEY_MAP, FormErrors, getErrorKey(), resolveError(), TabMode

### Community 56 - "Community 56"
Cohesion: 0.25
Nodes (7): 1. Tech Stack, 2. Folder Structure, Backend (Modular Express), code:text (/), cvFit - Repository Overview, Database & Auth, Frontend

### Community 57 - "Community 57"
Cohesion: 0.25
Nodes (7): authResult, encodedPath, { filePath }, json, router, supabaseUrl, userJwt

### Community 58 - "Community 58"
Cohesion: 0.29
Nodes (6): AI, Backend (Modular Express), Công nghệ sử dụng (cvFit), Cloud Services, Frontend, Triển khai

### Community 59 - "Community 59"
Cohesion: 0.38
Nodes (4): extractTextFromImage(), AnalyzeRequest, callAnalyzeProxy(), getGeminiClient()

### Community 60 - "Community 60"
Cohesion: 0.29
Nodes (4): body, payload, result, token

### Community 61 - "Community 61"
Cohesion: 0.29
Nodes (6): params, resendClient, router, safeUserEmail, safeUserName, validationErrors

### Community 62 - "Community 62"
Cohesion: 0.29
Nodes (6): adminClient, { candidateId, analysisResult, matchScore, status }, router, serviceRoleKey, supabaseUrl, token

### Community 63 - "Community 63"
Cohesion: 0.73
Nodes (4): handleFeedback(), handler(), handleWelcome(), verifyRecaptcha()

### Community 64 - "Community 64"
Cohesion: 0.33
Nodes (3): buffer, PDF_HEADER, router

### Community 65 - "Community 65"
Cohesion: 0.4
Nodes (4): Dự án cvFit, Mục tiêu chính, Tài liệu kỹ thuật, Tính năng nổi bật

### Community 66 - "Community 66"
Cohesion: 0.4
Nodes (5): Immediate (0-7 days), Long-term (1-3 months), Medium-term (2-4 weeks), Remediation Priority, Short-term (1-2 weeks)

### Community 67 - "Community 67"
Cohesion: 0.5
Nodes (3): corsHeaders, params, secretKey

### Community 68 - "Community 68"
Cohesion: 0.5
Nodes (3): binaryString, bytes, corsHeaders

### Community 72 - "Community 72"
Cohesion: 0.67
Nodes (3): code:typescript (const isLocal = process.env.NODE_ENV !== 'production' || req), code:typescript (// Only trust NODE_ENV, never the request Host header), 🟡 MEDIUM-01: reCAPTCHA Bypass via Host Header Spoofing

### Community 73 - "Community 73"
Cohesion: 0.67
Nodes (3): code:sql (-- CURRENT (VULNERABLE)), code:sql (-- FIXED), 🟠 HIGH-01: CV Storage Bucket World-Readable (PII Exposure)

### Community 74 - "Community 74"
Cohesion: 0.67
Nodes (3): code:typescript (catch (error: any) {), code:typescript (catch (error: unknown) {), 🟡 MEDIUM-02: Error Message Information Disclosure

### Community 75 - "Community 75"
Cohesion: 0.67
Nodes (3): code:typescript (app.use(express.json({ limit: '50mb' }));       // ← TOO LAR), code:typescript (app.use(express.json({ limit: '15mb' }));   // 15MB is enoug), 🟠 HIGH-03: Large Body Parser Limit (DoS Vector)

### Community 76 - "Community 76"
Cohesion: 0.67
Nodes (3): code:typescript (cors({), code:typescript (const ALLOWED_ORIGINS = process.env.NODE_ENV === 'production), 🔵 LOW-03: CORS Allows Localhost in Production

### Community 77 - "Community 77"
Cohesion: 0.67
Nodes (3): code:typescript (// api/config.ts — CURRENT (VULNERABLE)), code:typescript (// FIXED), 🔴 CRITICAL-01: Gemini API Key Exposed via `/api/config`

## Knowledge Gaps
- **483 isolated node(s):** `code:text (┌───────────────────────────────────────────────────────────)`, `Luồng`, `Lưu trữ consent`, `Cấu hình privacy trên GA4`, `File liên quan` (+478 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `supabase` connect `Community 1` to `Community 3`, `Community 59`, `Community 42`, `Community 13`, `Community 45`, `Community 14`, `Community 16`, `Community 27`?**
  _High betweenness centrality (0.125) - this node is a cross-community bridge._
- **Why does `useUI()` connect `Community 16` to `Community 1`, `Community 3`, `Community 4`, `Community 10`, `Community 42`, `Community 12`, `Community 13`, `Community 14`, `Community 44`, `Community 11`, `Community 45`, `Community 18`, `Community 22`, `Community 55`?**
  _High betweenness centrality (0.090) - this node is a cross-community bridge._
- **Why does `AnalysisResult` connect `Community 27` to `Community 21`, `Community 22`?**
  _High betweenness centrality (0.076) - this node is a cross-community bridge._
- **What connects `code:text (┌───────────────────────────────────────────────────────────)`, `Luồng`, `Lưu trữ consent` to the rest of the system?**
  _483 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.09 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.11 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.09 - nodes in this community are weakly interconnected._