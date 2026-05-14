# Graph Report - cv-compare-tn  (2026-05-14)

## Corpus Check
- 57 files · ~39,258 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 399 nodes · 633 edges · 42 communities (23 shown, 19 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 8 edges (avg confidence: 0.88)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `35f963c7`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Gemini Service & Admin|Gemini Service & Admin]]
- [[_COMMUNITY_UI Context & Main Views|UI Context & Main Views]]
- [[_COMMUNITY_Auth & Firebase|Auth & Firebase]]
- [[_COMMUNITY_App Layout & Legal|App Layout & Legal]]
- [[_COMMUNITY_Backend API (Express)|Backend API (Express)]]
- [[_COMMUNITY_Match Logic & Types|Match Logic & Types]]
- [[_COMMUNITY_Firebase Functions|Firebase Functions]]
- [[_COMMUNITY_App Entry & Server|App Entry & Server]]
- [[_COMMUNITY_Core Application Logic|Core Application Logic]]
- [[_COMMUNITY_Error Handling|Error Handling]]
- [[_COMMUNITY_Email Testing|Email Testing]]
- [[_COMMUNITY_Vite Configuration|Vite Configuration]]
- [[_COMMUNITY_Server Logic|Server Logic]]
- [[_COMMUNITY_API Documentation|API Documentation]]
- [[_COMMUNITY_Main Entry|Main Entry]]
- [[_COMMUNITY_Firebase Config|Firebase Config]]
- [[_COMMUNITY_Header Component|Header Component]]
- [[_COMMUNITY_Footer Component|Footer Component]]
- [[_COMMUNITY_Match Score Component|Match Score Component]]
- [[_COMMUNITY_Vite Tooling|Vite Tooling]]
- [[_COMMUNITY_Frontend Docs|Frontend Docs]]
- [[_COMMUNITY_Deployment Docs|Deployment Docs]]
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

## God Nodes (most connected - your core abstractions)
1. `useUI()` - 35 edges
2. `cn()` - 22 edges
3. `useAuth()` - 19 edges
4. `handleFirestoreError()` - 16 edges
5. `useAnalysis()` - 13 edges
6. `Hướng dẫn Triển khai (Deployment Guide)` - 11 edges
7. `Coding Conventions & Guidelines` - 9 edges
8. `Các bước thực hiện:` - 9 edges
9. `AnalysisResult` - 8 edges
10. `auth` - 7 edges

## Surprising Connections (you probably didn't know these)
- `Admin Dashboard View` --calls--> `Express Backend Server`  [INFERRED]
  src/components/views/AdminView.tsx → server.ts
- `Express Backend Server` --conceptually_related_to--> `Resend Email Test Script`  [INFERRED]
  server.ts → test-resend.ts
- `BentoCard()` --calls--> `cn()`  [EXTRACTED]
  src/components/views/LandingView.tsx → src/lib/utils.ts
- `FeatureIcon()` --calls--> `cn()`  [EXTRACTED]
  src/components/views/LandingView.tsx → src/lib/utils.ts
- `AdminView()` --calls--> `useAuth()`  [EXTRACTED]
  src/components/views/AdminView.tsx → src/context/AuthContext.tsx

## Hyperedges (group relationships)
- **Global Application Contexts** — authcontext_authcontext, analysiscontext_analysiscontext, uicontext_uicontext [EXTRACTED 1.00]
- **Core Application Views** — dashboardview_dashboardview, analysisinputview_analysisinputview, historyview_historyview, resultview_resultview [INFERRED 0.85]

## Communities (42 total, 19 thin omitted)

### Community 0 - "Gemini Service & Admin"
Cohesion: 0.05
Nodes (68): AnalysisContext, AnalysisContextType, AuthContext, AuthContextType, AuthProvider(), FirestoreErrorInfo, handleFirestoreError(), OperationType (+60 more)

### Community 1 - "UI Context & Main Views"
Cohesion: 0.08
Nodes (47): PrivacyPolicyPage(), SupportDevelopmentPage(), TermsOfServicePage(), AnalysisProvider(), useAnalysis(), useAuth(), Tab, UIContext (+39 more)

### Community 2 - "Auth & Firebase"
Cohesion: 0.06
Nodes (29): AnalysisInputView Component, 1. Code Style & Conventions, 2. Architecture & Data Flow, 3. UI/UX Guidelines, 4. Specific Workflows, 5. Agent Behavior, AI Studio Agent Instructions, Core Directives (+21 more)

