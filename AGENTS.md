# AI Studio Agent Instructions

This file contains custom instructions and context for the AI Studio Build agent. The agent will automatically read this file to understand the project's specific conventions, architecture, and rules.

## Project Context
- **Name:** CV Matcher & Optimizer
- **Purpose:** A web application that analyzes user CVs against Job Descriptions (JDs) using AI (Gemini), provides ATS optimization feedback, and generates a rewritten CV.
- **Primary Language:** Vietnamese (`vi`), with support for English (`en`).
- **Architecture:** Full-stack React application. Frontend built with Vite, React 19, and Tailwind CSS. Backend is an Express server running on Node.js, handling API proxying (like PDF extraction and email sending) and serving the built frontend.
- **Database/Auth:** Firebase (Firestore and Authentication).

## Core Directives

### 1. Code Style & Conventions
- **Strictly adhere to `CODING_CONVENTIONS.md`.** Read it if you haven't already.
- **Tailwind CSS:** Use Tailwind for all styling. Utilize the `cn` utility (combining `clsx` and `tailwind-merge`) for conditional class names.
- **Interactive Elements:** All buttons and clickable elements MUST have `cursor-pointer` and interactive scale effects (`hover:scale-105 active:scale-95`) unless there is a specific design reason not to.
- **Icons:** Use `lucide-react` for all icons.

### 2. Architecture & Data Flow
- **Backend Integration:** The Express server (`server.ts`) handles sensitive operations or operations that require specific Node.js libraries (like `pdf-parse` for complex PDFs or `resend` for emails). Do not expose secret keys in the frontend.
- **Firebase:** Use the existing `src/firebase.ts` setup. Respect the schemas defined in `firebase-blueprint.json` and ensure any new database interactions comply with `firestore.rules`.
- **AI (Gemini):** All interactions with the Gemini API should go through `src/services/aiService.ts`. Maintain the structured JSON output format defined in the prompts.

### 3. UI/UX Guidelines
- **Aesthetic Stance:** Follow the **Industrial Utilitarian** design language. Focus on high-precision layouts, clear boundaries (borders over shadows), and data-centric aesthetics.
- **Navigation Standards:**
    - Mobile uses **Bottom Navigation** as the primary source. Header links are hidden on small screens.
    - Result views utilize **Sticky Headers** with high-craft interactive elements (Framer Motion `layoutId`).
    - Implement **Smart Auto-Scroll** when transitioning between long content sections.
- **Language:** Default to Vietnamese for all user-facing text unless the user specifically requests English or the context dictates otherwise.
- **Animations:** Use `framer-motion` for smooth transitions (e.g., sliding tab backgrounds, modals).

### 4. Specific Workflows
- **File Processing:** Be aware that file processing is split. Simple text/images are handled client-side, while complex PDFs are sent to the `/api/extract-pdf` endpoint.
- **Feedback System:** Feedback submission requires reCAPTCHA verification on the backend before sending an email via Resend.

### 5. Agent Behavior
- **Proactive Verification:** After making significant changes, especially to `App.tsx` or `server.ts`, always run `lint_applet` and `compile_applet` to ensure no syntax errors or build failures were introduced.
- **Targeted Edits:** When using `edit_file` or `multi_edit_file`, ensure the `TargetContent` is precise and unique to avoid "target content not found" errors. Use `view_file` immediately before editing if you are unsure of the exact current state.
