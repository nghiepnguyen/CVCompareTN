# Graph Report - cv-compare-tn  (2026-06-01)

## Corpus Check
- 184 files · ~99,985 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1019 nodes · 1946 edges · 57 communities (52 shown, 5 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 12 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `e6972618`
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
- [[_COMMUNITY_Community 52|Community 52]]

## God Nodes (most connected - your core abstractions)
1. `useUI()` - 78 edges
2. `useAuth()` - 44 edges
3. `cn()` - 41 edges
4. `formatLabel()` - 26 edges
5. `isProPlan()` - 15 edges
6. `handlePaymentConfirm()` - 14 edges
7. `Hạn mức phân tích CV/tháng (Supabase — không phải GA4)` - 14 edges
8. `LandingLabels` - 14 edges
9. `handlePaymentWebhook()` - 13 edges
10. `createPayosPaymentLink()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `AboutPage()` --calls--> `useUI()`  [EXTRACTED]
  components/AboutPage.tsx → src/context/UIContext.tsx
- `AnalysisLoadingState()` --calls--> `formatLabel()`  [EXTRACTED]
  components/views/result/AnalysisLoadingState.tsx → src/translations/index.ts
- `handler()` --calls--> `handlePaymentCreate()`  [EXTRACTED]
  api/payment/create.ts → lib/payment/handlers.ts
- `AnalysisRunProvider()` --calls--> `useAuth()`  [EXTRACTED]
  AnalysisRunContext.tsx → src/context/AuthContext.tsx
- `AnalysisRunProvider()` --calls--> `useUI()`  [EXTRACTED]
  AnalysisRunContext.tsx → src/context/UIContext.tsx

## Communities (57 total, 5 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (48): AnalysisRunContext, AnalysisRunProvider(), useAnalysisRun(), useSavedCvs(), SavedJdContext, AnalysisContextType, AnalysisRunContextType, SavedCvContextType (+40 more)

### Community 1 - "Community 1"
Cohesion: 0.11
Nodes (41): activateProForOrder(), fetchProfileForEmail(), handlePaymentConfirm(), handlePaymentCreate(), handlePaymentWebhook(), isWebhookPaymentSuccess(), normalizeOrderCode(), notifyVipUpgrade() (+33 more)

### Community 2 - "Community 2"
Cohesion: 0.09
Nodes (42): analyzeCV(), parseGeminiJson(), extractTextFromImage(), ensureApiKey(), getGeminiClient(), loadKeyFromConfig(), isRecord(), normalizeParsedCV() (+34 more)

### Community 3 - "Community 3"
Cohesion: 0.04
Nodes (45): Bước 1 — Migration Supabase, Bước 2 — Backend: endpoint PayOS Recruiter, Bước 3 — Frontend, Bước 4 — UpgradeView cập nhật, Bước 5 — Xử lý hết hạn, Bảng mới, Backend, Cấu trúc file mới (+37 more)

### Community 4 - "Community 4"
Cohesion: 0.04
Nodes (44): 1.1 File migration, 1.2 Cập nhật check_analytics_quota, 2.1 `POST /api/payment/create`, 2.2 `POST /api/payment/webhook`, 2.3 Đăng ký route trong `server.ts`, 2.4 Thêm vào `vercel.json`, 3.1 `analyticsQuotaService.ts` — đọc plan từ response, 3.2 Giới hạn batch CV (+36 more)

### Community 5 - "Community 5"
Cohesion: 0.05
Nodes (42): code:gitignore (# Graphify AST cache (regenerated by `graphify update`; keep), code:typescript (export interface SavedJdModalProps {), code:typescript (export default function AppShell() {), code:typescript (export { default } from './app/AppShell';), code:bash (npm run lint && npm run build), code:bash (git commit -m "$(cat <<'EOF'), code:typescript (confirmSaveJD: (title: string, jdContent: string) => Promise), code:typescript (const confirmSaveJD = async (title: string, jdContent: strin) (+34 more)

### Community 6 - "Community 6"
Cohesion: 0.13
Nodes (24): CtaSection(), DemoResultSection(), FaqSection(), HeroSection(), HowItWorksSection(), buildRows(), ComparisonRow, Plan (+16 more)

### Community 7 - "Community 7"
Cohesion: 0.07
Nodes (19): SavedJdsListModalProps, getMatchingCategoryLabel(), about, admin, billing, footer, history, LocaleEntry (+11 more)

### Community 8 - "Community 8"
Cohesion: 0.09
Nodes (31): SavedCvContext, AboutPage, AdminView, DashboardView, HistoryView, LandingView, NoPermissionView, PaymentCancelView (+23 more)

### Community 9 - "Community 9"
Cohesion: 0.06
Nodes (36): Admin UI (`AdminView`), API theo dõi sự kiện, Bảng & cột, Bảng event đang track, Bảo mật RPC (Security Advisor), Biến môi trường, Cấu hình privacy trên GA4, code:text (┌───────────────────────────────────────────────────────────) (+28 more)

### Community 10 - "Community 10"
Cohesion: 0.11
Nodes (22): AppErrorBoundary, AnalyticsBootstrap(), CookieConsentBannerProps, AnalyticsConsent, applyGrantedConsent(), denyAnalyticsConsent(), ensureDataLayer(), eventQueue (+14 more)

### Community 11 - "Community 11"
Cohesion: 0.12
Nodes (27): cleanText(), ProcessedFile, processFile(), result, RecruiterContext, RecruiterContextValue, CampaignStatus, CandidateCV (+19 more)

### Community 12 - "Community 12"
Cohesion: 0.15
Nodes (20): useAnalysis(), SavedCvProvider(), SavedJdProvider(), useSavedJds(), AppContent(), PrivacyPolicyPage(), TermsOfServicePage(), useAuth() (+12 more)

### Community 13 - "Community 13"
Cohesion: 0.07
Nodes (26): 2a — `App.tsx` decomposition, 2b — Two analysis providers (B2), 2c — LandingView, code:gitignore (# Graphify — regenerate with `graphify update .`; keep human), code:block2 (src/app/), code:typescript (export { default } from './app/AppShell';), code:block4 (AuthProvider → UIProvider → AnalysisProvider (composer) → Ap), code:block5 (src/context/analysis/) (+18 more)

### Community 14 - "Community 14"
Cohesion: 0.22
Nodes (16): Header(), formatPlanExpiryDate(), HISTORY_DAYS_BY_PLAN, isProPlan(), isRecruiterPlan(), MAX_BATCH_BY_PLAN, MAX_CAMPAIGN_CVS, MAX_CAMPAIGNS (+8 more)

### Community 15 - "Community 15"
Cohesion: 0.13
Nodes (12): CampaignCard(), CampaignCardProps, useStatusConfig(), CandidatePanel(), CandidatePanelProps, CandidateTable(), CandidateTableProps, CreateCampaignModal() (+4 more)

### Community 16 - "Community 16"
Cohesion: 0.2
Nodes (18): handlePaymentCreate(), handlePaymentWebhook(), PaymentHandlerResult, getMissingPaymentEnv(), paymentConfigErrorBody(), createPaymentRequestSignature(), createPayosPaymentLink(), createSignatureFromObject() (+10 more)

### Community 17 - "Community 17"
Cohesion: 0.2
Nodes (12): MobileBottomNavProps, cn(), AnalysisDetailsTab, AnalysisDetailsTabProps, ComparisonOverview(), ComparisonOverviewProps, DetailedComparisonTab(), DetailedComparisonTabProps (+4 more)

### Community 18 - "Community 18"
Cohesion: 0.16
Nodes (13): Tab, tabFromPath(), UIContext, UIContextType, UIProvider(), CvMarkdownBody, OptimizationTab, OptimizationTabProps (+5 more)

### Community 19 - "Community 19"
Cohesion: 0.1
Nodes (19): Auth — Leaked password protection (bạn cần bật một lần), Checklist thực hiện, code:sql (SELECT p.proname, r.rolname,), code:sql (-- Fix 1: Revoke quyền gọi activate_pro_plan từ anon và auth), code:typescript (// server/routes/payment.ts (hoặc tương đương)), code:sql (-- Fix 2: Revoke quyền gọi các hàm ghi từ anon), code:sql (-- Fix 3: Sửa policy SELECT của bucket cv-files), code:sql (-- Fix 4: Revoke quyền anon gọi các hàm đọc thông tin user) (+11 more)

### Community 20 - "Community 20"
Cohesion: 0.14
Nodes (15): htmlToText(), BLOCKED_HOSTNAME_PATTERNS, BLOCKED_HOSTNAMES, hasPathTraversal(), ipv4ToNumber(), isBlockedHostname(), isPrivateIPv4(), isPrivateIPv6() (+7 more)

### Community 21 - "Community 21"
Cohesion: 0.11
Nodes (17): 1. Quản lý trạng thái tập trung, 2. Xử lý đa định dạng (Multi-format Support), 3. Hiển thị kết quả so sánh, 4. Luồng Recruiter (Nhà tuyển dụng), Đa ngôn ngữ UI (`src/translations/`), Các luồng xử lý chính, Cấu trúc thư mục (Modular Architecture), Custom hooks (`src/hooks/`) (+9 more)

### Community 22 - "Community 22"
Cohesion: 0.11
Nodes (17): 1. General Principles, 2. Naming Conventions, 3. React Best Practices, 4. Performance Optimization, 4. Styling (Tailwind CSS), 5. TypeScript Usage, 6. Error Handling, 7. Comments and Documentation (+9 more)

### Community 23 - "Community 23"
Cohesion: 0.12
Nodes (14): 1. Triển khai trên Vercel, 2. Cấu hình Supabase (Bắt buộc), 3. Chế độ Phát triển (Local Development), 4. Cấu hình điều hướng (vercel.json), 5. Bảo mật mã nguồn và bí mật, Biến môi trường, Các bước thực hiện:, Các bước thực hiện: (+6 more)

### Community 24 - "Community 24"
Cohesion: 0.17
Nodes (11): ConfirmPaymentResponse, confirmProPayment(), CreateCheckoutResponse, createProCheckout(), createRecruiterCheckout(), parsePaymentApiResponse(), PaymentApiError, PaymentSuccessView() (+3 more)

### Community 25 - "Community 25"
Cohesion: 0.22
Nodes (12): cvMarkdownHasHeadings(), fixMarkdownHeadingHashes(), fullRewrittenCvToPlainText(), isBulletLine(), isSectionLine(), normalizeSectionCandidate(), preprocessFullRewrittenCvMarkdown(), promotePlainTextCvToMarkdown() (+4 more)

### Community 26 - "Community 26"
Cohesion: 0.19
Nodes (8): AMP, escapeHtml(), params, resendClient, router, safeUserEmail, safeUserName, validationErrors

### Community 27 - "Community 27"
Cohesion: 0.21
Nodes (7): apiLimiter, emailLimiter, staticLimiter, strictLimiter, router, params, router

### Community 28 - "Community 28"
Cohesion: 0.15
Nodes (12): 1. Cấu hình (`/api/config`), 2. Trích xuất PDF, 3. Xác thực reCAPTCHA, 4. Thanh toán PayOS (`/api/payment/create` & `/api/payment/webhook`), 5. Hệ thống Email (`/api/send-feedback` & `/api/send-welcome-email`), Biến môi trường (Environment Variables), Các chức năng chính (Routes), Cấu trúc & Runtime (+4 more)

### Community 29 - "Community 29"
Cohesion: 0.26
Nodes (12): BLOCKED_HOSTNAME_PATTERNS, BLOCKED_HOSTNAMES, extractTextFromHtml(), handler(), hasPathTraversal(), htmlToText(), ipv4ToNumber(), isBlockedHostname() (+4 more)

### Community 30 - "Community 30"
Cohesion: 0.17
Nodes (11): 1. Internal API (Backend Proxy), 2. Dịch vụ lưu trữ & xác thực (Supabase), Danh sách API Endpoints (cvFit), Edge Function (tùy chọn — Supabase), `GET /api/config`, `POST /api/send-feedback`, `POST /api/send-welcome-email`, RPC & quota phân tích (client gọi qua `supabase.rpc`) (+3 more)

### Community 31 - "Community 31"
Cohesion: 0.17
Nodes (11): Adding a new endpoint, API routing matrix (Vercel · Express · Supabase), code:mermaid (flowchart TB), Express (`npm start` → `server.ts` + `server/routes/`), Out of scope (this doc), Quick reference, Request flow (high level), Supabase data plane (not HTTP `/api`) (+3 more)

### Community 32 - "Community 32"
Cohesion: 0.2
Nodes (9): 1. Luồng phân tích đồng thời (Batch Analysis Flow), 2. Luồng tối ưu hóa & Xuất bản, 4. Luồng thanh toán Pro (PayOS Flow), 5. Quản lý dữ liệu, Các bước trọng tâm:, code:mermaid (graph TD), code:mermaid (graph TD), Gia hạn cộng dồn (nhiều lần mua Pro) (+1 more)

### Community 33 - "Community 33"
Cohesion: 0.2
Nodes (9): 1. Code Style & Conventions, 2. Architecture & Data Flow, 3. UI/UX Guidelines, 4. Specific Workflows, 5. Agent Behavior, 6. Secrets & Repository Hygiene, AI Studio Agent Instructions, Core Directives (+1 more)

### Community 34 - "Community 34"
Cohesion: 0.47
Nodes (5): validateEmail(), validateFeedbackInput(), validateLength(), validateWelcomeEmailInput(), ValidationError

### Community 35 - "Community 35"
Cohesion: 0.25
Nodes (7): params, resendClient, router, safeContent, safeTitle, safeUserEmail, validationErrors

### Community 36 - "Community 36"
Cohesion: 0.25
Nodes (7): 1. Tech Stack, 2. Folder Structure, Backend (Modular Express), code:text (/), cvFit - Repository Overview, Database & Auth, Frontend

### Community 37 - "Community 37"
Cohesion: 0.29
Nodes (6): createProgressSimulator(), ProgressSimulatorOptions, calls, lastCalled, maxCalled, { stop }

### Community 38 - "Community 38"
Cohesion: 0.29
Nodes (6): adminClient, { candidateId, analysisResult, matchScore, status }, router, serviceRoleKey, supabaseUrl, token

### Community 39 - "Community 39"
Cohesion: 0.29
Nodes (6): Backend (Modular Express), Công nghệ sử dụng (cvFit), Dịch vụ & Cơ sở dữ liệu (Cloud Services), Frontend, Quản lý mã nguồn & Triển khai, Trí tuệ nhân tạo (AI)

### Community 40 - "Community 40"
Cohesion: 0.4
Nodes (4): Dự án cvFit, Mục tiêu chính (Core Objectives), Tài liệu kỹ thuật, Tính năng nổi bật (Key Features)

### Community 41 - "Community 41"
Cohesion: 0.4
Nodes (3): buffer, PDF_HEADER, router

### Community 43 - "Community 43"
Cohesion: 0.67
Nodes (3): handler(), isPdfBuffer(), PDF_HEADER

### Community 44 - "Community 44"
Cohesion: 0.5
Nodes (3): corsHeaders, params, secretKey

### Community 45 - "Community 45"
Cohesion: 0.5
Nodes (3): binaryString, bytes, corsHeaders

## Knowledge Gaps
- **329 isolated node(s):** `PayosPaymentRequestInfo`, `Mục tiêu chính (Core Objectives)`, `Tính năng nổi bật (Key Features)`, `Tài liệu kỹ thuật`, `So sánh 3 gói` (+324 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useUI()` connect `Community 12` to `Community 0`, `Community 6`, `Community 8`, `Community 42`, `Community 11`, `Community 10`, `Community 14`, `Community 15`, `Community 17`, `Community 18`, `Community 24`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **Why does `cn()` connect `Community 17` to `Community 0`, `Community 6`, `Community 8`, `Community 42`, `Community 10`, `Community 12`, `Community 14`, `Community 15`, `Community 18`, `Community 24`, `Community 25`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **Why does `useAuth()` connect `Community 12` to `Community 0`, `Community 6`, `Community 8`, `Community 11`, `Community 14`, `Community 15`, `Community 17`, `Community 18`, `Community 24`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **What connects `PayosPaymentRequestInfo`, `Mục tiêu chính (Core Objectives)`, `Tính năng nổi bật (Key Features)` to the rest of the system?**
  _329 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.11 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.09 - nodes in this community are weakly interconnected._