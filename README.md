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
- **Security:** `react-google-recaptcha-v3`

### Backend
- **Server:** Node.js, Express 5
- **Execution:** `tsx` (for running TypeScript directly)
- **PDF Extraction:** `pdf-parse`
- **Email Service:** Resend (for feedback emails)
- **CORS:** `cors`

### Database & Auth
- **BaaS:** Firebase (Authentication, Firestore)
- **AI Integration:** Google Gemini API (`@google/genai`)

## 2. Folder Structure

```text
/
├── public/                 # Static assets
├── src/                    # Frontend (React 19, Vite)
├── functions/              # Backend (Firebase Cloud Functions)
│   ├── src/index.ts        # Cloud Functions entry point (Express API)
│   └── package.json        # Backend dependencies
├── firestore.rules         # Security rules
├── storage.rules           # Storage rules
├── firebase.json           # Firebase config (Hosting + Functions)
├── package.json            # Main project dependencies
└── README.md
```

## 4. Deployment Flow (Firebase)

The application uses **Firebase Hosting** for the frontend and **Firebase Functions** for the API logic.

### 1. Prerequisites
- Ensure you are on the **Blaze (Pay-as-you-go) Plan** in Firebase Console.
- Install Firebase CLI: `npm install -g firebase-tools`.
- Login: `firebase login`.

### 2. Configuration (Secrets)
You must set your API keys as Firebase Secrets before deploying:
```bash
firebase functions:secrets:set GEMINI_API_KEY
firebase functions:secrets:set RECAPTCHA_SECRET_KEY
firebase functions:secrets:set RESEND_API_KEY
```

### 3. Deploy
```bash
# Build frontend
npm run build

# Deploy all (Hosting + Functions)
firebase deploy
```

## 5. Environment Variables (Local Development)

For local development using `npm run dev`:
1. Create a `.env` file in the root directory.
2. Add necessary keys: `GEMINI_API_KEY`, `RECAPTCHA_SECRET_KEY`, `RESEND_API_KEY`.
3. The frontend uses `VITE_RECAPTCHA_SITE_KEY`.

## 5. Environment Variables

The application requires the following environment variables. In development, these should be placed in a `.env` file at the root of the project.

### Required
-   `GEMINI_API_KEY`: Your Google Gemini API key for AI analysis.
-   `VITE_RECAPTCHA_SITE_KEY`: The public site key for Google reCAPTCHA v3 (used in the frontend).
-   `RECAPTCHA_SECRET_KEY`: The secret key for Google reCAPTCHA v3 (used in the backend for verification).

### Optional (but recommended for full functionality)
-   `RESEND_API_KEY`: Your Resend API key for sending user feedback emails. If missing, the feedback submission will fail gracefully.

### Firebase Configuration
Firebase configuration is managed via the `firebase-applet-config.json` file, which is automatically generated and read by `src/firebase.ts`. It does not strictly use `.env` variables for initialization in this specific setup, but relies on the JSON file.