### Community 3 - "App Layout & Legal"
Cohesion: 0.1
Nodes (22): 1. Triển khai trên Firebase (Khuyên dùng), 1. Triển khai trên Vercel, 1. Triển khai trên Vercel (Khuyên dùng), 2. Cấu hình Firebase (Bắt buộc), 2. Triển khai trên Render, 3. Các biến môi trường chi tiết, 3. Chế độ Phát triển (Local Development), 4. Cấu hình Điều hướng (vercel.json) (+14 more)

### Community 4 - "Backend API (Express)"
Cohesion: 0.09
Nodes (21): 1. Prerequisites, 1. Tech Stack, 1. Vercel Deployment (Recommended), 2. Configuration (Secrets), 2. Firebase Setup (Auth & DB), 2. Folder Structure, 3. Deploy, 4. Deployment Flow (Firebase) (+13 more)

### Community 5 - "Match Logic & Types"
Cohesion: 0.11
Nodes (19): 1. Phân phối cấu hình (`api/config.ts`), 1. Phân phối cấu hình bảo mật, 2. Trích xuất nội dung PDF, 2. Trích xuất nội dung PDF (`api/extract-pdf.ts`), 3. Xác thực reCAPTCHA, 3. Xác thực reCAPTCHA (`api/verify-recaptcha.ts`), 4. Gửi Email (Feedback System), 4. Hệ thống Email (`api/send-feedback.ts` & `api/send-welcome-email.ts`) (+11 more)

### Community 6 - "Firebase Functions"
Cohesion: 0.13
Nodes (17): analyzeCV(), ATSEvaluation, CategorizedPoint, CategorizedScore, ComparisonItem, DetailedComparison, ensureApiKey(), extractJDFromUrl() (+9 more)

### Community 8 - "Core Application Logic"
Cohesion: 0.15
Nodes (12): apiRouter, app, axios_1, buffer, cors_1, express_1, https_1, params (+4 more)

### Community 9 - "Error Handling"
Cohesion: 0.15
Nodes (12): 1. Internal API (Backend Proxy), 2. Dịch vụ lưu trữ (Firebase), 3. Google Gemini AI Service, `analyzeCV(cvData, jdText, language, isBinary?)`, `analyzeCV(cvText, jdText, language)`, Danh sách API Endpoints (CV Compare), `extractJDFromUrl(url)`, `extractTextFromImage(base64Data)` (+4 more)

### Community 10 - "Email Testing"
Cohesion: 0.29
Nodes (5): Props, Candidate, JobDescription, MatchScoreBreakdown, Window

### Community 11 - "Vite Configuration"
Cohesion: 0.25
Nodes (7): api, apiRouter, app, buffer, params, parser, resendClient

### Community 12 - "Server Logic"
Cohesion: 0.25
Nodes (7): Backend (Proxy Server), Backend (Serverless), Công nghệ sử dụng (CV Compare), Dịch vụ & Cơ sở dữ liệu (Cloud Services), Frontend, Quản lý mã nguồn & Triển khai, Trí tuệ nhân tạo (AI)

### Community 13 - "API Documentation"
Cohesion: 0.25
Nodes (7): 1. Quản lý trạng thái tập trung, 2. Xử lý đa định dạng (Multi-format Support), 3. Hiển thị kết quả so sánh, Các luồng xử lý chính, Cấu trúc thư mục (Modular Architecture), Điểm nhấn UX, Kiến trúc Frontend (CV Compare)

### Community 14 - "Main Entry"
Cohesion: 0.29
Nodes (8): Admin Dashboard View, Analysis Context Provider, App Root Component, Auth Context Provider, Landing Page View, Express Backend Server, Resend Email Test Script, UI Context Provider

### Community 15 - "Firebase Config"
Cohesion: 0.29
Nodes (6): 1. Luồng phân tích đồng thời (Batch Analysis Flow), 2. Luồng tối ưu hóa & Xuất bản, 3. Quản lý dữ liệu, Các bước trọng tâm:, code:mermaid (graph TD), Quy trình hoạt động (CV Compare Workflow)

### Community 17 - "Footer Component"
Cohesion: 0.5
Nodes (3): Dự án CV Compare, Mục tiêu chính (Core Objectives), Tính năng nổi bật (Key Features)

## Knowledge Gaps
- **175 isolated node(s):** `env`, `resend`, `https_1`, `express_1`, `cors_1` (+170 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **19 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useUI()` connect `UI Context & Main Views` to `Gemini Service & Admin`, `App Entry & Server`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Why does `ErrorBoundary` connect `Header Component` to `UI Context & Main Views`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **Why does `cn()` connect `UI Context & Main Views` to `Gemini Service & Admin`, `App Entry & Server`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **What connects `env`, `resend`, `https_1` to the rest of the system?**
  _175 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Gemini Service & Admin` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `UI Context & Main Views` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `Auth & Firebase` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._