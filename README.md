# cvFit - Repository Overview

## 1. Tech Stack

### Frontend
- **Framework:** React 19 with Vite
- **Styling:** Tailwind CSS v4, `clsx`, `tailwind-merge`
- **Animations:** [Motion](https://motion.dev/) (`motion` — API `motion/react`)
- **Icons:** Lucide React
- **Markdown Rendering:** `react-markdown`, `rehype-raw`, `rehype-sanitize`, `remark-gfm`, `remark-breaks`
- **Charts:** Recharts
- **PDF/Docx Processing:** `pdfjs-dist`, `mammoth`
- **Analytics:** Vercel Analytics + GA4 (cookie consent) — xem [`docs/8_analytics.md`](docs/8_analytics.md)
- **Security:** Google reCAPTCHA v3
- **Design Philosophy:** **Industrial Utilitarian** (High-precision, data-centric, and premium tactile feedback)

### Backend (Modular Express)
- **Platform:** Node.js 20+
- **PDF Extraction:** `pdf-parse`
- **Email Service:** Resend (for feedback and welcome emails)
- **Modular Routes:** Logic is split into specialized handlers in `server/routes/`.

### Database & Auth
- **BaaS:** Supabase (PostgreSQL, Authentication)
- **AI Integration:** Google Gemini 3 Flash Preview (`@google/genai`) - Modular Service in `src/services/ai/`.

## 2. Folder Structure

```text
/
├── api/                    # Vercel serverless routes (e.g. extract-pdf)
├── server/routes/          # Express handlers (pdf, feedback, config, …)
├── src/
│   ├── App.tsx             # Re-export → app/AppShell
│   ├── app/                # Shell: providers, AppContent, modals, bottom nav
│   ├── context/
│   │   ├── analysis/       # AnalysisRun + SavedJd providers, useAnalysis()
│   │   ├── AuthContext.tsx
│   │   └── UIContext.tsx
│   ├── components/views/
│   │   ├── LandingView.tsx
│   │   ├── landing/        # Hero, FAQ, CTA, … sections
│   │   ├── DashboardView.tsx
│   │   └── …
│   ├── services/ai/        # Gemini + normalize + rewritten CV markdown
│   └── lib/                # supabase, ga4, utils
├── scripts/                # Dev utilities (e.g. test-resend.ts)
├── supabase/               # Migrations & Edge Functions (.temp/ ignored)
├── docs/                   # Technical docs (vi) — docs/1_overview.md
├── graphify-out/
│   └── GRAPH_REPORT.md     # Only this file tracked in Git
├── server.ts
├── .env.example
└── README.md
```

API routing (Vercel vs Express vs Edge): [`docs/9_api_routes.md`](docs/9_api_routes.md).
```

## 3. Deployment

### Frontend & API (Vercel)
- Push code to GitHub repo `nghiepnguyen/CVCompareTN`.
- Connect the repo to Vercel project **`cvcompare`** (not `cv-compare-tn`). Production: `https://cvfit.pro`.
- Configure environment variables in the **`cvcompare`** project on Vercel Dashboard.
- The application is configured to run as a SPA with a companion API. If Git push deploys the wrong Vercel project, see [`docs/7_deployment.md`](docs/7_deployment.md) (section *Project Vercel đúng*).

### Database (Supabase)
- Create a Supabase project.
- Apply SQL migrations from `supabase/migrations/` in order (recommended: `supabase link` then `supabase db push`, or SQL Editor). Includes: core schema (`profiles`, `history`, `saved_jds`), monthly analysis quota (`check_analytics_quota`, `increment_usage_count`), and runtime default limit table **`app_settings`** (default **20** analyses/user/month — change via Admin or SQL without redeploying Vercel). See [`docs/7_deployment.md`](docs/7_deployment.md) and [`docs/8_analytics.md`](docs/8_analytics.md).
- If you already have `history` without parsed CV storage, run `supabase/migrations/20260516120100_history_add_parsed_cv.sql`.
- Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

## 4. Mobile-First Optimization

The application is built with a **Mobile-First** and **Industrial Utilitarian** approach:
- **Bottom Navigation:** Quick access to main features (Analyze, History, Saved JDs).
- **Sticky Result Navigation:** Fluid navigation with animated "Scan Line" indicators.
- **Optimized Action Bar:** Height-enforced (60px) mobile controls.
- **Touch-Friendly Targets:** Elements meet the 44x44px touch target standard.

## 5. Environment Variables

### Required
- `GEMINI_API_KEY`: Google Gemini API key.
- `VITE_SUPABASE_URL`: Supabase project URL.
- `VITE_SUPABASE_ANON_KEY`: Supabase anonymous key.
- `VITE_RECAPTCHA_SITE_KEY`: Google reCAPTCHA v3 site key.
- `RECAPTCHA_SECRET_KEY`: Google reCAPTCHA v3 secret key.

### Optional
- `RESEND_API_KEY`: Resend API key for emails.
- `FEEDBACK_RECIPIENT_EMAIL` / `VITE_FEEDBACK_RECIPIENT_EMAIL`: Email for feedback notifications.
- `RESEND_FROM_EMAIL`: Authorized sender email.
- `VITE_ADMIN_EMAIL`: Email allowed to access Admin view.
- `SUPABASE_SERVICE_ROLE_KEY`: Server-side / migrations only — **never** expose to the frontend bundle.

Copy `.env.example` to `.env` for local development. Only `.env.example` is tracked in Git.

## 6. Security & Git

Secrets and machine-specific files are excluded via `.gitignore`:

| Pattern | Reason |
|---------|--------|
| `.env*` (except `.env.example`) | API keys, Supabase, reCAPTCHA secrets |
| `supabase/.temp/` | Supabase CLI cache (project ref, pooler URL) |
| `.vercel/` | Local Vercel project linkage |
| `*.pem`, `id_rsa*`, `credentials.json`, `service-account*.json` | Keys and cloud credential dumps |
| `users_backup.json`, `*-backup.json` | Local exports that may contain PII |
| `graphify-out/*` (except `GRAPH_REPORT.md`) | Graphify artifacts — regenerate with `graphify update .` |

Detailed deployment and Supabase setup: [`docs/7_deployment.md`](docs/7_deployment.md). Full documentation index: [`docs/1_overview.md`](docs/1_overview.md).
