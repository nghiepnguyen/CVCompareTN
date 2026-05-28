# Graph Report - cv-compare-tn  (2026-05-27)

## Corpus Check
- 153 files · ~70,881 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 472 nodes · 732 edges · 27 communities (26 shown, 1 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `08f150ae`
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

## God Nodes (most connected - your core abstractions)
1. `useUI()` - 27 edges
2. `useAuth()` - 23 edges
3. `Hạn mức phân tích CV/tháng (Supabase — không phải GA4)` - 13 edges
4. `isProPlan()` - 12 edges
5. `handlePaymentWebhook()` - 11 edges
6. `Phân tích & Đo lường (Analytics)` - 11 edges
7. `Kế hoạch khắc phục lỗi bảo mật Supabase` - 10 edges
8. `handlePaymentCreate()` - 10 edges
9. `createPayosPaymentLink()` - 10 edges
10. `handlePaymentCreate()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `AdminView()` --calls--> `useAuth()`  [EXTRACTED]
  src/components/views/AdminView.tsx → AuthContext.tsx
- `PaymentCancelView()` --calls--> `useUI()`  [EXTRACTED]
  src/components/views/PaymentCancelView.tsx → context/UIContext.tsx
- `handler()` --calls--> `handlePaymentCreate()`  [EXTRACTED]
  api/payment/create.ts → lib/payment/handlers.ts
- `SavedJdProvider()` --calls--> `useAuth()`  [EXTRACTED]
  src/context/analysis/SavedJdContext.tsx → AuthContext.tsx
- `SavedJdProvider()` --calls--> `useUI()`  [EXTRACTED]
  src/context/analysis/SavedJdContext.tsx → context/UIContext.tsx

## Communities (27 total, 1 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.07
Nodes (40): AnalysisRunProvider(), SavedJdContext, SavedJdProvider(), useSavedJds(), AppContent(), useAuth(), Tab, UIContext (+32 more)

### Community 1 - "Community 1"
Cohesion: 0.04
Nodes (44): 1.1 File migration, 1.2 Cập nhật check_analytics_quota, 2.1 `POST /api/payment/create`, 2.2 `POST /api/payment/webhook`, 2.3 Đăng ký route trong `server.ts`, 2.4 Thêm vào `vercel.json`, 3.1 `analyticsQuotaService.ts` — đọc plan từ response, 3.2 Giới hạn batch CV (+36 more)

### Community 2 - "Community 2"
Cohesion: 0.12
Nodes (34): activateProForOrder(), handlePaymentConfirm(), handlePaymentCreate(), handlePaymentWebhook(), isWebhookPaymentSuccess(), normalizeOrderCode(), PaymentHandlerResult, getMissingPaymentEnv() (+26 more)

### Community 3 - "Community 3"
Cohesion: 0.06
Nodes (35): Admin UI (`AdminView`), API theo dõi sự kiện, Bảng & cột, Bảng event đang track, Biến môi trường, Cấu hình privacy trên GA4, code:text (┌───────────────────────────────────────────────────────────), code:mermaid (flowchart TD) (+27 more)

### Community 4 - "Community 4"
Cohesion: 0.14
Nodes (23): AuthContext, AuthContextType, getDefaultMonthlyAnalyticsLimit(), parseLimitValue(), updateDefaultMonthlyAnalyticsLimit(), AdminPlanGrant, adminPlanSelectValue(), adminUpdateUserPlan() (+15 more)

### Community 5 - "Community 5"
Cohesion: 0.11
Nodes (18): htmlToText(), apiLimiter, emailLimiter, strictLimiter, BLOCKED_HOSTNAME_PATTERNS, BLOCKED_HOSTNAMES, hasPathTraversal(), ipv4ToNumber() (+10 more)

### Community 6 - "Community 6"
Cohesion: 0.2
Nodes (17): handlePaymentCreate(), PaymentHandlerResult, getMissingPaymentEnv(), paymentConfigErrorBody(), createPaymentRequestSignature(), createPayosPaymentLink(), createSignatureFromObject(), generateOrderCode() (+9 more)

### Community 7 - "Community 7"
Cohesion: 0.1
Nodes (19): Auth — Leaked password protection (bạn cần bật một lần), Checklist thực hiện, code:sql (SELECT p.proname, r.rolname,), code:sql (-- Fix 1: Revoke quyền gọi activate_pro_plan từ anon và auth), code:typescript (// server/routes/payment.ts (hoặc tương đương)), code:sql (-- Fix 2: Revoke quyền gọi các hàm ghi từ anon), code:sql (-- Fix 3: Sửa policy SELECT của bucket cv-files), code:sql (-- Fix 4: Revoke quyền anon gọi các hàm đọc thông tin user) (+11 more)

### Community 8 - "Community 8"
Cohesion: 0.16
Nodes (11): AnalysisRunContext, RatingSectionProps, AnalyticsQuota, checkAnalyticsQuota(), clearUserHistory(), deleteFromHistory(), getUserHistory(), incrementUsageCount() (+3 more)

### Community 9 - "Community 9"
Cohesion: 0.13
Nodes (14): 1. Triển khai trên Vercel, 2. Cấu hình Supabase (Bắt buộc), 3. Chế độ Phát triển (Local Development), 4. Cấu hình điều hướng (vercel.json), 5. Bảo mật mã nguồn và bí mật, Biến môi trường, Các bước thực hiện:, Các bước thực hiện: (+6 more)

### Community 10 - "Community 10"
Cohesion: 0.22
Nodes (8): analyzeCV(), parseGeminiJson(), ensureApiKey(), getGeminiClient(), loadKeyFromConfig(), buildAnalyzePromptEn(), buildAnalyzePromptVi(), PromptParams

### Community 11 - "Community 11"
Cohesion: 0.19
Nodes (7): admin, billing, LocaleEntry, SECTIONS, FaqItem, ReportLanguage, UiLabels

### Community 12 - "Community 12"
Cohesion: 0.26
Nodes (12): BLOCKED_HOSTNAME_PATTERNS, BLOCKED_HOSTNAMES, extractTextFromHtml(), handler(), hasPathTraversal(), htmlToText(), ipv4ToNumber(), isBlockedHostname() (+4 more)

### Community 13 - "Community 13"
Cohesion: 0.15
Nodes (12): 1. Internal API (Backend Proxy), 2. Dịch vụ lưu trữ & xác thực (Supabase), Danh sách API Endpoints (CV Compare), Edge Function (tùy chọn — Supabase), `GET /api/config`, `POST /api/send-feedback`, `POST /api/send-welcome-email`, RPC & quota phân tích (client gọi qua `supabase.rpc`) (+4 more)

### Community 14 - "Community 14"
Cohesion: 0.15
Nodes (12): AdminView, DashboardView, HistoryView, LandingView, NoPermissionView, PaymentCancelView, PaymentSuccessView, PrintView (+4 more)

### Community 15 - "Community 15"
Cohesion: 0.17
Nodes (11): Adding a new endpoint, API routing matrix (Vercel · Express · Supabase), code:mermaid (flowchart TB), Express (`npm start` → `server.ts` + `server/routes/`), Out of scope (this doc), Quick reference, Request flow (high level), Supabase data plane (not HTTP `/api`) (+3 more)

### Community 16 - "Community 16"
Cohesion: 0.17
Nodes (11): 1. Quản lý trạng thái tập trung, 2. Xử lý đa định dạng (Multi-format Support), 3. Hiển thị kết quả so sánh, Các luồng xử lý chính, Cấu trúc thư mục (Modular Architecture), Entry & shell (`src/app/`), Global state (`src/context/`), Điểm nhấn UX (+3 more)

### Community 17 - "Community 17"
Cohesion: 0.17
Nodes (11): 1. Cấu hình (`/api/config`), 2. Trích xuất PDF, 3. Xác thực reCAPTCHA, 4. Thanh toán PayOS (`/api/payment/create` & `/api/payment/webhook`), 5. Hệ thống Email (`/api/send-feedback` & `/api/send-welcome-email`), Biến môi trường (Environment Variables), Các chức năng chính (Routes), Cấu trúc & Runtime (+3 more)

### Community 18 - "Community 18"
Cohesion: 0.2
Nodes (9): 1. Luồng phân tích đồng thời (Batch Analysis Flow), 2. Luồng tối ưu hóa & Xuất bản, 4. Luồng thanh toán Pro (PayOS Flow), 5. Quản lý dữ liệu, Các bước trọng tâm:, code:mermaid (graph TD), code:mermaid (graph TD), Gia hạn cộng dồn (nhiều lần mua Pro) (+1 more)

### Community 19 - "Community 19"
Cohesion: 0.2
Nodes (9): 1. Code Style & Conventions, 2. Architecture & Data Flow, 3. UI/UX Guidelines, 4. Specific Workflows, 5. Agent Behavior, 6. Secrets & Repository Hygiene, AI Studio Agent Instructions, Core Directives (+1 more)

### Community 20 - "Community 20"
Cohesion: 0.25
Nodes (7): 1. Tech Stack, 2. Folder Structure, Backend (Modular Express), code:text (/), CV Matcher & Optimizer - Repository Overview, Database & Auth, Frontend

### Community 21 - "Community 21"
Cohesion: 0.29
Nodes (6): Backend (Modular Express), Công nghệ sử dụng (CV Matcher & Optimizer), Dịch vụ & Cơ sở dữ liệu (Cloud Services), Frontend, Quản lý mã nguồn & Triển khai, Trí tuệ nhân tạo (AI)

### Community 22 - "Community 22"
Cohesion: 0.4
Nodes (4): Dự án CV Compare, Mục tiêu chính (Core Objectives), Tài liệu kỹ thuật, Tính năng nổi bật (Key Features)

### Community 23 - "Community 23"
Cohesion: 0.5
Nodes (3): input, obj, result

### Community 24 - "Community 24"
Cohesion: 0.5
Nodes (3): params, resendClient, router

## Knowledge Gaps
- **178 isolated node(s):** `BLOCKED_HOSTNAMES`, `BLOCKED_HOSTNAME_PATTERNS`, `PRIVATE_IPV4_RANGES`, `Frontend`, `Backend (Modular Express)` (+173 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useUI()` connect `Community 0` to `Community 8`, `Community 4`, `Community 14`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Why does `useAuth()` connect `Community 0` to `Community 8`, `Community 4`, `Community 14`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **What connects `BLOCKED_HOSTNAMES`, `BLOCKED_HOSTNAME_PATTERNS`, `PRIVATE_IPV4_RANGES` to the rest of the system?**
  _178 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.04 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.12 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._