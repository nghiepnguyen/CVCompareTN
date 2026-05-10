# Graph Report - cv-compare-tn  (2026-05-10)

## Corpus Check
- 51 files · ~34,350 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 337 nodes · 549 edges · 37 communities (19 shown, 18 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 8 edges (avg confidence: 0.88)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `56a37e1e`
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
- [[_COMMUNITY_Utility Utilities|Utility Utilities]]
- [[_COMMUNITY_Project Readme|Project Readme]]
- [[_COMMUNITY_Overview Docs|Overview Docs]]
- [[_COMMUNITY_Tech Stack Docs|Tech Stack Docs]]
- [[_COMMUNITY_Frontend Docs|Frontend Docs]]
- [[_COMMUNITY_Workflow Docs|Workflow Docs]]
- [[_COMMUNITY_Deployment Docs|Deployment Docs]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]

## God Nodes (most connected - your core abstractions)
1. `useUI()` - 33 edges
2. `useAuth()` - 19 edges
3. `handleFirestoreError()` - 16 edges
4. `cn()` - 12 edges
5. `useAnalysis()` - 11 edges
6. `Coding Conventions & Guidelines` - 9 edges
7. `auth` - 7 edges
8. `AnalysisResult` - 7 edges
9. `Các bước thực hiện:` - 7 edges
10. `CV Matcher & Optimizer - Repository Overview` - 6 edges

## Surprising Connections (you probably didn't know these)
- `Admin Dashboard View` --calls--> `Express Backend Server`  [INFERRED]
  src/components/views/AdminView.tsx → server.ts
- `Express Backend Server` --conceptually_related_to--> `Resend Email Test Script`  [INFERRED]
  server.ts → test-resend.ts
- `App Root Component` --references--> `Auth Context Provider`  [EXTRACTED]
  src/App.tsx → src/context/AuthContext.tsx
- `App Root Component` --references--> `Analysis Context Provider`  [EXTRACTED]
  src/App.tsx → src/context/AnalysisContext.tsx
- `App Root Component` --references--> `UI Context Provider`  [EXTRACTED]
  src/App.tsx → src/context/UIContext.tsx

## Hyperedges (group relationships)
- **Global Application Contexts** — authcontext_authcontext, analysiscontext_analysiscontext, uicontext_uicontext [EXTRACTED 1.00]
- **Core Application Views** — dashboardview_dashboardview, analysisinputview_analysisinputview, historyview_historyview, resultview_resultview [INFERRED 0.85]

## Communities (37 total, 18 thin omitted)

### Community 0 - "Gemini Service & Admin"
Cohesion: 0.09
Nodes (38): PrivacyPolicyPage(), SupportDevelopmentPage(), TermsOfServicePage(), AnalysisProvider(), useAnalysis(), useAuth(), Tab, UIContext (+30 more)

### Community 1 - "UI Context & Main Views"
Cohesion: 0.08
Nodes (43): AnalysisContext, AnalysisContextType, AnalysisResult, analyzeCV(), CategorizedPoint, CategorizedScore, clearUserHistory(), ComparisonItem (+35 more)

### Community 2 - "Auth & Firebase"
Cohesion: 0.09
Nodes (24): AuthContext, AuthContextType, AuthProvider(), FirestoreErrorInfo, handleFirestoreError(), OperationType, subscribeToAllUsers(), UserProfile (+16 more)

### Community 3 - "App Layout & Legal"
Cohesion: 0.06
Nodes (29): AnalysisInputView Component, 1. Code Style & Conventions, 2. Architecture & Data Flow, 3. UI/UX Guidelines, 4. Specific Workflows, 5. Agent Behavior, AI Studio Agent Instructions, Core Directives (+21 more)

### Community 4 - "Backend API (Express)"
Cohesion: 0.11
Nodes (18): 1. Prerequisites, 1. Tech Stack, 2. Configuration (Secrets), 2. Folder Structure, 3. Deploy, 4. Deployment Flow (Firebase), 5. Environment Variables, 5. Environment Variables (Local Development) (+10 more)

### Community 5 - "Match Logic & Types"
Cohesion: 0.14
Nodes (13): 1. Triển khai trên Firebase (Khuyên dùng), 2. Triển khai trên Render, Các bước thực hiện:, Các biến môi trường cần thiết:, Cấu hình trong `render.yaml`:, code:bash (npm install -g firebase-tools), code:bash (firebase login), code:bash (npm run build) (+5 more)

### Community 6 - "Firebase Functions"
Cohesion: 0.15
Nodes (12): apiRouter, app, axios_1, buffer, cors_1, express_1, https_1, params (+4 more)

### Community 7 - "App Entry & Server"
Cohesion: 0.17
Nodes (11): 1. Phân phối cấu hình bảo mật, 2. Trích xuất nội dung PDF, 3. Xác thực reCAPTCHA, 4. Gửi Email (Feedback System), 5. Phục vụ ứng dụng (Static Serving), Biến môi trường (Environment Variables), Cấu trúc chính, code:env (GEMINI_API_KEY=          # Google AI API Key) (+3 more)

### Community 8 - "Core Application Logic"
Cohesion: 0.17
Nodes (11): 1. Internal API (Backend Proxy), 2. Dịch vụ lưu trữ (Firebase), 3. Google Gemini AI Service, `analyzeCV(cvText, jdText, language)`, Danh sách API Endpoints (CV Compare), `extractJDFromUrl(url)`, `extractTextFromImage(base64Data)`, `GET /api/config` (+3 more)

### Community 9 - "Error Handling"
Cohesion: 0.24
Nodes (10): analyzeCV(), CategorizedPoint, CategorizedScore, ComparisonItem, DetailedComparison, ensureApiKey(), extractJDFromUrl(), extractTextFromImage() (+2 more)

### Community 10 - "Email Testing"
Cohesion: 0.29
Nodes (5): Props, Candidate, JobDescription, MatchScoreBreakdown, Window

### Community 11 - "Vite Configuration"
Cohesion: 0.25
Nodes (7): api, apiRouter, app, buffer, params, parser, resendClient

### Community 12 - "Server Logic"
Cohesion: 0.25
Nodes (7): 1. Quản lý trạng thái tập trung, 2. Xử lý đa định dạng (Multi-format Support), 3. Hiển thị kết quả so sánh, Các luồng xử lý chính, Cấu trúc thư mục (Modular Architecture), Điểm nhấn UX, Kiến trúc Frontend (CV Compare)

### Community 13 - "API Documentation"
Cohesion: 0.29
Nodes (8): Admin Dashboard View, Analysis Context Provider, App Root Component, Auth Context Provider, Landing Page View, Express Backend Server, Resend Email Test Script, UI Context Provider

### Community 14 - "Main Entry"
Cohesion: 0.29
Nodes (6): 1. Luồng phân tích đồng thời (Batch Analysis Flow), 2. Luồng tối ưu hóa & Xuất bản, 3. Quản lý dữ liệu, Các bước trọng tâm:, code:mermaid (graph TD), Quy trình hoạt động (CV Compare Workflow)

### Community 15 - "Firebase Config"
Cohesion: 0.29
Nodes (6): Backend (Proxy Server), Công nghệ sử dụng (CV Compare), Dịch vụ & Cơ sở dữ liệu (Cloud Services), Frontend, Quản lý mã nguồn & Triển khai, Trí tuệ nhân tạo (AI)

### Community 17 - "Footer Component"
Cohesion: 0.5
Nodes (3): Dự án CV Compare, Mục tiêu chính (Core Objectives), Tính năng nổi bật (Key Features)

## Knowledge Gaps
- **145 isolated node(s):** `env`, `resend`, `https_1`, `express_1`, `cors_1` (+140 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **18 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useUI()` connect `Gemini Service & Admin` to `UI Context & Main Views`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Why does `ErrorBoundary` connect `Header Component` to `Gemini Service & Admin`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **Why does `useAuth()` connect `Gemini Service & Admin` to `UI Context & Main Views`, `Auth & Firebase`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **What connects `env`, `resend`, `https_1` to the rest of the system?**
  _145 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Gemini Service & Admin` be split into smaller, more focused modules?**
  _Cohesion score 0.09 - nodes in this community are weakly interconnected._
- **Should `UI Context & Main Views` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `Auth & Firebase` be split into smaller, more focused modules?**
  _Cohesion score 0.09 - nodes in this community are weakly interconnected._