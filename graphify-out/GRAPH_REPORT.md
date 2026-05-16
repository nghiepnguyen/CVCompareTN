# Graph Report - cv-compare-tn  (2026-05-16)

## Corpus Check
- 67 files · ~37,641 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 436 nodes · 888 edges · 41 communities (24 shown, 17 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 8 edges (avg confidence: 0.88)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ade9955f`
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
- [[_COMMUNITY_Functions Logic|Functions Logic]]
- [[_COMMUNITY_Utility Utilities|Utility Utilities]]
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

## God Nodes (most connected - your core abstractions)
1. `useUI()` - 39 edges
2. `useAuth()` - 23 edges
3. `LandingView` - 21 edges
4. `cn()` - 21 edges
5. `handleFirestoreError()` - 20 edges
6. `cn()` - 19 edges
7. `useAnalysis()` - 15 edges
8. `AnalysisResult` - 14 edges
9. `AnalysisInputView()` - 13 edges
10. `AdminView` - 12 edges

## Surprising Connections (you probably didn't know these)
- ``extractJDFromUrl(url)`` --calls--> `ensureApiKey()`  [EXTRACTED]
  docs/5_api.md → src/services/ai/geminiProvider.ts
- ``extractJDFromUrl(url)`` --calls--> `getGeminiClient()`  [EXTRACTED]
  docs/5_api.md → src/services/ai/geminiProvider.ts
- `Admin Dashboard View` --calls--> `Express Backend Server`  [INFERRED]
  src/components/views/AdminView.tsx → server.ts
- `Express Backend Server` --conceptually_related_to--> `Resend Email Test Script`  [INFERRED]
  server.ts → test-resend.ts
- `AnalysisInputView Component` --calls--> `Match Service`  [INFERRED]
  src/components/views/AnalysisInputView.tsx → src/services/matchService.ts

## Communities (41 total, 17 thin omitted)

### Community 0 - "Gemini Service & Admin"
Cohesion: 0.08
Nodes (48): AnalysisContext, AnalysisContextType, AuthContext, AuthContextType, AuthProvider(), db, serviceAccount, supabase (+40 more)

### Community 1 - "UI Context & Main Views"
Cohesion: 0.12
Nodes (40): AnalysisProvider(), useAnalysis(), useAuth(), Tab, UIContext, UIContextType, UIProvider(), useUI() (+32 more)

### Community 2 - "Auth & Firebase"
Cohesion: 0.11
Nodes (32): analyzeCV(), parseGeminiJson(), extractJDFromUrl(), extractTextFromImage(), ensureApiKey(), getGeminiClient(), AnalysisResult, ATSEvaluation (+24 more)

### Community 3 - "App Layout & Legal"
Cohesion: 0.08
Nodes (29): AnalysisInputView Component, 1. Code Style & Conventions, 2. Architecture & Data Flow, 3. UI/UX Guidelines, 4. Specific Workflows, 5. Agent Behavior, AI Studio Agent Instructions, Core Directives (+21 more)

### Community 4 - "Backend API (Express)"
Cohesion: 0.09
Nodes (25): 1. Cấu hình (`/api/config`), 1. Phân phối cấu hình (`api/config.ts`), 1. Phân phối cấu hình bảo mật, 2. Trích xuất nội dung PDF, 2. Trích xuất nội dung PDF (`api/extract-pdf.ts`), 2. Trích xuất PDF (`/api/extract-pdf/extract`), 3. Xác thực reCAPTCHA, 3. Xác thực reCAPTCHA (`api/verify-recaptcha.ts`) (+17 more)

### Community 5 - "Match Logic & Types"
Cohesion: 0.09
Nodes (22): 1. Triển khai trên Firebase (Khuyên dùng), 1. Triển khai trên Vercel, 2. Cấu hình Firebase (Bắt buộc), 2. Cấu hình Supabase (Bắt buộc), 2. Triển khai trên Render, 3. Các biến môi trường chi tiết, 3. Chế độ Phát triển (Local Development), 4. Cấu hình điều hướng (vercel.json) (+14 more)

### Community 6 - "Firebase Functions"
Cohesion: 0.1
Nodes (21): 1. Prerequisites, 1. Vercel Deployment (Recommended), 2. Configuration (Secrets), 2. Firebase Setup (Auth & DB), 2. Folder Structure, 3. Deploy, 3. Deployment, 4. Deployment Flow (Firebase) (+13 more)

### Community 7 - "App Entry & Server"
Cohesion: 0.16
Nodes (11): params, resendClient, params, resendClient, router, router, params, router (+3 more)

### Community 8 - "Core Application Logic"
Cohesion: 0.14
Nodes (13): apiRouter, app, axios_1, buffer, cors_1, express_1, https_1, parser (+5 more)

### Community 9 - "Error Handling"
Cohesion: 0.24
Nodes (13): LandingView, BentoCard(), CtaSection(), DemoResultSection(), FaqSection(), FeatureIcon(), HeroSection(), HowItWorksSection() (+5 more)

### Community 10 - "Email Testing"
Cohesion: 0.18
Nodes (14): 1. Tech Stack, Backend, Backend (Modular Express), Database & Auth, Frontend, Backend (Modular Express), Backend (Proxy Server), Backend (Serverless) (+6 more)

### Community 11 - "Vite Configuration"
Cohesion: 0.15
Nodes (12): 1. Internal API (Backend Proxy), 2. Dịch vụ lưu trữ (Firebase), 2. Dịch vụ lưu trữ & xác thực (Supabase), 3. Google Gemini AI Service, `analyzeCV(cvData, jdText, language, isBinary?)`, `analyzeCV(cvText, jdText, language)`, Danh sách API Endpoints (CV Compare), `extractTextFromImage(base64Data)` (+4 more)

### Community 12 - "Server Logic"
Cohesion: 0.18
Nodes (10): binaryString, bytes, corsHeaders, api, apiRouter, app, buffer, params (+2 more)

### Community 14 - "Main Entry"
Cohesion: 0.25
Nodes (4): router, corsHeaders, params, secretKey

### Community 15 - "Firebase Config"
Cohesion: 0.25
Nodes (7): 1. Quản lý trạng thái tập trung, 2. Xử lý đa định dạng (Multi-format Support), 3. Hiển thị kết quả so sánh, Các luồng xử lý chính, Cấu trúc thư mục (Modular Architecture), Điểm nhấn UX, Kiến trúc Frontend (CV Compare)

### Community 16 - "Header Component"
Cohesion: 0.29
Nodes (8): Admin Dashboard View, Analysis Context Provider, App Root Component, Auth Context Provider, Landing Page View, Express Backend Server, Resend Email Test Script, UI Context Provider

### Community 17 - "Footer Component"
Cohesion: 0.29
Nodes (6): 1. Luồng phân tích đồng thời (Batch Analysis Flow), 2. Luồng tối ưu hóa & Xuất bản, 3. Quản lý dữ liệu, Các bước trọng tâm:, code:mermaid (graph TD), Quy trình hoạt động (CV Compare Workflow)

### Community 18 - "Match Score Component"
Cohesion: 0.33
Nodes (3): resend, corsHeaders, resend

### Community 20 - "Functions Logic"
Cohesion: 0.5
Nodes (3): Dự án CV Compare, Mục tiêu chính (Core Objectives), Tính năng nổi bật (Key Features)

## Knowledge Gaps
- **154 isolated node(s):** `env`, `resend`, `router`, `params`, `resendClient` (+149 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **17 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Firebase Configuration` connect `Firebase Functions` to `Gemini Service & Admin`?**
  _High betweenness centrality (0.113) - this node is a cross-community bridge._
- **Why does `CV Matcher & Optimizer - Repository Overview` connect `Firebase Functions` to `Email Testing`?**
  _High betweenness centrality (0.103) - this node is a cross-community bridge._
- **What connects `env`, `resend`, `router` to the rest of the system?**
  _154 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Gemini Service & Admin` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `UI Context & Main Views` be split into smaller, more focused modules?**
  _Cohesion score 0.12 - nodes in this community are weakly interconnected._
- **Should `Auth & Firebase` be split into smaller, more focused modules?**
  _Cohesion score 0.11 - nodes in this community are weakly interconnected._
- **Should `App Layout & Legal` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._