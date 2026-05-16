# AI Studio Agent Instructions

This file contains custom instructions and context for the AI Studio Build agent. The agent will automatically read this file to understand the project's specific conventions, architecture, and rules.

## Project Context
- **Name:** CV Matcher & Optimizer
- **Purpose:** A web application that analyzes user CVs against Job Descriptions (JDs) using AI (Gemini), provides ATS optimization feedback, and generates a rewritten CV.
- **Primary Language:** Vietnamese (`vi`), with support for English (`en`).
- **Architecture:** Full-stack React application. Frontend built with Vite, React 19, and Tailwind CSS. Backend is an Express server running on Node.js, handling API proxying (like PDF extraction and email sending) and serving the built frontend. Production hosting and serverless API routes use **Vercel** (`/api`, `vercel.json`).
- **Database/Auth:** **Supabase** (PostgreSQL, Authentication, Storage). Client setup lives in `src/lib/supabase.ts`; optional Edge Functions live under `supabase/functions/`.

## Core Directives

### 1. Code Style & Conventions
- **Strictly adhere to `CODING_CONVENTIONS.md`.** Read it if you haven't already.
- **Tailwind CSS:** Use Tailwind for all styling. Utilize the `cn` utility (combining `clsx` and `tailwind-merge`) for conditional class names.
- **Interactive Elements:** All buttons and clickable elements MUST have `cursor-pointer` and interactive scale effects (`hover:scale-105 active:scale-95`) unless there is a specific design reason not to.
- **Database/Auth:** Supabase only — align tables/RLS with the schema applied in the Supabase project (SQL migrations or dashboard).

### 2. Architecture & Data Flow
- **Backend Integration:** The modular Express server (`server.ts` and `server/routes/`) handles sensitive operations or operations that require specific Node.js libraries (like `pdf-parse` for complex PDFs or `resend` for emails). Do not expose secret keys in the frontend.
- **Supabase:** Use the existing `src/lib/supabase.ts` setup. Ensure any new database interactions comply with the established schema.
- **AI (Gemini):** All interactions with the Gemini API are handled by the modular service in `src/services/ai/`. Maintain the structured JSON output format.

### 3. UI/UX Guidelines
- **Aesthetic Stance:** Follow the **Industrial Utilitarian** design language. Focus on high-precision layouts, clear boundaries (borders over shadows), and data-centric aesthetics.
- **Navigation Standards:**
    - Mobile uses **Bottom Navigation** as the primary source. Header links are hidden on small screens.
    - Result views utilize **Sticky Headers** with high-craft interactive elements (Motion `layoutId` via `motion/react`).
    - Implement **Smart Auto-Scroll** when transitioning between long content sections.
- **Language:** Default to Vietnamese for all user-facing text unless the user specifically requests English or the context dictates otherwise.
- **Animations:** Use [Motion](https://motion.dev/) (`motion/react`) for smooth transitions (e.g., sliding tab backgrounds, modals).

### 6. Secrets & Repository Hygiene
- **Never commit** `.env`, `.env.local`, private keys (`*.pem`, SSH keys), `credentials.json`, `service-account*.json`, or Supabase CLI cache (`supabase/.temp/`). See root `.gitignore` and `.env.example`.
- **Local backups** (`users_backup.json`, `*-backup.json`) may contain PII — keep out of Git.
- **Graphify:** Ignore `graphify-out/cache/` (AST cache); regenerate with `graphify update .` after clone.
- **Vercel:** `.vercel/` is ignored locally; configure secrets in the Vercel Dashboard, not in tracked files.

### 4. Specific Workflows
- **File Processing:** Simple text/images are handled client-side; PDF text extraction uses **`POST /api/extract-pdf`** on Vercel (`api/extract-pdf.ts`) and **`POST /api/extract-pdf/extract`** when running the Express server (`npm start` → `server/routes/pdf.ts`). Optional Supabase Edge Function `extract-pdf` may be used for some JD flows (`supabase.functions.invoke`).
- **Feedback System:** Feedback submission requires reCAPTCHA verification on the backend before sending an email via Resend.

### 5. Agent Behavior
- **Proactive Verification:** After significant changes to `App.tsx` or `server.ts`, run **`npm run lint`** (TypeScript) and **`npm run build`** when you need to validate the full Vite bundle.
- **Targeted Edits:** When using `edit_file` or `multi_edit_file`, ensure the `TargetContent` is precise and unique to avoid "target content not found" errors. Use `view_file` immediately before editing if you are unsure of the exact current state.
