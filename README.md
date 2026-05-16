# CV Matcher & Optimizer - Repository Overview

## 1. Tech Stack

### Frontend
- **Framework:** React 19 with Vite
- **Styling:** Tailwind CSS v4, `clsx`, `tailwind-merge`
- **Animations:** [Motion](https://motion.dev/) (`motion` — API `motion/react`)
- **Icons:** Lucide React
- **Markdown Rendering:** `react-markdown`, `rehype-raw`, `rehype-sanitize`, `remark-gfm`, `remark-breaks`
- **Charts:** Recharts
- **PDF/Docx Processing:** `pdfjs-dist`, `mammoth`
- **Analytics:** Vercel Analytics (`@vercel/analytics`)
- **Security:** Google reCAPTCHA v3
- **Design Philosophy:** **Industrial Utilitarian** (High-precision, data-centric, and premium tactile feedback)

### Backend (Modular Express)
- **Platform:** Node.js 20+
- **PDF Extraction:** `pdf-parse`
- **Email Service:** Resend (for feedback and welcome emails)
- **Modular Routes:** Logic is split into specialized handlers in `server/routes/`.

### Database & Auth
- **BaaS:** Supabase (PostgreSQL, Authentication)
- **AI Integration:** Google Gemini 3.0 Flash (`@google/genai`) - Modular Service in `src/services/ai/`.

## 2. Folder Structure

```text
/
├── server/                 # Backend Route Handlers
│   ├── routes/
│   │   ├── config.ts       # Public config delivery
│   │   ├── recaptcha.ts    # ReCAPTCHA verification
│   │   ├── feedback.ts     # Feedback submission
│   │   ├── welcomeEmail.ts # Welcome email logic
│   │   └── pdf.ts          # PDF text extraction
├── src/                    # Frontend (React 19, Vite)
│   ├── services/
│   │   └── ai/             # Gemini AI + payload normalize + fullRewrittenCvMarkdown
│   └── lib/
│       └── supabase.ts     # Supabase Client configuration
├── supabase/               # Migrations & Edge Functions (.temp/ ignored)
├── docs/                   # Technical docs (vi) — see docs/1_overview.md
├── server.ts               # Main Express Entry Point
├── .env.example            # Env template (copy → .env, never commit .env)
├── package.json            # Main project dependencies
└── README.md
```

## 3. Deployment

### Frontend & API (Vercel)
- Push code to GitHub and connect to Vercel.
- Configure environment variables in Vercel Dashboard.
- The application is configured to run as a SPA with a companion API.

### Database (Supabase)
- Create a Supabase project.
- Apply SQL migrations from `supabase/migrations/` (recommended: `supabase link` then `supabase db push`, or run each file in order in the SQL Editor). Core tables: `profiles`, `history` (includes `parsed_cv` JSONB), `saved_jds`; RPC `increment_usage_count`; storage bucket `cv-files`; RLS policies match `src/services/userService.ts` and `historyService.ts`.
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
| `graphify-out/cache/` | Graphify AST cache (regenerate with `graphify update .`) |

Detailed deployment and Supabase setup: [`docs/7_deployment.md`](docs/7_deployment.md). Full documentation index: [`docs/1_overview.md`](docs/1_overview.md).
