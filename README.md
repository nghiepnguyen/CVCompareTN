# CV Matcher & Optimizer - Repository Overview

## 1. Tech Stack

### Frontend
- **Framework:** React 19 with Vite
- **Styling:** Tailwind CSS v4, `clsx`, `tailwind-merge`
- **Animations:** Framer Motion
- **Icons:** Lucide React
- **Markdown Rendering:** `react-markdown`, `rehype-raw`, `rehype-sanitize`, `remark-gfm`, `remark-breaks`
- **Charts:** Recharts
- **PDF/Docx Processing:** `pdfjs-dist`, `mammoth`
- **Analytics:** Vercel Analytics (`@vercel/analytics`)
- **Security:** `react-google-recaptcha-v3`
- **Design Philosophy:** **Industrial Utilitarian** (High-precision, data-centric, and premium tactile feedback)

### Backend
- **Platform:** Vercel Serverless Functions (Node.js 20+)
- **PDF Extraction:** `pdf-parse`
- **Email Service:** Resend (for feedback and welcome emails)

### Database & Auth
- **BaaS:** Firebase (Authentication, Firestore)
- **AI Integration:** Google Gemini 3.0 Flash (`@google/genai`)

## 2. Folder Structure

```text
/
├── api/                    # Vercel Serverless Functions (Node.js/TypeScript)
│   ├── verify-recaptcha.ts # ReCAPTCHA v3 verification
│   ├── extract-pdf.ts     # Complex PDF text extraction
│   └── send-feedback.ts    # Email notification via Resend
├── src/                    # Frontend (React 19, Vite)
├── firestore.rules         # Security rules
├── firebase.json           # Firebase config (Auth + Firestore)
├── package.json            # Main project dependencies
└── README.md
```

The application is optimized for **Vercel** (Frontend & API) and uses **Firebase** for Authentication and Database.

### 1. Vercel Deployment (Recommended)
- Push code to GitHub and connect to Vercel.
- Configure environment variables in Vercel Dashboard.
- The `/api` directory will automatically be deployed as Serverless Functions.

### 2. Firebase Setup (Auth & DB)
- Create a Firebase project.
- Enable **Authentication** (Google Sign-In).
- Enable **Firestore Database**.
- Deploy security rules: `firebase deploy --only firestore:rules`.

## 5. Mobile-First Optimization

The application is built with a **Mobile-First** and **Industrial Utilitarian** approach to ensure the best experience on all devices, focusing on a **High-Craft** and **Memorable** user journey:
- **Bottom Navigation:** Quick access to main features (Analyze, History, Saved JDs) for one-handed use.
- **Sticky Result Navigation:** High-craft navigation bar for analysis results with fluid `layoutId` transitions and an animated "Scan Line" indicator.
- **Optimized Action Bar:** Balanced 50/50 layout on desktop and height-enforced (60px) mobile controls for consistency.
- **Bottom Sheets:** Native-like modal experience for mobile users.
- **Responsive Layouts:** Optimized padding and card-based views instead of tables on small screens.
- **Touch-Friendly Targets:** All interactive elements meet the minimum 44x44px touch target standard.

## 5. Environment Variables

The application requires the following environment variables. In development, these should be placed in a `.env` file at the root of the project.

### Required
-   `GEMINI_API_KEY`: Your Google Gemini API key for AI analysis.
-   `VITE_RECAPTCHA_SITE_KEY`: The public site key for Google reCAPTCHA v3 (used in the frontend).
-   `RECAPTCHA_SECRET_KEY`: The secret key for Google reCAPTCHA v3 (used in the backend for verification).

### Optional (but recommended for full functionality)
-   `RESEND_API_KEY`: Your Resend API key for sending user feedback emails. If missing, the feedback submission will fail gracefully.
-   `FEEDBACK_RECIPIENT_EMAIL`: The recipient email for feedback notifications.
-   `RESEND_FROM_EMAIL`: The sender email address (authorized in Resend).

### Firebase Configuration
Firebase configuration is managed via the `firebase-applet-config.json` file, which is automatically generated and read by `src/firebase.ts`. It does not strictly use `.env` variables for initialization in this specific setup, but relies on the JSON file.
