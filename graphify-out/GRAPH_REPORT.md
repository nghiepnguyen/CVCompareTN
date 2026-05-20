# Graph Report - /Users/nghiepnguyen/My Files/cv-compare-tn  (2026-05-16)

## Corpus Check
- Corpus is ~47,571 words - fits in a single context window. You may not need a graph.

## Summary
- 349 nodes · 642 edges · 39 communities (21 shown, 18 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 10 edges (avg confidence: 0.79)
- Token cost: 131,965 input · 6,899 output

## Community Hubs (Navigation)
- [[_COMMUNITY_App Shell & Result UI|App Shell & Result UI]]
- [[_COMMUNITY_AI Analysis & Types|AI Analysis & Types]]
- [[_COMMUNITY_Express & Edge Functions|Express & Edge Functions]]
- [[_COMMUNITY_Supabase Auth & Users|Supabase Auth & Users]]
- [[_COMMUNITY_i18n Translations|i18n Translations]]
- [[_COMMUNITY_CV Markdown & Optimization|CV Markdown & Optimization]]
- [[_COMMUNITY_GA4 Analytics & Consent|GA4 Analytics & Consent]]
- [[_COMMUNITY_Analysis Context & History|Analysis Context & History]]
- [[_COMMUNITY_Landing Page Marketing|Landing Page Marketing]]
- [[_COMMUNITY_Legacy Match Scoring|Legacy Match Scoring]]
- [[_COMMUNITY_Gemini Extraction|Gemini Extraction]]
- [[_COMMUNITY_Error Boundary|Error Boundary]]
- [[_COMMUNITY_Vite Build & GA Tag|Vite Build & GA Tag]]
- [[_COMMUNITY_Resend Test Script|Resend Test Script]]
- [[_COMMUNITY_Vercel API Config|Vercel API Config]]
- [[_COMMUNITY_Vercel Welcome Email|Vercel Welcome Email]]
- [[_COMMUNITY_Vercel Feedback API|Vercel Feedback API]]
- [[_COMMUNITY_Vercel reCAPTCHA API|Vercel reCAPTCHA API]]
- [[_COMMUNITY_Vercel PDF Extract API|Vercel PDF Extract API]]
- [[_COMMUNITY_Privacy Policy Page|Privacy Policy Page]]
- [[_COMMUNITY_Terms of Service Page|Terms of Service Page]]
- [[_COMMUNITY_Semantic Cluster 27|Semantic Cluster 27]]
- [[_COMMUNITY_Semantic Cluster 28|Semantic Cluster 28]]
- [[_COMMUNITY_Semantic Cluster 29|Semantic Cluster 29]]
- [[_COMMUNITY_Semantic Cluster 30|Semantic Cluster 30]]
- [[_COMMUNITY_Semantic Cluster 31|Semantic Cluster 31]]
- [[_COMMUNITY_Semantic Cluster 32|Semantic Cluster 32]]
- [[_COMMUNITY_Semantic Cluster 33|Semantic Cluster 33]]
- [[_COMMUNITY_Semantic Cluster 34|Semantic Cluster 34]]
- [[_COMMUNITY_Semantic Cluster 35|Semantic Cluster 35]]
- [[_COMMUNITY_Semantic Cluster 36|Semantic Cluster 36]]
- [[_COMMUNITY_Semantic Cluster 37|Semantic Cluster 37]]
- [[_COMMUNITY_Semantic Cluster 38|Semantic Cluster 38]]

## God Nodes (most connected - your core abstractions)
1. `useUI()` - 39 edges
2. `cn()` - 23 edges
3. `useAuth()` - 19 edges
4. `useAnalysis()` - 13 edges
5. `analyzeCV()` - 10 edges
6. `initGa4Bootstrap()` - 8 edges
7. `supabase` - 8 edges
8. `coerceJsonField()` - 8 edges
9. `normalizeAnalysisPayload()` - 8 edges
10. `loadGA4()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `Coding Conventions` --references--> `AppContent`  [INFERRED]
  CODING_CONVENTIONS.md → src/App.tsx
- `Analytics Documentation` --references--> `initGa4Bootstrap`  [EXTRACTED]
  docs/8_analytics.md → src/lib/ga4.ts
- `startServer` --references--> `defineConfig`  [INFERRED]
  server.ts → vite.config.ts
- `Project README` --conceptually_related_to--> `Render Blueprint`  [INFERRED]
  README.md → render.yaml
- `AnalysisProvider` --calls--> `verify-recaptcha`  [EXTRACTED]
  src/context/AnalysisContext.tsx → supabase/functions/verify-recaptcha/index.ts

## Communities (39 total, 18 thin omitted)

### Community 0 - "App Shell & Result UI"
Cohesion: 0.13
Nodes (31): useAnalysis(), useAuth(), Tab, UIContext, UIContextType, useUI(), CookieConsentBanner(), Header() (+23 more)

### Community 1 - "AI Analysis & Types"
Cohesion: 0.08
Nodes (29): SupabaseConfigError(), AnalysisContext, AnalysisContextType, AuthContext, AuthContextType, AuthProvider(), bootstrapSupabase(), createSupabaseClient() (+21 more)

### Community 2 - "Express & Edge Functions"
Cohesion: 0.09
Nodes (33): AnalysisProvider(), UIProvider(), CookieConsentBannerProps, Footer(), InAppBrowserWarning(), AnalyticsConsent, applyGrantedConsent(), denyAnalyticsConsent() (+25 more)

### Community 3 - "Supabase Auth & Users"
Cohesion: 0.14
Nodes (30): analyzeCV(), parseGeminiJson(), isRecord(), normalizeParsedCV(), coerceJsonField(), detailedComparisonHasRows(), IMPACTS, normalizeAnalysisPayload() (+22 more)

### Community 4 - "i18n Translations"
Cohesion: 0.06
Nodes (20): binaryString, bytes, corsHeaders, router, params, resendClient, router, buffer (+12 more)

### Community 5 - "CV Markdown & Optimization"
Cohesion: 0.11
Nodes (14): admin, footer, history, LocaleEntry, SECTIONS, UI_LABELS, input, landing (+6 more)

### Community 6 - "GA4 Analytics & Consent"
Cohesion: 0.16
Nodes (15): cvMarkdownHasHeadings(), fixMarkdownHeadingHashes(), fullRewrittenCvToPlainText(), isBulletLine(), isSectionLine(), normalizeSectionCandidate(), preprocessFullRewrittenCvMarkdown(), promotePlainTextCvToMarkdown() (+7 more)

### Community 8 - "Landing Page Marketing"
Cohesion: 0.18
Nodes (11): AnalysisProvider, AnalysisInputView, analyzeCV, extract-pdf, verify-recaptcha, extractJDFromUrl, trackEvent, getGeminiClient (+3 more)

### Community 9 - "Legacy Match Scoring"
Cohesion: 0.29
Nodes (5): Props, Candidate, JobDescription, MatchScoreBreakdown, Window

### Community 10 - "Gemini Extraction"
Cohesion: 0.25
Nodes (8): useAnalysis, Analytics Documentation, AppContent, useAuth, Coding Conventions, initGa4Bootstrap, restoreAnalyticsConsent, useUI

### Community 11 - "Error Boundary"
Cohesion: 0.52
Nodes (5): extractJDFromUrl(), extractTextFromImage(), ensureApiKey(), getGeminiClient(), loadKeyFromConfig()

### Community 12 - "Vite Build & GA Tag"
Cohesion: 0.29
Nodes (7): cv-files Storage Bucket, History Table, increment_usage_count Function, is_admin Function, Profiles Table, Saved JDs Table, Auth Users

### Community 14 - "Vercel API Config"
Cohesion: 0.4
Nodes (5): AuthProvider, send-email, rateAnalysis, RatingSection, getUserProfile

### Community 19 - "Privacy Policy Page"
Cohesion: 0.67
Nodes (3): startServer, defineConfig, googleTagHtmlPlugin

### Community 20 - "Terms of Service Page"
Cohesion: 0.67
Nodes (3): CvMarkdownBody, preprocessFullRewrittenCvMarkdown, OptimizationTab

## Knowledge Gaps
- **97 isolated node(s):** `env`, `resend`, `router`, `params`, `resendClient` (+92 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **18 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useUI()` connect `App Shell & Result UI` to `AI Analysis & Types`, `Express & Edge Functions`, `GA4 Analytics & Consent`, `Analysis Context & History`?**
  _High betweenness centrality (0.090) - this node is a cross-community bridge._
- **Why does `cn()` connect `App Shell & Result UI` to `AI Analysis & Types`, `Express & Edge Functions`, `GA4 Analytics & Consent`, `Analysis Context & History`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **Why does `mapHistory()` connect `Supabase Auth & Users` to `AI Analysis & Types`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **What connects `env`, `resend`, `router` to the rest of the system?**
  _97 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `App Shell & Result UI` be split into smaller, more focused modules?**
  _Cohesion score 0.13 - nodes in this community are weakly interconnected._
- **Should `AI Analysis & Types` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `Express & Edge Functions` be split into smaller, more focused modules?**
  _Cohesion score 0.09 - nodes in this community are weakly interconnected._